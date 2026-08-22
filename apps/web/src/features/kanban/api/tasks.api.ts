import { Task, TaskStatus, TaskPriority } from '../types';
import { getSocketId } from '../hooks/useSocket';
import { EmailClassification } from '@pmo/shared';
import { apiFetch, ApiError } from '../../../lib/api';

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
  const json = await apiFetch<{ data: Task[] } | Task[]>(`/tasks${queryString}`);
  return Array.isArray(json) ? json : json.data;
};

export const updateTaskStatus = async (id: string, newStatus: TaskStatus): Promise<Task> => {
  const socketId = getSocketId();
  return apiFetch<Task>(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    body: JSON.stringify({ status: newStatus }),
  });
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
  return apiFetch<MoveTaskResponse>(`/tasks/${id}/move`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    body: JSON.stringify({ status, position }),
  });
};

export const createTask = async (data: Partial<Task>): Promise<Task> => {
  const socketId = getSocketId();
  const json = await apiFetch<{ data?: Task } | Task>('/tasks', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    body: JSON.stringify(data),
  });
  return (json as { data?: Task }).data || (json as Task);
};

export const deleteTask = async (id: string): Promise<void> => {
  const socketId = getSocketId();
  await apiFetch<void>(`/tasks/${id}`, {
    method: 'DELETE',
    headers: {
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
  });
};

export const classifyEmail = async (emailId: string): Promise<EmailClassification> => {
  const json = await apiFetch<{ data?: EmailClassification } | EmailClassification>(`/emails/${emailId}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return (json as { data?: EmailClassification }).data || (json as EmailClassification);
};

export const createTasksFromEmail = async (emailId: string, payload: Partial<EmailClassification>, force?: boolean): Promise<Task[]> => {
  const socketId = getSocketId();
  const finalPayload = force ? { ...payload, force } : payload;

  try {
    const json = await apiFetch<{ data?: Task[] } | Task[]>(`/emails/${emailId}/to-task`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(socketId ? { 'x-socket-id': socketId } : {})
      },
      body: JSON.stringify(finalPayload),
    });
    return Array.isArray(json) ? json : json.data || [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new Error('Este correo ya fue convertido a tareas anteriormente.', { cause: err });
    }
    throw err;
  }
};

export const updateEmailStatus = async (emailId: string, status: string, force?: boolean): Promise<unknown> => {
  const socketId = getSocketId();

  const json = await apiFetch<{ data?: unknown } | unknown>(`/emails/${emailId}/status`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    body: JSON.stringify({ status, force }),
  });
  return (json as { data?: unknown }).data || json;
};
