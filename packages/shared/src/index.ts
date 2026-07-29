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

// De dónde salió la tarea. Solo las `EMAIL` las borra y recrea el reproceso
// automático de la bandeja; las demás las puso una persona.
export enum TaskSource {
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  MANUAL = "MANUAL",
}

/**
 * Vocabulario de categorías que devuelve el análisis de correo.
 *
 * Son exactamente los valores del `enum` del esquema de la herramienta en
 * `AiService`: si los dos se separan, el modelo devuelve categorías que el
 * frontend no sabe pintar. Una categoría fuera de la lista degrada a `OTHER`.
 *
 * Corregido el 2026-07-27: hasta entonces esto declaraba `cliente`, `interno`,
 * `proveedor`, `administrativo` y `spam`, que no los emitía nadie — quedaron de
 * un borrador del Sprint 0 y ningún archivo llegó a importarlos.
 */
export enum EmailCategory {
  PROJECT_MANAGEMENT = "PROJECT_MANAGEMENT",
  INVOICING = "INVOICING",
  MEETING = "MEETING",
  INFORMATIONAL = "INFORMATIONAL",
  OTHER = "OTHER",
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  sourceEmailId?: string | null;
  source: TaskSource;
  tags: string[];
  labels?: {
    id: string;
    name: string;
    color: string;
  }[];
  position: number;
  totalTimeSec?: number;
  activeTimeEntryId?: string | null;
  activeTimeStartedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  startedAt: string;
  endedAt?: string | null;
  durationSec?: number | null;
  note?: string | null;
}

/**
 * Una tarea propuesta por el análisis. No tiene `id` porque todavía no existe
 * en la base de datos: es lo que se le enseña a una persona para que lo
 * apruebe, lo edite o lo descarte.
 */
export interface ProposedTask {
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  tagIds?: string[];
  /** ISO 8601, o `null` si el correo no menciona fecha límite. */
  dueDate?: string | null;
}

/**
 * Lo que devuelve `POST /emails/:id/classify`: el análisis del correo **sin
 * que se haya escrito nada**. Es el payload de la cuarentena de validación.
 *
 * Corregido el 2026-07-27 para que describa lo que la API devuelve de verdad.
 * La versión anterior declaraba un `summary` que el modelo nunca ha producido y
 * una `confidence` por tarea, cuando la confianza es una sola por análisis.
 */
export interface EmailClassification {
  emailId: string;
  category: EmailCategory;
  isActionable: boolean;
  /** Confianza del análisis completo, entre 0 y 1. */
  aiConfidence: number;
  tasks: ProposedTask[];
}

export const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: TaskStatus.TODO, label: "Por hacer" },
  { status: TaskStatus.IN_PROGRESS, label: "En proceso" },
  { status: TaskStatus.POSTPONED, label: "Pospuestas" },
  { status: TaskStatus.DONE, label: "Cumplidas" },
  { status: TaskStatus.OVERDUE, label: "Atrasadas" },
];
