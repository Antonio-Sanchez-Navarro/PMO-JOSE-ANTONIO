import { getSocketId } from '../hooks/useSocket';
import { TimeEntry } from '@pmo/shared';
import { apiFetch, ApiError } from '../../../lib/api';

export const getActiveTimeEntry = async (): Promise<TimeEntry | null> => {
  try {
    const json = await apiFetch<{ data?: TimeEntry } | TimeEntry | null>('/time/active');
    if (!json) return null;
    return (json as { data?: TimeEntry }).data !== undefined ? (json as { data: TimeEntry }).data : (json as TimeEntry);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
};

export const getTimeEntries = async (taskId: string): Promise<TimeEntry[]> => {
  const json = await apiFetch<{ data?: TimeEntry[] } | TimeEntry[]>(`/time/entries?taskId=${taskId}`);
  return (json as { data?: TimeEntry[] }).data || (json as TimeEntry[]);
};

export const createTimeEntry = async (data: { taskId: string; startedAt: string; endedAt: string; note?: string }): Promise<TimeEntry> => {
  const json = await apiFetch<{ data?: TimeEntry } | TimeEntry>('/time/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return (json as { data?: TimeEntry }).data || (json as TimeEntry);
};

export const updateTimeEntry = async (id: string, data: { startedAt?: string; endedAt?: string; note?: string }): Promise<TimeEntry> => {
  const json = await apiFetch<{ data?: TimeEntry } | TimeEntry>(`/time/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return (json as { data?: TimeEntry }).data || (json as TimeEntry);
};

export const deleteTimeEntry = async (id: string): Promise<void> => {
  await apiFetch<void>(`/time/entries/${id}`, {
    method: 'DELETE',
  });
};

export interface TimeReportResult {
  groupBy: 'task' | 'day' | 'week';
  from: string | null;
  to: string | null;
  totalSec: number;
  tz?: string;
  rows: { key: string; label: string; seconds: number }[];
}

export const getTimeReport = async (params: { groupBy: 'task' | 'day' | 'week'; from?: string; to?: string }): Promise<TimeReportResult> => {
  const query = new URLSearchParams();
  query.append('groupBy', params.groupBy);
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);
  
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  query.append('tz', tz);

  const json = await apiFetch<{ data?: TimeReportResult } | TimeReportResult>(`/time/report?${query.toString()}`);
  return (json as { data?: TimeReportResult }).data || (json as TimeReportResult);
};

export const startTimer = async (taskId: string): Promise<TimeEntry> => {
  const socketId = getSocketId();
  return apiFetch<TimeEntry>(`/time/${taskId}/start`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
  });
};

export const stopTimer = async (taskId: string): Promise<TimeEntry> => {
  const socketId = getSocketId();
  return apiFetch<TimeEntry>(`/time/${taskId}/stop`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(socketId ? { 'x-socket-id': socketId } : {})
    },
  });
};
