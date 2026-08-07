import { API_BASE as GLOBAL_API_BASE } from '../../../lib/api';
const API_BASE = `${GLOBAL_API_BASE}/tags`;

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export const tagsApi = {
  getTags: async (): Promise<Tag[]> => {
    const response = await fetch(API_BASE, { credentials: 'include' });

    if (!response.ok) {
      throw new Error('No se pudieron cargar las etiquetas');
    }

    // `GET /tags` devuelve el arreglo sin envoltorio, como `POST /tasks`.
    return response.json();
  },

  createTag: async (payload: { name: string; color: string }): Promise<Tag> => {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // 409 cuando ya existe una etiqueta con ese nombre: el mensaje del
      // backend dice cuál, y es lo que hay que enseñar en el formulario.
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? 'No se pudo crear la etiqueta');
    }

    return response.json();
  },
};
