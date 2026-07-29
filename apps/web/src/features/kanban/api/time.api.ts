import { getSocketId } from '../hooks/useSocket';
import { TimeEntry } from '@pmo/shared';

const API_BASE = '/api/time';

export const startTimer = async (taskId: string): Promise<TimeEntry> => {
  const socketId = getSocketId();
  const response = await fetch(`${API_BASE}/${taskId}/start`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = 'Error al iniciar el cronómetro';
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
      }
    } catch (e) {}
    throw new Error(errorMsg);
  }

  return response.json();
};

export const stopTimer = async (taskId: string): Promise<TimeEntry> => {
  const socketId = getSocketId();
  const response = await fetch(`${API_BASE}/${taskId}/stop`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = 'Error al detener el cronómetro';
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
      }
    } catch (e) {}
    throw new Error(errorMsg);
  }

  return response.json();
};
