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
import { describirError, stackDe } from '../../common/observability/describir-error';
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

    // ─────────────────────────────────────────────────────────────────────
    // Deduplicación: Google entrega cada aviso dos veces
    //
    // Medido en producción el 2026-08-13: dos push con el **mismo
    // `historyId`** separados por 15 ms, que producen dos jobs de
    // sincronización. El segundo no encuentra nada porque el primero ya avanzó
    // el marcador, así que no corrompe datos — pero duplica el trabajo: dos
    // consultas a Gmail y dos rondas de escrituras en Redis por cada correo.
    // Con Upstash en el plan gratuito eso importa.
    //
    // ⚠️ **La clave es el `historyId`, no el `messageId`**, y esa diferencia es
    // el hallazgo. El `jobId: messageId` de aquí abajo ya deduplicaba, y aun
    // así entraron los dos: **los dos avisos traían `messageId` distinto**, así
    // que son entregas separadas de Google y no un reintento del mismo mensaje.
    // Deduplicar por `messageId` habría dejado pasar exactamente el caso que
    // estamos viendo.
    //
    // `SET NX EX` es atómico: si la clave ya existe devuelve `null` y no hay
    // ventana entre comprobar y escribir por la que dos peticiones concurrentes
    // puedan colarse. 10 minutos de vida sobran —los duplicados llegan con
    // milisegundos de diferencia— y evitan que la clave se quede para siempre.
    //
    // Si Redis falla, se deja pasar: perder un correo es peor que procesarlo
    // dos veces, y el duplicado ya se sabe inofensivo.
    //
    // ⚠️ **Y si el encolado falla, la clave se borra** (ver el `catch` de más
    // abajo). Esto no es cosmético: la primera versión de esta deduplicación
    // marcaba el aviso como visto **antes** de encolarlo, y en producción había
    // 27 fallos de encolado en dos días que se recuperaban solos precisamente
    // porque la segunda entrega de Google volvía a intentarlo 4 ms después.
    // Reservar la clave por adelantado convertía esa red de seguridad en un
    // silencio de diez minutos: el primer aviso fallaba al encolar y el
    // segundo —el que salvaba el correo— se descartaba por duplicado.
    // Deduplicar lo hecho es correcto; deduplicar lo intentado pierde correos.
    const claveDeAviso = `gmail:webhook:${payload.emailAddress}:${payload.historyId ?? 'sin-history'}`;
    let reservada = false;

    try {
      // El cliente real es ioredis —BullMQ lo usa por dentro— y acepta el `SET`
      // completo, pero la interfaz `IRedisClient` que BullMQ declara solo
      // expone `{PX, EX}`, sin `NX`. Se declara aquí la firma que sí existe en
      // tiempo de ejecución en vez de añadir `ioredis` como dependencia
      // directa: lo que se necesita es una sola sobrecarga, y el paquete ya
      // está instalado como transitiva.
      //
      // Sin `NX` no hay forma atómica de hacer esto: comprobar y escribir por
      // separado deja una ventana entre las dos llamadas por la que se cuelan
      // exactamente los duplicados que llegan con 15 ms de diferencia.
      const redis = (await this.gmailQueue.client) as unknown as {
        set(
          clave: string,
          valor: string,
          modoExpiracion: 'EX',
          segundos: number,
          modoExistencia: 'NX',
        ): Promise<string | null>;
      };

      const primero = await redis.set(claveDeAviso, '1', 'EX', 600, 'NX');

      if (primero === null) {
        this.logger.log(
          `Aviso duplicado de Gmail ignorado (${payload.emailAddress}, historyId ${payload.historyId ?? 'n/d'})`,
        );
        return 'OK';
      }

      reservada = true;
    } catch (err) {
      this.logger.warn(
        `No se pudo comprobar si el aviso estaba duplicado; se procesa igualmente: ${describirError(err)}`,
        stackDe(err),
      );
    }

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
      //
      // Y el motivo va en el mensaje: durante dos días este error se registró
      // 27 veces **sin decir cuál era**, porque el objeto iba en la ranura del
      // stack y el formateador lo tiraba. «¿Redis caído?» era una pregunta,
      // no un diagnóstico.
      this.logger.error(
        `No se pudo encolar la sincronización de ${payload.emailAddress}: ${describirError(err)}`,
        stackDe(err),
      );

      // Se libera la reserva para que la **segunda entrega de Google vuelva a
      // intentarlo**. Esa entrega duplicada lleva dos días siendo, sin que
      // nadie lo supiera, la red de seguridad de este fallo: el reintento
      // llega ~4 ms después y sí encola. Dejar la clave puesta la anularía
      // durante diez minutos y el correo se perdería en silencio.
      if (reservada) {
        try {
          const redis = await this.gmailQueue.client;
          await redis.del(claveDeAviso);
        } catch (errBorrado) {
          this.logger.warn(
            `No se pudo liberar la clave de deduplicación ${claveDeAviso}; ` +
              `el reintento de Google se descartará como duplicado: ${describirError(errBorrado)}`,
            stackDe(errBorrado),
          );
        }
      }
    }

    return 'OK';
  }
}
