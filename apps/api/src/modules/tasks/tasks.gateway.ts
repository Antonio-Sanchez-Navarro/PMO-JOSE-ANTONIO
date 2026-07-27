import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Task } from '@prisma/client';

/** Nombres de los eventos que emite el backend. Se importan desde los tests. */
export const TASK_EVENTS = {
  created: 'task.created',
  deleted: 'task.deleted',
} as const;

/**
 * Emisión en tiempo real de los cambios del tablero.
 *
 * **Broadcast global y sin autenticar**, a propósito y de momento: es la base
 * mínima para que la UI deje de recargar. Antes de exponer esto fuera de local
 * faltan dos cosas:
 *
 * 1. **Salas por usuario.** Hoy todo suscriptor recibe los eventos de todos, así
 *    que las tareas de un usuario viajan a las pestañas de otro. Con un solo
 *    usuario en desarrollo no se nota; con dos es una fuga.
 * 2. **Autenticación del handshake.** El `AuthGuard` protege el REST, no el
 *    socket: aquí se conecta cualquiera que alcance el puerto.
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

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado al tablero: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  emitTaskCreated(task: Task) {
    this.emit(TASK_EVENTS.created, task);
  }

  /**
   * Se manda la tarea entera y no solo el id: el tablero necesita la columna
   * para saber de cuál quitarla sin recorrer las cinco.
   */
  emitTaskDeleted(task: Pick<Task, 'id' | 'status' | 'userId'>) {
    this.emit(TASK_EVENTS.deleted, { id: task.id, status: task.status, userId: task.userId });
  }

  /**
   * Emitir nunca debe tumbar la petición HTTP que lo provocó: la tarea ya está
   * escrita en la base de datos y el peor caso de un fallo aquí es que la UI
   * tarde en enterarse. El `server` puede además no existir todavía si algo
   * emite antes de que el adaptador arranque.
   */
  private emit(event: string, payload: unknown) {
    try {
      this.server?.emit(event, payload);
    } catch (error) {
      this.logger.error(`No se pudo emitir ${event}`, error);
    }
  }
}
