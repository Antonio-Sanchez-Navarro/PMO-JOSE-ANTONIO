import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  ParseBoolPipe,
  DefaultValuePipe,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GmailService, EmailSnippet } from './gmail.service';
import { AuthGuard } from '../auth/auth.guard';
import { PubSubAuthGuard } from './pubsub-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

/** Sobre que envía Google Pub/Sub en cada push. */
interface PubSubPushBody {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
}

/** Payload de la notificación de Gmail, una vez decodificado el base64. */
interface GmailNotification {
  emailAddress?: string;
  historyId?: string | number;
}

@Controller()
export class GmailController {
  private readonly logger = new Logger(GmailController.name);

  constructor(
    private readonly gmailService: GmailService,
    @InjectQueue('gmail-sync') private readonly gmailQueue: Queue,
  ) {}

  @Get('gmail/inbox')
  @UseGuards(AuthGuard)
  async getInbox(
    @CurrentUser() user: CurrentUserContext,
    @Query('maxResults', new DefaultValuePipe(20), ParseIntPipe) maxResults: number,
    @Query('includeBody', new DefaultValuePipe(false), ParseBoolPipe) includeBody: boolean,
  ): Promise<EmailSnippet[]> {
    // `AuthGuard` expone el id como `userId` (ver auth.types.ts), no como `id`.
    return this.gmailService.getInbox(user.userId, maxResults, { includeBody });
  }

  /**
   * Recibe los push de Gmail vía Pub/Sub.
   *
   * `PubSubAuthGuard` valida el JWT OIDC antes de llegar aquí. Una vez validado,
   * respondemos 200 incluso ante payloads mal formados: Pub/Sub reintenta con
   * backoff ante cualquier respuesta de error, y un mensaje corrupto no mejora
   * al reintentarse.
   */
  @Post('webhooks/gmail')
  @UseGuards(PubSubAuthGuard)
  /**
   * Exento del límite de peticiones a propósito.
   *
   * Quien llama aquí es Pub/Sub de Google, no un navegador: un 429 no lo
   * disuade, lo reintenta con backoff, y una ráfaga legítima —muchos correos
   * entrando a la vez— se leería como abuso y perdería notificaciones. Lo que
   * protege esta ruta es `PubSubAuthGuard`, que valida la firma OIDC: sin token
   * válido no entra nada, con o sin límite.
   */
  @SkipThrottle()
  @HttpCode(200)
  async handleGmailWebhook(@Body() body: PubSubPushBody) {
    if (!body?.message?.data) {
      this.logger.warn('Recibido webhook inválido (sin body.message.data)');
      return 'OK';
    }

    // Lo que llega dentro de `data` no siempre es una notificación de correo
    // nuevo, y hasta el 2026-08-13 todo lo que no encajara acababa en un
    // `Error parseando payload` sin decir **qué** había llegado. Se repetía cada
    // pocos minutos en producción sin que se pudiera saber si era basura, un
    // duplicado o un aviso legítimo que estábamos tirando.
    //
    // Ahora se separan los tres casos, y solo uno es un error de verdad.
    const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');

    // Recorte defensivo para el log: el cuerpo puede traer datos del buzón y
    // esto va a Cloud Logging, que lo retiene. Con los primeros caracteres
    // sobra para identificar la forma del mensaje.
    const muestra = decoded.slice(0, 200);

    let payload: GmailNotification;
    try {
      payload = JSON.parse(decoded) as GmailNotification;
    } catch {
      this.logger.warn(
        `Payload de webhook de Gmail que no es JSON (messageId ${body.message.messageId ?? 'n/d'}): ${muestra}`,
      );
      return 'OK';
    }

    // JSON válido pero sin buzón al que atribuirlo. Gmail manda avisos de este
    // tipo —de control, o la confirmación del propio `watch`— y **no son un
    // error**: no hay nada que sincronizar y encolar un job sin `emailAddress`
    // haría fallar al worker, que resuelve el usuario por ese campo. Se ignora
    // a propósito, dejando dicho qué era, que es lo que faltaba.
    if (!payload.emailAddress) {
      this.logger.log(`Notificación de Gmail sin emailAddress, ignorada: ${muestra}`);
      return 'OK';
    }

    this.logger.log(
      `Webhook de Gmail recibido para: ${payload.emailAddress} (historyId ${payload.historyId ?? 'n/d'})`,
    );

    try {
      // El worker resuelve el usuario por correo; el historyId viaja con el job
      // para poder avanzar el marcador de sincronización.
      await this.gmailQueue.add(
        'sync-history',
        {
          emailAddress: payload.emailAddress,
          historyId: payload.historyId ? String(payload.historyId) : undefined,
        },
        {
          // Un mismo aviso reintentado por Pub/Sub no debe encolar dos veces.
          jobId: body.message.messageId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (err) {
      // Ya no dice «error parseando»: aquí el payload está parseado y lo que
      // pudo fallar es Redis. Confundir las dos cosas costó el diagnóstico de
      // hoy, porque el mensaje culpaba al remitente de un fallo de la cola.
      this.logger.error(
        `No se pudo encolar la sincronización de ${payload.emailAddress} (¿Redis caído?)`,
        err,
      );
    }

    return 'OK';
  }
}
