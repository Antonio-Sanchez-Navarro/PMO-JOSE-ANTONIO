import { Task, TaskStatus, TaskPriority } from '../types';
import { getSocketId } from '../hooks/useSocket';
import { EmailClassification } from '@pmo/shared';

const API_BASE = '/api/tasks'; // Usamos el proxy configurado en vite.config.ts

export interface FetchTasksFilters {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export const fetchTasks = async (filters?: FetchTasksFilters): Promise<Task[]> => {
  const params = new URLSearchParams();
  if (filters?.search) params.append('search', filters.search);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.priority) params.append('priority', filters.priority);

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(`${API_BASE}${queryString}`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  
  const json = await response.json();
  return json.data; // Aquí está la magia: extraemos el array del wrapper
};

export const updateTaskStatus = async (id: string, newStatus: TaskStatus): Promise<Task> => {
  const socketId = getSocketId();
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
    body: JSON.stringify({ status: newStatus }),
  });
  
  if (!response.ok) {
    throw new Error(`Error updating task: ${response.statusText}`);
  }
  return response.json();
};

export interface MoveTaskResponse {
  task: Task;
  columns: {
    status: TaskStatus;
    taskIds: string[];
  }[];
}

export const moveTask = async (id: string, status: TaskStatus, position: number): Promise<MoveTaskResponse> => {
  const socketId = getSocketId();
  const response = await fetch(`${API_BASE}/${id}/move`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
    body: JSON.stringify({ status, position }),
  });

  if (!response.ok) {
    throw new Error('Failed to move task');
  }

  const json = await response.json();
  return json;
};

export const createTask = async (data: any): Promise<Task> => {
  const socketId = getSocketId();
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create task');
  }

  const json = await response.json();
  return json.data || json; // Retorna el body o data
};

export const deleteTask = async (id: string): Promise<void> => {
  const socketId = getSocketId();
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    headers: {
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to delete task');
  }
};

export const classifyEmail = async (emailId: string): Promise<EmailClassification> => {
  const response = await fetch(`/api/emails/${emailId}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = 'Error al analizar el correo';
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
      }
    } catch (e) {}
    throw new Error(errorMsg);
  }

  const json = await response.json();
  return json.data || json;
};

export const createTasksFromEmail = async (emailId: string, payload: Partial<EmailClassification>, force?: boolean): Promise<Task[]> => {
  const socketId = getSocketId();
  
  // Agregar force al payload si viene true
  const finalPayload = force ? { ...payload, force } : payload;

  const response = await fetch(`/api/emails/${emailId}/to-task`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
    body: JSON.stringify(finalPayload),
  });

  if (!response.ok) {
    let errorMsg = 'Error al crear las tareas propuestas';
    try {
      const errorBody = await response.json();
      if (response.status === 409) {
        errorMsg = 'Este correo ya fue convertido a tareas anteriormente.';
      } else if (errorBody.message) {
        errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
      }
    } catch (parseError) {
      // Ignoramos el error si no hay body JSON válido
    }
    throw new Error(errorMsg);
  }

  const json = await response.json();
  return json.data || json;
};

export const updateEmailStatus = async (emailId: string, status: string, force?: boolean): Promise<any> => {
  const socketId = getSocketId();

  const response = await fetch(`/api/emails/${emailId}/status`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
    body: JSON.stringify({ status, force }),
  });

  if (!response.ok) {
    let errorMsg = 'Error al actualizar el estado del correo';
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
      }
    } catch (parseError) {}
    throw new Error(errorMsg);
  }

  const json = await response.json();
  return json.data || json;
};
