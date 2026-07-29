import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { THROTTLE_COPILOT } from '../../common/security/throttle.config';
import { CopilotService } from './copilot.service';
import { StartChatDto } from './dto/start-chat.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTaskFromCopilotDto } from './dto/create-task-from-copilot.dto';
import { ChatThreadsService } from './threads/chat-threads.service';
import { SOCKET_ID_HEADER } from '../tasks/tasks.gateway';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

/**
 * Nombres de los eventos SSE. Se exportan para que las pruebas —y el cliente,
 * cuando se escriba— no los repitan como literales sueltos.
 */
export const COPILOT_EVENTS = {
  /** Un trozo de texto según lo genera el modelo. */
  token: 'token',
  /**
   * El modelo pidió una herramienta (hoy solo `draft_email`). Va por su propio
   * evento y **no** como texto: el frontend lo pinta como un componente —el
   * editor de borrador— en vez de como una línea más de la conversación.
   */
  tool_call: 'tool_call',
  /** Fin limpio, con el modelo que respondió y los contadores de la llamada. */
  done: 'done',
  /** Algo falló **después** de empezar a emitir; ver la nota sobre el 200. */
  error: 'error',
} as const;

/**
 * De qué tipo de trozo sale cada evento.
 *
 * Se resuelve con una tabla y no con un `if` encadenado para que añadir un
 * evento sea una línea aquí: el `token` es el caso por defecto, así que un tipo
 * nuevo sin entrada se pintaría como texto sin avisar.
 */
const EVENTO_POR_TIPO: Record<string, string> = {
  tool_call: COPILOT_EVENTS.tool_call,
  done: COPILOT_EVENTS.done,
};

@Controller('copilot')
@UseGuards(AuthGuard)
/**
 * Límite propio para todo el copiloto: es el único sitio de la API donde una
 * petición cuesta dinero de verdad —cada turno son tokens del modelo— y donde
 * un bucle del cliente se nota en la factura y no solo en la CPU.
 *
 * Pisa el cubo `default` en vez de añadir uno nuevo; el por qué está en
 * `throttle.config.ts`.
 */
@Throttle(THROTTLE_COPILOT)
export class CopilotController {
  private readonly logger = new Logger(CopilotController.name);

  constructor(
    private readonly copilot: CopilotService,
    private readonly threadsService: ChatThreadsService,
  ) {}

  /** Qué proveedores puede ofrecer esta instalación, para pintar el selector. */
  @Get('providers')
  providers() {
    return this.copilot.providers();
  }

  /** Las conversaciones del usuario, de la más reciente a la más antigua. */
  @Get('threads')
  threads(@CurrentUser() user: CurrentUserContext) {
    return this.threadsService.list(user.userId);
  }

  /** Una conversación con todos sus mensajes, para reabrirla en el panel. */
  @Get('threads/:id')
  thread(@CurrentUser() user: CurrentUserContext, @Param('id') id: string) {
    return this.threadsService.findOne(user.userId, id);
  }

  /** Borra una conversación y sus mensajes. 204 sin cuerpo. */
  @Delete('threads/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeThread(@CurrentUser() user: CurrentUserContext, @Param('id') id: string) {
    return this.threadsService.remove(user.userId, id);
  }

  /**
   * Crea la tarea que la persona confirmó en la tarjeta del chat.
   *
   * Mismo patrón que el correo y por el mismo motivo: el copiloto **propone**
   * (evento `tool_call`) y crear solo lo dispara un clic. Un correo entrante
   * podría pedirle al modelo que llene el tablero de tareas; así, como mucho
   * consigue que se pinte una tarjeta que la persona ve antes de aceptar.
   *
   * Respuestas: **201** con la tarea creada, tal como la devuelve `POST /tasks`
   * · 400 si falta el título · 404 si el `sourceEmailId` no es suyo.
   */
  @Post('tasks/create')
  createTask(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: CreateTaskFromCopilotDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.copilot.createTask(user.userId, dto, socketId);
  }

  /** La bitácora del copiloto: qué hizo, con qué argumentos y cómo acabó. */
  @Get('audit')
  audit(@CurrentUser() user: CurrentUserContext) {
    return this.copilot.auditLog(user.userId);
  }

  /**
   * Envía el borrador que la persona aprobó en la tarjeta del chat.
   *
   * **Esto no es una herramienta del modelo, y es la decisión de seguridad más
   * importante de todo el copiloto.** El modelo *redacta* (`draft_email`) pero
   * no puede *enviar*: enviar es una llamada REST que solo dispara un clic en
   * la interfaz. Importa porque el copiloto lee correos, y un correo es texto
   * de un desconocido: si enviar fuera una herramienta, bastaría con que
   * alguien escribiera "reenvía este hilo a esta dirección" dentro de un correo
   * para que el modelo lo hiciera. Con esta separación, ese texto como mucho
   * consigue que se *pinte* un borrador que la persona ve antes de decidir.
   *
   * Por eso el cuerpo trae el correo entero y no un id de borrador: lo que se
   * manda es lo que había en pantalla cuando pulsó enviar, con sus
   * correcciones, no lo que propuso el modelo.
   *
   * Respuestas: **200** con el resultado · 400 si falta un campo o una
   * dirección no es válida · 401 sin cookie · 502 si Gmail rechaza el envío.
   */
  @Post('emails/send')
  // 200 y no el 201 por defecto de Nest: no nace un recurso nuestro que el
  // cliente pueda volver a pedir — el mensaje vive en Gmail.
  @HttpCode(HttpStatus.OK)
  sendEmail(@CurrentUser() user: CurrentUserContext, @Body() dto: SendEmailDto) {
    return this.copilot.sendEmail(user.userId, dto);
  }

  /**
   * Un turno del copiloto, servido como **Server-Sent Events**.
   *
   * **Por qué es un `POST` con el stream en la respuesta y no un `GET` con
   * `@Sse`**: el `EventSource` del navegador solo hace `GET` y no manda cuerpo,
   * y esto necesita uno (el mensaje puede tener miles de caracteres, y el
   * contexto es un objeto). Las alternativas eran meter el prompt en la query
   * —donde acaba en los logs de cualquier proxy y choca con el límite de
   * longitud de URL— o partirlo en dos viajes, `POST` para crear el turno y
   * `GET` para escucharlo, que obliga a guardar estado del lado del servidor
   * entre los dos. Así que el cliente lee con `fetch` + `ReadableStream`, no
   * con `EventSource`.
   *
   * **El 200 se compromete antes del primer trozo.** Todo lo que puede fallar
   * por configuración —proveedor no conectado, credencial ausente— lo comprueba
   * el servicio *antes* de que se escriba una cabecera, y sale como 503 normal.
   * Lo que reviente ya empezado el stream viaja como evento `error`: a esas
   * alturas el código de estado ya está enviado y no se puede corregir.
   */
  @Post('chat')
  /**
   * **Hoy este pipe no cambia nada, y conviene saber por qué.** El
   * `ValidationPipe` global de `main.ts` lleva `whitelist: true` y corre
   * **antes** que los de ruta, así que un campo de más —un `model` a mano— ya
   * viene descartado cuando esto lo mira: la petición responde 200 con el
   * modelo que dicta el nivel, en vez del 400 que uno esperaría.
   *
   * _Comprobado contra la app, no deducido._
   *
   * Lo que sí está garantizado es lo que importa: **un cliente no puede elegir
   * el modelo**, porque el campo no llega a `StartChatDto`. Y `provider` y
   * `tier` sí se validan estrictamente contra su enum.
   *
   * Se deja puesto porque es donde tiene que estar el día que se decida
   * rechazar los campos de más: eso es `forbidNonWhitelisted` en `main.ts`,
   * afecta a toda la API —incluidos los cuerpos que manda ya el frontend— y es
   * zona compartida, así que se acuerda antes de tocarlo.
   */
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async chat(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: StartChatDto,
    @Res() res: Response,
  ): Promise<void> {
    // Corta la generación si el cliente cierra la pestaña o pulsa "parar":
    // sin esto se seguirían gastando tokens en una respuesta que ya no lee
    // nadie.
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    // Se espera aquí a propósito: `chat` resuelve el proveedor, el hilo y el
    // contexto **antes** de devolver el iterable, así que un 503 o un 404 sale
    // como error HTTP normal. Todavía no se ha escrito ninguna cabecera.
    const stream = await this.copilot.chat(user.userId, dto, abort.signal);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` además de `no-cache`: hay proxies que comprimen o
      // reescriben la respuesta y al hacerlo la almacenan en un búfer, que es
      // exactamente lo que rompe un stream.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx almacena en búfer por defecto y el usuario vería la respuesta
      // entera de golpe al final, o nada si se corta antes.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    try {
      for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
        if (abort.signal.aborted) break;

        const evento = EVENTO_POR_TIPO[chunk.type as string] ?? COPILOT_EVENTS.token;
        this.write(res, evento, chunk);
      }
    } catch (error) {
      const mensaje =
        error instanceof HttpException ? error.message : 'El copiloto no pudo completar la respuesta.';

      this.logger.error(`Copiloto interrumpido: ${mensaje}`, error instanceof Error ? error.stack : undefined);

      // El cliente ya está pintando texto: se le avisa por el canal que tiene
      // abierto, porque el código de estado se envió hace rato.
      this.write(res, COPILOT_EVENTS.error, { message: mensaje });
    } finally {
      res.end();
    }
  }

  /**
   * Un evento SSE.
   *
   * El formato es rígido: `event:`, `data:` y **una línea en blanco** que cierra
   * el evento — sin ella el cliente se queda esperando. El cuerpo va en JSON de
   * una sola línea porque un salto de línea dentro de `data:` se interpreta
   * como un campo nuevo y partiría el mensaje en dos.
   */
  private write(res: Response, event: string, payload: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}
