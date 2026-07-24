// Tipos y enums compartidos entre `api` y `web`.

export enum TaskStatus {
  TODO = "TODO", // Por hacer
  IN_PROGRESS = "IN_PROGRESS", // En proceso
  POSTPONED = "POSTPONED", // Pospuestas
  DONE = "DONE", // Cumplidas
  OVERDUE = "OVERDUE", // Atrasadas (derivado por fecha de vencimiento)
}

export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum EmailCategory {
  CLIENTE = "cliente",
  INTERNO = "interno",
  PROVEEDOR = "proveedor",
  ADMINISTRATIVO = "administrativo",
  SPAM = "spam",
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  sourceEmailId?: string | null;
  tags: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

// Salida estructurada esperada del módulo de IA al clasificar un correo.
export interface EmailClassification {
  category: EmailCategory;
  isActionable: boolean;
  summary: string;
  tasks: Array<{
    title: string;
    description?: string;
    priority: TaskPriority;
    dueDate?: string | null;
    confidence: number;
  }>;
}

export const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: TaskStatus.TODO, label: "Por hacer" },
  { status: TaskStatus.IN_PROGRESS, label: "En proceso" },
  { status: TaskStatus.POSTPONED, label: "Pospuestas" },
  { status: TaskStatus.DONE, label: "Cumplidas" },
  { status: TaskStatus.OVERDUE, label: "Atrasadas" },
];
