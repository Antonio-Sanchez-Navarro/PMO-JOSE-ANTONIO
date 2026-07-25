import { Task, TaskStatus } from '../types';

const API_BASE = '/api/tasks'; // Usamos el proxy configurado en vite.config.ts

export const fetchTasks = async (): Promise<Task[]> => {
  const response = await fetch(API_BASE, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  
  const json = await response.json();
  return json.data; // Aquí está la magia: extraemos el array del wrapper
};

export const updateTaskStatus = async (id: string, newStatus: TaskStatus): Promise<Task> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status: newStatus }),
  });
  
  if (!response.ok) {
    throw new Error(`Error updating task: ${response.statusText}`);
  }
  return response.json();
};
