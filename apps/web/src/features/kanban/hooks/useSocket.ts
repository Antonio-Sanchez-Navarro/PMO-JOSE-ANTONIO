import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Task, TaskStatus } from '../types';

export const TASK_EVENTS = {
  created: 'task.created',
  updated: 'task.updated',
  reordered: 'task.reordered',
  deleted: 'task.deleted',
} as const;

export interface ColumnOrder {
  status: TaskStatus;
  taskIds: string[];
}

let globalSocket: Socket | null = null;

export const getSocketId = () => globalSocket?.id;

interface UseSocketProps {
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
  onTaskDeleted?: (payload: { id: string; status: TaskStatus; userId: string }) => void;
  onTasksReordered?: (payload: { userId: string; columns: ColumnOrder[] }) => void;
}

export const useSocket = ({
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onTasksReordered,
}: UseSocketProps) => {
  const socketRef = useRef<Socket | null>(null);

  const savedOnTaskCreated = useRef(onTaskCreated);
  const savedOnTaskUpdated = useRef(onTaskUpdated);
  const savedOnTaskDeleted = useRef(onTaskDeleted);
  const savedOnTasksReordered = useRef(onTasksReordered);

  useEffect(() => {
    savedOnTaskCreated.current = onTaskCreated;
    savedOnTaskUpdated.current = onTaskUpdated;
    savedOnTaskDeleted.current = onTaskDeleted;
    savedOnTasksReordered.current = onTasksReordered;
  });

  useEffect(() => {
    // Vite proxy no proxifica WebSockets por defecto, así que conectamos al host backend.
    // withCredentials asegura que enviemos la cookie pmo_session para que el backend nos asigne nuestra sala.
    const socket = io('http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;
    globalSocket = socket;

    socket.on('connect', () => {
      console.log('🔗 Conectado a WebSocket', socket.id);
    });

    socket.on(TASK_EVENTS.created, (data) => savedOnTaskCreated.current?.(data));
    socket.on(TASK_EVENTS.updated, (data) => savedOnTaskUpdated.current?.(data));
    socket.on(TASK_EVENTS.deleted, (data) => savedOnTaskDeleted.current?.(data));
    socket.on(TASK_EVENTS.reordered, (data) => savedOnTasksReordered.current?.(data));

    return () => {
      socket.disconnect();
      if (globalSocket === socket) {
        globalSocket = null;
      }
    };
  }, []); // <-- Solo montar una vez

  return { socket: socketRef.current };
};
