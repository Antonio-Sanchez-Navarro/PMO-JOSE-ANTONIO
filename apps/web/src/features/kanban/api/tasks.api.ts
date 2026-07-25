import { Task, TaskStatus } from '../types';

const API_BASE = '/api/tasks';

export const fetchTasks = async (): Promise<Task[]> => {
  const response = await fetch(API_BASE);
  if (!response.ok) {
    throw new Error(`Error fetching tasks: ${response.statusText}`);
  }
  return response.json();
};

export const updateTaskStatus = async (id: string, newStatus: TaskStatus): Promise<Task> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: newStatus }),
  });
  
  if (!response.ok) {
    throw new Error(`Error updating task: ${response.statusText}`);
  }
  
  return response.json();
};
