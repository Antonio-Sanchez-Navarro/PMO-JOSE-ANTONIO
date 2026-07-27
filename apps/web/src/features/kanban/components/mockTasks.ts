import { Task, TaskStatus, TaskPriority } from '../types';

export const MOCK_TASKS: Task[] = [
  {
    id: 't-1',
    title: 'Analizar requerimientos del Sprint 4',
    status: TaskStatus.DONE,
    priority: TaskPriority.HIGH,
    dueDate: '2026-07-20',
    aiConfidence: 0.95,
  },
  {
    id: 't-2',
    title: 'Crear esquema de base de datos Prisma',
    status: TaskStatus.DONE,
    priority: TaskPriority.HIGH,
    aiConfidence: 0.98,
  },
  {
    id: 't-3',
    title: 'Implementar AI_ROLES.md para división de trabajo',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    aiConfidence: 0.85,
  },
  {
    id: 't-4',
    title: 'Desarrollar cascarones del KanbanBoard en React',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: '2026-07-25',
    aiConfidence: 0.99,
  },
  {
    id: 't-5',
    title: 'Conectar frontend de Kanban con API REST',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    dueDate: '2026-07-27',
    aiConfidence: 0.45,
  },
  {
    id: 't-6',
    title: 'Pruebas E2E del sistema de drag and drop',
    status: TaskStatus.TODO,
    priority: TaskPriority.LOW,
    aiConfidence: 0.60,
  }
];
