import {
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { CopilotService } from './copilot.service';
import { StartChatDto } from './dto/start-chat.dto';
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
export class CopilotController {
  private readonly logger = new Logger(CopilotController.name);

  constructor(private readonly copilot: CopilotService) {}

  /** Qué proveedores puede ofrecer esta instalación, para pintar el selector. */
  @Get('providers')
  providers() {
    return this.copilot.providers();
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

    let stream: AsyncIterable<unknown>;
    try {
      stream = this.copilot.chat(user.userId, dto, abort.signal);
    } catch (error) {
      // Todavía no se ha escrito nada: esto puede salir como un error HTTP de
      // los de siempre, con su código y su cuerpo.
      throw error;
    }

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
