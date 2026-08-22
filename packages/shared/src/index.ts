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

/**
 * Estado de triage de un correo en la bandeja (Sprint 4.5).
 *
 * Son los cuatro valores del enum del esquema. Se declaran aquí porque el
 * frontend los venía escribiendo como texto suelto (`'PENDING'`), y una errata
 * en una cadena no la ve nadie hasta que el endpoint devuelve un 400.
 *
 * Recordatorio del contrato: la bandeja **avanza pero no retrocede sola**.
 * Volver a `PENDING` desde cualquiera de los otros tres es una anulación
 * explícita y pide `force: true`, o el endpoint responde 409.
 */
export enum EmailStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  DISMISSED = "DISMISSED",
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
  /**
   * Por qué la prioridad de esta tarea no es la que pidió quien la creó, en
   * texto ya legible (`"vence en 3 h (<24 h): LOW → URGENT"`). `null` o ausente
   * cuando nadie la tocó, que es el caso normal: si hay texto, hubo ajuste.
   *
   * Los tres campos van planos y no anidados en un objeto a propósito: Prisma
   * los devuelve así en `GET /tasks`, en el 201 de `POST /tasks` y en los
   * eventos `task.*` de socket sin mapeo intermedio, y anidarlos obligaría a
   * mapear en cinco sitios con el riesgo de que alguno quede con otra forma.
   */
  priorityReason?: string | null;
  /** ISO 8601 del momento del ajuste. `null` si no hubo. */
  priorityAdjustedAt?: string | null;
  /** De qué prioridad venía antes del ajuste. `null` si no hubo. */
  priorityAdjustedFrom?: TaskPriority | null;
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

/** Un punto de una serie por día de `GET /dashboard/metrics`. */
export interface MetricsDayPoint {
  /** `YYYY-MM-DD` en la zona horaria de la ventana. */
  date: string;
}

export interface ThroughputPoint extends MetricsDayPoint {
  count: number;
}

export interface TimeSeriesPoint extends MetricsDayPoint {
  seconds: number;
}

/**
 * Lo que devuelve `GET /dashboard/metrics` (Sprint 8).
 *
 * Cuatro cosas que conviene saber antes de pintarlo, porque no se deducen de la
 * forma:
 *
 * 1. `wip` es **solo** `IN_PROGRESS`. Las atrasadas no suman; están aparte en
 *    `overdue`.
 * 2. Las series traen **todos** los días de la ventana, también los de cero, y
 *    ya vienen ordenadas: se le pueden pasar a Recharts tal cual, sin rellenar
 *    huecos ni ordenar claves.
 * 3. `byStatus` y `byPriority` traen **siempre** todas las claves del enum, con
 *    cero donde no hay nada, para que la leyenda no cambie de tamaño.
 * 4. Los días se cortan en `window.tz` (por defecto `America/Cancun`, UTC−5
 *    fijo), no en UTC: cerrar algo a las 19:00 cuenta para ese día.
 */
export interface DashboardMetrics {
  generatedAt: string;
  window: {
    /** Inclusivo. */
    from: string;
    /** Exclusivo. */
    to: string;
    /** Días que cubre; es también el largo de las series. */
    days: number;
    tz: string;
  };
  tasks: {
    byStatus: Record<TaskStatus, number>;
    total: number;
  };
  /** Trabajo en curso: tareas en `IN_PROGRESS`. */
  wip: number;
  overdue: {
    count: number;
    byPriority: Record<TaskPriority, number>;
  };
  throughput: {
    completedInWindow: number;
    /** Media por día de la ventana, con un decimal. */
    avgPerDay: number;
    perDay: ThroughputPoint[];
  };
  time: {
    totalSecInWindow: number;
    perDay: TimeSeriesPoint[];
  };
  inbox: {
    pending: number;
    byStatus: Record<EmailStatus, number>;
  };
}

export const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: TaskStatus.TODO, label: "Por hacer" },
  { status: TaskStatus.IN_PROGRESS, label: "En proceso" },
  { status: TaskStatus.POSTPONED, label: "Pospuestas" },
  { status: TaskStatus.DONE, label: "Cumplidas" },
  { status: TaskStatus.OVERDUE, label: "Atrasadas" },
];

// ─── Contrato del socket ─────────────────────────────────────────────────────
//
// **Viven aquí y no en el backend porque los consumen los dos lados.** El
// servidor los emite y el cliente decide qué hacer con ellos; mientras estuvieron
// solo en `apps/api`, la única forma de que el frontend programara contra ellos
// era copiar las cadenas a mano — y una constante copiada es una constante que se
// desincroniza el día que alguien la cambia de un solo lado.

/**
 * Por qué el servidor rechaza o cierra una sesión de socket.
 *
 * **Se programa contra el `codigo`, nunca contra el mensaje**: el mensaje es
 * texto para un humano y puede cambiar sin avisar.
 *
 * | Código | Qué debe hacer el cliente |
 * |---|---|
 * | `SESION_CADUCADA` | Refrescar **una vez** y reconectar. Sin molestar al usuario |
 * | `SESION_INVALIDA` | **Dejar de reintentar** y mandar al login |
 * | `ERROR_INTERNO` | Reconexión normal, con tope. **No** mandar al login |
 *
 * La diferencia entre las dos primeras decide si el usuario ve un login o no ve
 * nada. Y `ERROR_INTERNO` existe para que un tropiezo del servidor no eche a
 * nadie: un rechazo que no sabe por qué rechaza no debería poder cerrar sesión.
 */
export const CODIGO_SESION = {
  caducada: "SESION_CADUCADA",
  invalida: "SESION_INVALIDA",
  errorInterno: "ERROR_INTERNO",
} as const;

export type CodigoSesion = (typeof CODIGO_SESION)[keyof typeof CODIGO_SESION];

/**
 * Eventos de sesión que el servidor emite por el socket ya establecido.
 *
 * Hace falta un evento propio porque **`connect_error` solo existe durante el
 * handshake**: una vez conectado, un cierre del servidor le llega al cliente como
 * un `disconnect` pelado, indistinguible de que se haya caído el wifi.
 */
export const SESSION_EVENTS = {
  /** La sesión del socket dejó de valer. Cuerpo: `{ codigo: CodigoSesion }`. */
  rechazada: "session.rechazada",
} as const;

/** Cuerpo de {@link SESSION_EVENTS.rechazada}. */
export interface SesionRechazadaEvento {
  codigo: CodigoSesion;
}
