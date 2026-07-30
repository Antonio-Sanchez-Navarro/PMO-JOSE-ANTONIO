import { getSocketId } from '../hooks/useSocket';
import { TimeEntry } from '@pmo/shared';

const API_BASE = '/api/time';

export const getActiveTimeEntry = async (): Promise<TimeEntry | null> => {
  const response = await fetch(`${API_BASE}/active`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 404) return null; // Wait, actually the Handoff says: GET /time/active returns null if no active. Let's see what it returns. "El fichaje en marcha o null".
    throw new Error('Error al obtener el cronómetro activo');
  }

  const json = await response.json();
  // Backend returns null or the time entry
  return json.data !== undefined ? json.data : json;
};

export const getTimeEntries = async (taskId: string): Promise<TimeEntry[]> => {
  const response = await fetch(`${API_BASE}/entries?taskId=${taskId}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) throw new Error('Error al obtener el historial de tiempos');
  const json = await response.json();
  return json.data || json;
};

export const createTimeEntry = async (data: { taskId: string, startedAt: string, endedAt: string, note?: string }): Promise<TimeEntry> => {
  const response = await fetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorMsg = 'Error al crear la entrada manual';
    try {
      const errorBody = await response.json();
      if (errorBody.message) errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
    } catch {
      // La respuesta no traía JSON: nos quedamos con el mensaje por defecto.
    }
    throw new Error(errorMsg);
  }
  
  const json = await response.json();
  return json.data || json;
};

export const updateTimeEntry = async (id: string, data: { startedAt?: string, endedAt?: string, note?: string }): Promise<TimeEntry> => {
  const response = await fetch(`${API_BASE}/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorMsg = 'Error al actualizar la entrada de tiempo';
    try {
      const errorBody = await response.json();
      if (errorBody.message) errorMsg = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
    } catch {
      // La respuesta no traía JSON: nos quedamos con el mensaje por defecto.
    }
    throw new Error(errorMsg);
  }

  const json = await response.json();
  return json.data || json;
};

export const deleteTimeEntry = async (id: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/entries/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) throw new Error('Error al eliminar la entrada de tiempo');
};

export interface TimeReportResult {
  groupBy: 'task' | 'day' | 'week';
  from: string | null;
  to: string | null;
  totalSec: number;
  rows: { key: string; label: string; seconds: number }[];
}

export const getTimeReport = async (params: { groupBy: 'task' | 'day' | 'week', from?: string, to?: string }): Promise<TimeReportResult> => {
  const query = new URLSearchParams();
  query.append('groupBy', params.groupBy);
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);
  
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  query.append('tz', tz);

  const response = await fetch(`${API_BASE}/report?${query.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) throw new Error('Error al obtener el reporte de tiempos');
  const json = await response.json();
  return json.data || json;
};

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
    } catch {
      // La respuesta no traía JSON: nos quedamos con el mensaje por defecto.
    }
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
    } catch {
      // La respuesta no traía JSON: nos quedamos con el mensaje por defecto.
    }
    throw new Error(errorMsg);
  }

  return response.json();
};
