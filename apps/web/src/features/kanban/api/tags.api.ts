import { apiFetch } from '../../../lib/api';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export const tagsApi = {
  getTags: async (): Promise<Tag[]> => {
    return apiFetch<Tag[]>('/tags');
  },

  createTag: async (payload: { name: string; color: string }): Promise<Tag> => {
    return apiFetch<Tag>('/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};
