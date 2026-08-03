export interface CopilotThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export const fetchThreads = async (): Promise<CopilotThread[]> => {
  const response = await fetch('/api/copilot/threads', { credentials: 'include' });
  if (!response.ok) throw new Error('Error fetching threads');
  const json = await response.json();
  return json.data || json;
};

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export const fetchThreadMessages = async (id: string): Promise<ThreadMessage[]> => {
  const response = await fetch(`/api/copilot/threads/${id}`, { credentials: 'include' });
  if (!response.ok) throw new Error('Error fetching thread messages');
  const json = await response.json();
  return json.data || json;
};

export const deleteThread = async (id: string): Promise<void> => {
  const response = await fetch(`/api/copilot/threads/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) throw new Error('Error deleting thread');
};
