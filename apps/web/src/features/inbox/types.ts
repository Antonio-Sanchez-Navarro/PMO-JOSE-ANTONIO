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
   * ⚠️ **Un `false` aquí no es un veredicto.** La columna nace en `false` y se
   * queda así hasta que alguien clasifique el correo, así que «es un boletín» y
   * «nadie lo ha mirado» se leen igual desde este campo, y en una fila suelta no
   * hay forma de separarlos.
   *
   * Por eso **el descarte en bloque no lo mira nunca**: usa
   * `InboxThread.allNonActionable`, que exige que el worker despachara el correo
   * y que la IA llegara a opinar. Este campo vale para leer un correo concreto,
   * no para barrer.
   */
  isActionable?: boolean;
  /**
   * Empresa del grupo mencionada en el correo (`EMPRESAS`), o `null`.
   *
   * ⚠️ **`null` no es «sin clasificar»**: es «no menciona ninguna de las que nos
   * importan», y es el caso normal. No hay valor de respaldo a propósito —un
   * `OTHER` aquí sería un cajón de cosas sin nada en común—. Para saber si un
   * correo llegó a analizarse, `processedAt` en el detalle.
   */
  company?: string | null;
  /** Banco o financiera (`BANCOS`), o `null`. Misma advertencia que `company`. */
  bank?: string | null;
}

/**
 * Un hilo de decisión, tal como lo sirve `GET /emails/threads`.
 *
 * **No trae los mensajes, solo sus ids.** La bandeja pinta el más reciente y
 * despacha el hilo entero: `emailIds` son exactamente los correos que
 * `bulk-dismiss` va a mover, ni uno más, y esa correspondencia es lo que
 * permite descartar una conversación sin abrirla.
 */
export interface InboxThread {
  threadId: string;
  /**
   * Correos de este hilo **que quedan dentro del filtro**, no de la
   * conversación de Gmail. Con `?status=PENDING`, un hilo de seis mensajes del
   * que solo dos siguen pendientes llega con `messageCount: 2`.
   *
   * Por eso la interfaz nunca lo pinta como «mensajes de la conversación»:
   * mentiría en cuanto haya un filtro puesto, que es siempre.
   */
  messageCount: number;
  emailIds: string[];
  /** El más reciente, en la misma forma que una fila de `GET /emails`. */
  latest: EmailSnippet;
  /**
   * Todos los correos del hilo son no accionables **y el modelo llegó a
   * decirlo**: despachado por el worker, sin `skipReason` y con veredicto
   * negativo.
   *
   * **Es el único campo con el que se puede barrer a ciegas.** `isActionable`
   * de una fila no sirve: la columna nace en `false` y se queda ahí hasta que
   * alguien clasifique el correo, así que «es un boletín» y «nadie lo ha
   * mirado» se leen igual desde ella. Aquí ya están separados.
   */
  allNonActionable: boolean;
  /** Propuestas de IA esperando decisión en todo el hilo. */
  proposedTaskCount: number;
  hasAttachments: boolean;
}

/** Lo que devuelve `GET /emails/threads`: hilos paginados y los dos totales. */
export interface ThreadPage {
  items: InboxThread[];
  /** Hilos que deja el filtro, no los de la página. */
  total: number;
  /** Correos que deja el filtro. Son dos números y ninguno sustituye al otro. */
  totalEmails: number;
}
