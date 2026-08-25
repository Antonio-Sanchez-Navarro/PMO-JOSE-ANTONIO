import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Task, TaskStatus } from '@prisma/client';
import { SesionRechazadaError, SessionService } from '../auth/session.service';
import { CODIGO_SESION, SESSION_EVENTS } from '@pmo/shared';
import cookie from 'cookie';
import { SESSION_COOKIE } from '../auth/auth.constants';
import { describirError, stackDe } from '../../common/observability/describir-error';

/** Nombres de los eventos que emite el backend. Se importan desde los tests. */
export const TASK_EVENTS = {
  created: 'task.created',
  updated: 'task.updated',
  reordered: 'task.reordered',
  deleted: 'task.deleted',
} as const;

/**
 * Eventos de la bandeja. Viven en este gateway y no en uno propio porque el
 * cliente mantiene **un solo socket por pestaña** —de ello depende la supresión
 * del eco— y abrir un segundo gateway obligaría a un segundo handshake y a otra
 * sala por usuario para el mismo dueño.
 */
export const EMAIL_EVENTS = {
  updated: 'email.updated',
} as const;

/**
 * Eventos del registro de tiempos (Sprint 5). Viven aquí por el mismo motivo
 * que los de la bandeja: un solo socket por pestaña.
 */
export const TIME_EVENTS = {
  started: 'time.started',
  stopped: 'time.stopped',
  deleted: 'time.deleted',
} as const;

/** Orden final de una columna del tablero. */
export interface ColumnOrder {
  status: TaskStatus;
  taskIds: string[];
}

/**
 * Cabecera con la que el cliente se identifica para no recibir el eco de su
 * propio cambio (ver `TasksGateway.emit`).
 *
 * Va en cabecera y no en el cuerpo porque es metadato de transporte: sirve igual
 * para `POST`, `PATCH`, el movimiento y `DELETE` sin tocar ningún DTO.
 */
export const SOCKET_ID_HEADER = 'x-socket-id';

/**
 * Un `socket.id` de socket.io son 20 caracteres; el tope deja margen de sobra y
 * evita que una cabecera absurda acabe de nombre de sala.
 */
const MAX_SOCKET_ID_LENGTH = 64;

/**
 * El contrato del socket vive en `@pmo/shared`: lo consumen los dos lados. Se
 * reexporta para no romper lo que ya lo importaba desde aquí.
 */
export { SESSION_EVENTS, type SesionRechazadaEvento } from '@pmo/shared';

/**
 * Cada cuánto se revisa que la sesión del socket siga viva cuando el token no
 * dice cuándo caduca.
 *
 * Es una red por si algún día el JWT viaja sin `exp`. El camino normal usa el
 * `exp` real del token, que es más preciso y no revisa de más.
 */
const REVALIDACION_POR_DEFECTO_MS = 5 * 60_000;

/**
 * ✅ **ENCENDIDO el 2026-08-25**, después de estar apagado desde el 08-22.
 *
 * ── Por qué estuvo apagado, que es lo que no hay que repetir ────────────────
 *
 * La revalidación hacía lo suyo —cerrar el socket cuando su token caducaba— pero
 * **la otra mitad no existía**: el cliente no escuchaba `SESSION_EVENTS.rechazada`,
 * no tenía manejador de `connect_error`, y socket.io reintenta indefinidamente por
 * defecto. Medido: **una reconexión cada ~5 s por pestaña**, del orden de 17.000
 * al día, cada una despertando Cloud Run. Antes el socket se rompía con un corte
 * de red; con esto encendido se rompía **siempre, cada cuarto de hora**.
 *
 * > **La mitad servidor sola no es media solución: convierte un fallo ocasional en
 * > uno garantizado.**
 *
 * ── Por qué se puede encender ahora ─────────────────────────────────────────
 *
 * Las tres condiciones que se pusieron por escrito, **comprobadas una a una en
 * `apps/web/src/features/kanban/hooks/useSocket.ts` antes de tocar esta línea** —
 * no dadas por buenas porque alguien dijera que estaban:
 *
 *   1. escucha `SESSION_EVENTS.rechazada` y llama a `/auth/refresh` antes de
 *      reconectar (línea 102);
 *   2. `connect_error` distingue `SESION_CADUCADA` —refresca y reconecta— de
 *      `SESION_INVALIDA` —para y al login— (línea 120);
 *   3. `reconnectionAttempts: 5`, así que un rechazo permanente no reintenta
 *      eterno (línea 95).
 *
 * La tercera es la que apagaba el fuego del 08-22: sin tope, un rechazo que no se
 * arregla solo reintenta para siempre. Con las tres, el ciclo se cierra —el
 * cliente trae cookie nueva— en vez de repetirse.
 *
 * ── Qué se recupera al encenderlo ───────────────────────────────────────────
 *
 * Que **un socket deje de sobrevivir a su token**, y que **cerrar sesión calle al
 * socket** en vez de dejarlo oyendo hasta que se caiga por otro motivo. Con un
 * solo usuario era una molestia; con dos habría sido una fuga de datos entre
 * personas.
 *
 * Si volviera el diluvio de reconexiones, esto se pone a `false` y se recupera el
 * comportamiento anterior sin tocar nada más — por eso la constante se queda.
 */
const REVALIDACION_ACTIVA = true;

/**
 * Margen que se añade al `exp` antes de revisar.
 *
 * El reloj del servidor y el del emisor del token no tienen por qué coincidir al
 * segundo. Revisar justo en el `exp` haría que un desfase de nada cerrara
 * sockets sanos; cinco segundos después, ya caducó de verdad para todos.
 */
const MARGEN_DE_RELOJ_MS = 5_000;

/**
 * Emisión en tiempo real de los cambios del tablero.
 *
 * El handshake se autentica con la misma cookie de sesión que el REST y cada
 * cliente entra en la sala de su usuario, así que los eventos no salen de su
 * dueño. Un socket sin cookie válida se desconecta en el acto.
 *
 * El `cors.origin` se lee de `process.env` y no del `ConfigService` porque las
 * opciones del decorador se evalúan al cargar la clase, antes de que exista el
 * contenedor de Nest.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class TasksGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TasksGateway.name);

  constructor(private readonly sessionService: SessionService) {}

  @WebSocketServer()
  server!: Server;

  /** Un temporizador de caducidad por socket vivo. Se limpian al desconectar. */
  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * La autenticación pasa a ser **middleware del servidor**, y ese cambio es el
   * arreglo entero.
   *
   * Antes se rechazaba dentro de `handleConnection` llamando a
   * `client.disconnect()`. Eso significa que **la conexión se establecía y
   * después se caía**, y desde el cliente eso no es un rechazo: es un `connect`
   * seguido de un `disconnect`, o sea **una caída de red normal**. Ante una
   * caída normal, socket.io reconecta indefinidamente — que es exactamente lo
   * que hacía, y con razón.
   *
   * De ahí que el frontend no tuviera manejador de `connect_error`: **ese evento
   * no llegaba a dispararse nunca**. No era un olvido suyo; es que no había nada
   * que manejar. Rechazando en middleware con `next(err)`, socket.io transporta
   * `err.message` y `err.data` hasta `connect_error`, y el cliente puede por fin
   * distinguir «refresca y vuelve» de «vete al login».
   */
  afterInit(server: Server) {
    server.use((socket, next) => {
      void this.autenticarHandshake(socket)
        .then(() => next())
        .catch((error: unknown) => next(this.comoErrorDeHandshake(error)));
    });
  }

  /**
   * Valida la cookie del handshake y deja al socket listo para entrar en su sala.
   *
   * No entra en la sala aquí: eso lo hace `handleConnection`, que es donde la
   * conexión ya es un hecho. Este método solo decide si se conecta o no.
   */
  private async autenticarHandshake(client: Socket): Promise<void> {
    const rawCookie = client.handshake.headers.cookie;
    if (!rawCookie) {
      throw new SesionRechazadaError(CODIGO_SESION.invalida, 'Sin cookies');
    }

    const token = cookie.parse(rawCookie)[SESSION_COOKIE];
    if (!token) {
      throw new SesionRechazadaError(CODIGO_SESION.invalida, 'Sin token de sesión');
    }

    // `verifyAccess` y no `verify...` a secas: comprueba también el claim `typ`,
    // así un token de refresco no sirve para abrir un socket.
    const payload = await this.sessionService.verifyAccess(token);

    client.data.userId = payload.sub;
    client.data.expiraEn = payload.exp;
  }

  /**
   * Traduce un rechazo a lo que socket.io sabe llevar hasta `connect_error`.
   *
   * ⚠️ **El `data` es la mitad que importa.** `err.message` es texto para un
   * humano y puede cambiar; `err.data.codigo` es el contrato con el frontend y
   * no cambia. @Gravity programa contra el código, no contra el mensaje.
   *
   * Lo que no sea un rechazo de sesión **no se disfraza de uno**: sale como
   * error de transporte, para que el cliente reconecte con normalidad en vez de
   * mandar a nadie al login por un tropiezo de red.
   */
  private comoErrorDeHandshake(error: unknown): Error {
    const rechazo = error instanceof SesionRechazadaError ? error : undefined;

    if (!rechazo) {
      this.logger.error(
        `Handshake rechazado por un fallo inesperado: ${describirError(error)}`,
        stackDe(error),
      );
      return Object.assign(new Error('Error al establecer la sesión del socket'), {
        data: { codigo: 'ERROR_INTERNO' },
      });
    }

    this.logger.warn(`Handshake rechazado (${rechazo.codigo}): ${rechazo.message}`);
    return Object.assign(new Error(rechazo.message), { data: { codigo: rechazo.codigo } });
  }

  /**
   * Programa el cierre del socket para cuando su token caduque.
   *
   * **Un socket vivía indefinidamente con una sesión validada una sola vez.** Se
   * comprobaba en el handshake, con un token de quince minutos, y después ya no
   * se volvía a mirar: un socket abierto toda la noche seguía recibiendo eventos
   * con una sesión caducada hacía horas, y si el usuario cerraba sesión **el
   * socket seguía oyendo** hasta caerse por otro motivo.
   *
   * Se cierra avisando con `SESION_CADUCADA`, el mismo código del handshake, y a
   * propósito: el cliente ya sabe qué hacer con él —refrescar y reconectar— así
   * que la sesión del socket deja de ser eterna sin que el usuario note nada.
   *
   * La cookie del handshake no se actualiza sola mientras el socket vive, así
   * que **no tiene sentido revalidar el mismo token una y otra vez**: caducó y
   * seguirá caducado. Lo útil es cerrar a tiempo y dejar que la reconexión traiga
   * la cookie nueva, que para entonces el navegador ya habrá refrescado.
   */
  private programarCaducidad(client: Socket) {
    // Ver `REVALIDACION_ACTIVA`. Encendida desde el 2026-08-25: el interruptor se
    // queda porque cerrar sockets sanos contra un cliente sordo es peor que no
    // cerrarlos, y volver a ese estado tiene que costar una línea.
    if (!REVALIDACION_ACTIVA) return;

    const expiraEn = client.data.expiraEn as number | undefined;

    const msHastaCaducar = expiraEn
      ? expiraEn * 1000 - Date.now() + MARGEN_DE_RELOJ_MS
      : REVALIDACION_POR_DEFECTO_MS;

    // Ya caducado (o a punto): no se programa nada, se cierra en la siguiente
    // vuelta del bucle de eventos. No debería pasar —el handshake acaba de
    // validarlo— pero un reloj desajustado lo haría posible.
    const espera = Math.max(msHastaCaducar, 0);

    const temporizador = setTimeout(() => {
      this.logger.log(`Sesión del socket ${client.id} caducada: se cierra para que reconecte`);
      client.emit(SESSION_EVENTS.rechazada, { codigo: CODIGO_SESION.caducada });
      client.disconnect(true);
    }, espera);

    // `unref` para que un socket abierto no impida que el proceso termine: sin
    // esto, un temporizador de quince minutos retrasaría el apagado ordenado de
    // Cloud Run hasta que venciera.
    temporizador.unref?.();

    this.temporizadores.set(client.id, temporizador);
  }

  /**
   * La conexión ya está autenticada por el middleware: aquí solo se entra en la
   * sala y se programa el cierre para cuando el token caduque.
   */
  handleConnection(client: Socket) {
    const userId = client.data.userId as string;
    client.join(userId);
    this.programarCaducidad(client);
    this.logger.log(`Cliente conectado y unido a sala ${userId} (client.id: ${client.id})`);
  }

  handleDisconnect(client: Socket) {
    // Sin esto, cada socket dejaría su temporizador vivo hasta vencer, apuntando
    // a un cliente que ya no existe. Con reconexiones frecuentes eso es una fuga
    // lenta, del tipo que no se nota hasta que se nota.
    const temporizador = this.temporizadores.get(client.id);
    if (temporizador) {
      clearTimeout(temporizador);
      this.temporizadores.delete(client.id);
    }
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  emitTaskCreated(task: Task, exceptSocketId?: string) {
    this.emit(TASK_EVENTS.created, task, exceptSocketId);
  }

  /**
   * Cambio en una tarea ya existente: edición, arrastre entre columnas o
   * reevaluación del cron. Va la fila entera —`userId` incluido— porque el
   * cliente la usa tal cual para reemplazar la tarjeta y para descartar lo que
   * no es suyo mientras el broadcast siga siendo global.
   *
   * Un arrastre emite esto **y** un `task.reordered` justo después, en ese
   * orden: primero la tarjeta con su columna nueva, luego el orden final de las
   * columnas tocadas.
   */
  emitTaskUpdated(task: Task, exceptSocketId?: string) {
    this.emit(TASK_EVENTS.updated, task, exceptSocketId);
  }

  /**
   * Orden final de las columnas que tocó un arrastre, tal cual lo devuelve
   * `PATCH /tasks/:id/move` en su campo `columns`.
   *
   * Existe porque mover una tarjeta renumera a todas las que van detrás, y con
   * `task.updated` solo viajaba la movida: los demás clientes veían el cambio de
   * columna pero conservaban el orden viejo de sus hermanas. Se manda la lista
   * de ids y no cada fila renumerada —serían N eventos por arrastre— porque el
   * cliente ya tiene esas tarjetas y solo necesita el orden.
   *
   * `userId` viaja al mismo nivel porque aquí no hay fila de la que sacarlo, y
   * el filtro del cliente lo necesita igual.
   */
  emitTasksReordered(userId: string, columns: ColumnOrder[], exceptSocketId?: string) {
    this.emit(TASK_EVENTS.reordered, { userId, columns }, exceptSocketId);
  }

  /**
   * Se manda la tarea entera y no solo el id: el tablero necesita la columna
   * para saber de cuál quitarla sin recorrer las cinco.
   */
  emitTaskDeleted(task: Pick<Task, 'id' | 'status' | 'userId'>, exceptSocketId?: string) {
    this.emit(
      TASK_EVENTS.deleted,
      { id: task.id, status: task.status, userId: task.userId },
      exceptSocketId,
    );
  }

  /**
   * Un correo cambió de estado en el triage (Inbox Zero).
   *
   * Va la fila entera, igual que en las tareas, para que la bandeja sustituya
   * la suya sin volver a pedir la lista. `userId` viaja dentro porque es lo que
   * usa `emit` para encaminar a la sala del dueño.
   *
   * El tipo se declara aquí de forma estructural y no importando `TriageEmail`:
   * el módulo de tareas no debe depender del de correos, y para encaminar solo
   * hacen falta estos dos campos.
   */
  emitEmailUpdated(email: { id: string; userId: string }, exceptSocketId?: string) {
    this.emit(EMAIL_EVENTS.updated, email, exceptSocketId);
  }

  /**
   * Arrancó un cronómetro. Va el fichaje entero —con su tarea— para que las
   * demás pestañas pinten el reloj sin volver a pedir nada.
   *
   * El tipo se declara de forma estructural, como en los correos: para
   * encaminar solo hacen falta `userId` y `taskId`, y el módulo de tareas no
   * tiene por qué depender del de tiempos.
   */
  emitTimeStarted(entry: { id: string; userId: string; taskId: string }, exceptSocketId?: string) {
    this.emit(TIME_EVENTS.started, entry, exceptSocketId);
  }

  /**
   * Se detuvo un cronómetro, o se apuntó o corrigió un tramo a mano. Los tres
   * casos dejan un fichaje cerrado, que es lo único que la tarjeta necesita
   * saber para actualizar su total.
   */
  emitTimeStopped(entry: { id: string; userId: string; taskId: string }, exceptSocketId?: string) {
    this.emit(TIME_EVENTS.stopped, entry, exceptSocketId);
  }

  /** Se borró un fichaje: la tarjeta tiene que restarlo de su total. */
  emitTimeDeleted(entry: { id: string; userId: string; taskId: string }, exceptSocketId?: string) {
    this.emit(TIME_EVENTS.deleted, entry, exceptSocketId);
  }

  /**
   * Encamina el evento a la sala del dueño. Todos los payloads llevan `userId`
   * justo para esto.
   *
   * ⚠️ **Sin `userId` no se difunde a nadie** (§43.5, 2026-08-25). Antes se
   * emitía a **todos los clientes del servidor**, con este razonamiento escrito
   * aquí: *«es lo visible en vez de lo silencioso; un evento que no llega a nadie
   * sería un fallo mudo»*.
   *
   * El objetivo era bueno y el medio, no: **mandarle a todo el mundo el evento de
   * otro para que se note el fallo paga la visibilidad con los datos de alguien**.
   * Hoy hay un solo usuario y no se nota; el día que haya dos, el fallo mudo se
   * habría convertido en una fuga entre personas — y nadie lo habría revisado,
   * porque ya estaba «resuelto».
   *
   * La visibilidad se conserva entera **subiendo el log a `error`**: Error
   * Reporting lee las excepciones de Cloud Logging, así que un `error` sale a la
   * superficie solo, mientras que el `warn` de antes se perdía entre el ruido. Se
   * gana además precisión: dice qué evento fue.
   *
   * Es la misma elección que el `indeterminado` de la sonda del frontend — no
   * poder encaminar **no es** encaminar bien, y se dice en vez de disimularlo.
   *
   * Emitir nunca debe tumbar la petición HTTP que lo provocó: la tarea ya está
   * escrita en la base de datos y el peor caso de un fallo aquí es que la UI
   * tarde en enterarse. El `server` puede además no existir todavía si algo
   * emite antes de que el adaptador arranque.
   */
  private emit(event: string, payload: { userId?: string } | unknown, exceptSocketId?: string) {
    try {
      const userId = (payload as { userId?: string })?.userId;
      if (!userId) {
        // No se difunde: sin dueño no hay a quién mandárselo, y «a todos» no es
        // una respuesta a esa pregunta. El coste es que esa UI tarde en
        // enterarse hasta la siguiente recarga; el de difundir era enseñarle a
        // cada cliente algo que no es suyo.
        this.logger.error(
          `${event} sin userId: no se emite. Un payload sin dueño no se puede encaminar, ` +
            'y difundirlo a todos los clientes seria una fuga. Falta el userId en quien lo emite.',
        );
        return;
      }

      const room = this.server?.to(userId);

      // Sin eco al que provocó el cambio: su UI ya lo pintó de forma optimista y
      // reconcilió con la respuesta HTTP, así que reaplicarlo le hace dar el
      // salto de goma elástica. El resto de pestañas del mismo usuario sí lo
      // recibe.
      //
      // Cada socket está en una sala con su propio id, así que `except` sale
      // gratis. Un id inventado por el cliente solo puede silenciar a otra
      // pestaña *suya*: no cruza salas, porque el `except` se aplica sobre la
      // del usuario.
      const except = this.validSocketId(exceptSocketId);

      // Deja rastro de a quién se excluyó. Sin esto, un `X-Socket-Id` que no
      // llega es indistinguible de uno que llega mal: en ambos casos el cliente
      // recibe su propio eco y el síntoma es el mismo (efecto boomerang).
      this.logger.debug(
        `${event} → sala ${userId}` + (except ? ` excepto ${except}` : ' (sin exclusión: falta X-Socket-Id)'),
      );

      if (except) {
        room?.except(except).emit(event, payload);
      } else {
        room?.emit(event, payload);
      }
    } catch (error) {
      this.logger.error(`No se pudo emitir ${event}: ${describirError(error)}`, stackDe(error));
    }
  }

  /** Descarta cabeceras vacías o absurdas antes de usarlas como nombre de sala. */
  private validSocketId(socketId?: string): string | undefined {
    if (typeof socketId !== 'string') return undefined;
    const trimmed = socketId.trim();
    if (!trimmed || trimmed.length > MAX_SOCKET_ID_LENGTH) return undefined;
    return trimmed;
  }
}
