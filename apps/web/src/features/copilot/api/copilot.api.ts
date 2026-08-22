import { apiFetch } from '../../../lib/api';

export interface CopilotThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export const fetchThreads = async (): Promise<CopilotThread[]> => {
  const json = await apiFetch<{ data?: CopilotThread[] } | CopilotThread[]>('/copilot/threads');
  return (json as { data?: CopilotThread[] }).data || (json as CopilotThread[]);
};

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export const fetchThreadMessages = async (id: string): Promise<ThreadMessage[]> => {
  const json = await apiFetch<{ data?: ThreadMessage[] } | ThreadMessage[]>(`/copilot/threads/${id}`);
  return (json as { data?: ThreadMessage[] }).data || (json as ThreadMessage[]);
};

export const deleteThread = async (id: string): Promise<void> => {
  await apiFetch<void>(`/copilot/threads/${id}`, { method: 'DELETE' });
};
