// 1. Exportamos los enums directamente desde la fuente de verdad
export { TaskStatus, TaskPriority, TaskSource } from '@pmo/shared';

// 2. Importamos la interfaz original con un alias para evitar choques de nombres
import { Task as SharedTask } from '@pmo/shared';

// 3. Extendemos la interfaz base agregando solo lo que el frontend necesita para la UI
export interface Task extends Omit<SharedTask, 'id'> {
  id: string;
  aiConfidence?: number | null;
}