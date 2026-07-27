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

  useEffect(() => {
    // Vite proxy no proxifica WebSockets por defecto, así que conectamos al host backend.
    // withCredentials asegura que enviemos la cookie pmo_session para que el backend nos asigne nuestra sala.
    const socket = io('http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔗 Conectado a WebSocket', socket.id);
    });

    if (onTaskCreated) socket.on(TASK_EVENTS.created, onTaskCreated);
    if (onTaskUpdated) socket.on(TASK_EVENTS.updated, onTaskUpdated);
    if (onTaskDeleted) socket.on(TASK_EVENTS.deleted, onTaskDeleted);
    if (onTasksReordered) socket.on(TASK_EVENTS.reordered, onTasksReordered);

    return () => {
      if (onTaskCreated) socket.off(TASK_EVENTS.created, onTaskCreated);
      if (onTaskUpdated) socket.off(TASK_EVENTS.updated, onTaskUpdated);
      if (onTaskDeleted) socket.off(TASK_EVENTS.deleted, onTaskDeleted);
      if (onTasksReordered) socket.off(TASK_EVENTS.reordered, onTasksReordered);
      socket.disconnect();
    };
  }, [onTaskCreated, onTaskUpdated, onTaskDeleted, onTasksReordered]);

  return { socket: socketRef.current };
};
