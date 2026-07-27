import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Task, TaskStatus } from '@prisma/client';
import { SessionService } from '../auth/session.service';
import cookie from 'cookie';
import { SESSION_COOKIE } from '../auth/auth.constants';

/** Nombres de los eventos que emite el backend. Se importan desde los tests. */
export const TASK_EVENTS = {
  created: 'task.created',
  updated: 'task.updated',
  reordered: 'task.reordered',
  deleted: 'task.deleted',
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
export class TasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TasksGateway.name);

  constructor(private readonly sessionService: SessionService) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    try {
      const rawCookie = client.handshake.headers.cookie;
      if (!rawCookie) {
        this.logger.warn(`Conexión rechazada: sin cookies (client.id: ${client.id})`);
        client.disconnect();
        return;
      }

      const cookies = cookie.parse(rawCookie);
      const token = cookies[SESSION_COOKIE];

      if (!token) {
        this.logger.warn(`Conexión rechazada: sin token de sesión (client.id: ${client.id})`);
        client.disconnect();
        return;
      }

      // `verifyAccess` y no `verify...` a secas: comprueba también el claim
      // `typ`, así un token de refresco no sirve para abrir un socket.
      const payload = await this.sessionService.verifyAccess(token);

      // El id del usuario es `sub` (ver `SessionPayload`); el JWT no lleva
      // ningún campo `userId`.
      client.join(payload.sub);
      this.logger.log(`Cliente conectado y unido a sala ${payload.sub} (client.id: ${client.id})`);
    } catch (error) {
      this.logger.error(`Conexión rechazada por sesión inválida (client.id: ${client.id})`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
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
   * Encamina el evento a la sala del dueño. Todos los payloads llevan `userId`
   * justo para esto; si alguno llegara sin él se difunde a todos, que es lo
   * visible en vez de lo silencioso: un evento que no llega a nadie sería un
   * fallo mudo, y así se nota y se corrige.
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
        this.logger.warn(`${event} sin userId: se difunde a todos los clientes`);
        this.server?.emit(event, payload);
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
      if (except) {
        room?.except(except).emit(event, payload);
      } else {
        room?.emit(event, payload);
      }
    } catch (error) {
      this.logger.error(`No se pudo emitir ${event}`, error);
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
