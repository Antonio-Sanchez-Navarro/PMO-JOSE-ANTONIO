import { apiFetch } from '../../../lib/api';
import { Obra } from '@pmo/shared';

export const fetchObras = async (): Promise<Obra[]> => {
  return apiFetch<Obra[]>('/obras');
};
