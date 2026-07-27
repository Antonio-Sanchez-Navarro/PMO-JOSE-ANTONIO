import { TaskStatus, TaskPriority, TaskSource } from '@pmo/shared';

export { TaskStatus, TaskPriority, TaskSource };

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  aiConfidence?: number | null;
}
