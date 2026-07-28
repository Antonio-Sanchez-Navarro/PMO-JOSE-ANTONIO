/**
 * Contrato de `GET /gmail/inbox` — ver HANDOFF.md.
 * `date` llega como cabecera RFC 2822 cruda (p. ej. "Fri, 24 Jul 2026 15:30:00 -0500").
 */
export interface EmailSnippet {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  /** Etiquetas de Gmail: `INBOX`, `UNREAD`, `IMPORTANT`, `CATEGORY_*`, … */
  labels: string[];
  category?: string | null;
  taskCount?: number;
  isConverted?: boolean;
}

/** Mensajes de un mismo hilo, del más reciente al más antiguo. */
export interface EmailThread {
  threadId: string;
  messages: EmailSnippet[];
  /** Mensaje más reciente: es el que representa al hilo en la lista. */
  latest: EmailSnippet;
}
