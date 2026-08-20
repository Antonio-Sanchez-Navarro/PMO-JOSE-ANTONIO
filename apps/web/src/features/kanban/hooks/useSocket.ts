import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Task, TaskStatus } from '../types';
import { TimeEntry } from '@pmo/shared';

export const TASK_EVENTS = {
  created: 'task.created',
  updated: 'task.updated',
  reordered: 'task.reordered',
  deleted: 'task.deleted',
} as const;

export const EMAIL_EVENTS = {
  updated: 'email.updated',
} as const;

export const TIME_EVENTS = {
  started: 'time.started',
  stopped: 'time.stopped',
} as const;

export interface ColumnOrder {
  status: TaskStatus;
  taskIds: string[];
}

/**
 * Un único socket por pestaña, compartido por todos los que usen el hook.
 *
 * No es una optimización: es lo que hace que funcione la supresión del eco. El
 * cliente manda su `socket.id` en `X-Socket-Id` y el backend emite con
 * `.except(ese id)`. Si la pestaña tiene dos sockets vivos, el excluido es uno
 * y **el otro recibe el cambio y lo aplica**: vuelve el efecto boomerang. Pasaba
 * de verdad —dos sockets en la misma sala, comprobado en el log del backend—
 * porque en desarrollo React monta el componente dos veces (StrictMode) y el
 * HMR vuelve a ejecutar el efecto, y cada pasada abría una conexión nueva.
 */
let globalSocket: Socket | null = null;

/** Cuántos componentes están usando el socket compartido. */
let subscribers = 0;

export const getSocketId = () => globalSocket?.id;

interface UseSocketProps {
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
  onTaskDeleted?: (payload: { id: string; status: TaskStatus; userId: string }) => void;
  onTasksReordered?: (payload: { userId: string; columns: ColumnOrder[] }) => void;
  onEmailUpdated?: (email: Record<string, unknown>) => void;
  onTimeStarted?: (timeEntry: TimeEntry) => void;
  onTimeStopped?: (timeEntry: TimeEntry) => void;
}

export const useSocket = ({
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onTasksReordered,
  onEmailUpdated,
  onTimeStarted,
  onTimeStopped,
}: UseSocketProps) => {
  const socketRef = useRef<Socket | null>(null);

  const savedOnTaskCreated = useRef(onTaskCreated);
  const savedOnTaskUpdated = useRef(onTaskUpdated);
  const savedOnTaskDeleted = useRef(onTaskDeleted);
  const savedOnTasksReordered = useRef(onTasksReordered);
  const savedOnEmailUpdated = useRef(onEmailUpdated);
  const savedOnTimeStarted = useRef(onTimeStarted);
  const savedOnTimeStopped = useRef(onTimeStopped);

  useEffect(() => {
    savedOnTaskCreated.current = onTaskCreated;
    savedOnTaskUpdated.current = onTaskUpdated;
    savedOnTaskDeleted.current = onTaskDeleted;
    savedOnTasksReordered.current = onTasksReordered;
    savedOnEmailUpdated.current = onEmailUpdated;
    savedOnTimeStarted.current = onTimeStarted;
    savedOnTimeStopped.current = onTimeStopped;
  });

  useEffect(() => {
    subscribers += 1;

    if (!globalSocket) {
      // Vite proxy no proxifica WebSockets por defecto, así que conectamos al host backend.
      // withCredentials asegura que enviemos la cookie pmo_session para que el backend nos asigne nuestra sala.
      const socketUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://pmo-api-mlpuuasqka-uc.a.run.app" : "http://localhost:3000");
      globalSocket = io(socketUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });

      globalSocket.on('connect', () => {
        console.log('🔗 Conectado a WebSocket', globalSocket?.id);
      });
    }

    const socket = globalSocket;
    socketRef.current = socket;

    // Con referencia a la función, para poder quitar **solo** estos manejadores
    // al desmontar: un `socket.off(evento)` a secas dejaría sordo al resto de
    // componentes que compartan el socket.
    const onCreated = (data: Task) => savedOnTaskCreated.current?.(data);
    const onUpdated = (data: Task) => savedOnTaskUpdated.current?.(data);
    const onDeleted = (data: { id: string; status: TaskStatus; userId: string }) =>
      savedOnTaskDeleted.current?.(data);
    const onReordered = (data: { userId: string; columns: ColumnOrder[] }) =>
      savedOnTasksReordered.current?.(data);
    const onEmailUpdatedHandler = (data: Record<string, unknown>) =>
      savedOnEmailUpdated.current?.(data);
    const onTimeStartedHandler = (data: TimeEntry) =>
      savedOnTimeStarted.current?.(data);
    const onTimeStoppedHandler = (data: TimeEntry) =>
      savedOnTimeStopped.current?.(data);

    socket.on(TASK_EVENTS.created, onCreated);
    socket.on(TASK_EVENTS.updated, onUpdated);
    socket.on(TASK_EVENTS.deleted, onDeleted);
    socket.on(TASK_EVENTS.reordered, onReordered);
    socket.on(EMAIL_EVENTS.updated, onEmailUpdatedHandler);
    socket.on(TIME_EVENTS.started, onTimeStartedHandler);
    socket.on(TIME_EVENTS.stopped, onTimeStoppedHandler);

    return () => {
      socket.off(TASK_EVENTS.created, onCreated);
      socket.off(TASK_EVENTS.updated, onUpdated);
      socket.off(TASK_EVENTS.deleted, onDeleted);
      socket.off(TASK_EVENTS.reordered, onReordered);
      socket.off(EMAIL_EVENTS.updated, onEmailUpdatedHandler);
      socket.off(TIME_EVENTS.started, onTimeStartedHandler);
      socket.off(TIME_EVENTS.stopped, onTimeStoppedHandler);

      subscribers -= 1;

      // El cierre se aplaza un tick: en desarrollo React desmonta y vuelve a
      // montar de inmediato, y desconectar en medio abriría una conexión nueva
      // en el siguiente montaje —justo lo que provocaba dos sockets vivos—.
      setTimeout(() => {
        if (subscribers === 0 && globalSocket === socket) {
          socket.disconnect();
          globalSocket = null;
        }
      }, 0);
    };
  }, []); // <-- Solo montar una vez

  return { socket: socketRef.current };
};
