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
  status?: string;
  /**
   * Cuántas tareas dejó la IA esperando decisión en este correo.
   *
   * **Es el único distintivo que separa "aún no lo he mirado" de "esto te está
   * esperando".** Desde la Fase 6 la IA no escribe en el tablero, así que
   * `taskCount` sigue en 0 mientras hay propuestas vivas: sin este número los
   * dos casos se pintan idénticos.
   *
   * Opcional porque una API anterior a la Fase 6 no lo manda, y una bandeja que
   * se rompe contra la versión desplegada no le sirve a nadie.
   */
  proposedTaskCount?: number;
  /** El correo trae adjuntos, cuyo contenido no bajamos ni lee el modelo. */
  hasAttachments?: boolean;
  /**
   * Si el modelo vio algo que hacer en este correo. `false` es la mitad de la
   * bandeja que se puede limpiar de un golpe.
   *
   * **Ojo: hoy no llega.** `GET /emails` acepta `?actionable=false` para
   * filtrar, pero `SELECT_TRIAGE` no incluye la columna, así que la fila viaja
   * sin ella y aquí es `undefined` en los tres casos —accionable, no accionable
   * y sin analizar—. Está pedido en el buzón.
   *
   * Por eso el código nunca pregunta `!isActionable`: eso metería en la
   * selección masiva todo lo que la API aún no sabe contar. Se pregunta
   * `isActionable === false`, y quien ofrece el atajo comprueba antes que el
   * campo exista de verdad en las filas cargadas.
   */
  isActionable?: boolean;
}

/** Mensajes de un mismo hilo, del más reciente al más antiguo. */
export interface EmailThread {
  threadId: string;
  messages: EmailSnippet[];
  /** Mensaje más reciente: es el que representa al hilo en la lista. */
  latest: EmailSnippet;
}
