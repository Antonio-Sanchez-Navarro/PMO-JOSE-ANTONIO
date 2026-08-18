/**
 * Las herramientas del copiloto, definidas **una sola vez** para los dos
 * proveedores.
 *
 * Se puede porque los dos aceptan JSON Schema: Anthropic en `input_schema` y
 * Google en `parametersJsonSchema`. Mantener dos esquemas paralelos —uno por
 * SDK— sería la garantía de que un día divergen y el frontend recibe un
 * `payload` distinto según a quién le preguntes.
 */

/** El nombre viaja tal cual en el evento SSE: es parte del contrato con el frontend. */
export const DRAFT_EMAIL = 'draft_email';

/**
 * Esquema de `draft_email`.
 *
 * `cc` es opcional para el modelo (no se le obliga a inventar copias), pero el
 * evento que sale hacia el frontend **siempre** lo lleva —vacío si no hay— para
 * que la interfaz no tenga que distinguir "sin copia" de "campo ausente". De eso
 * se encarga `parseDraftEmail`.
 */
export const DRAFT_EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    to: {
      type: 'array',
      items: { type: 'string' },
      description: 'Destinatarios principales, como direcciones de correo.',
    },
    cc: {
      type: 'array',
      items: { type: 'string' },
      description: 'Direcciones en copia. Omitir si no hay.',
    },
    subject: { type: 'string', description: 'Asunto del correo.' },
    body: { type: 'string', description: 'Cuerpo del correo, en texto plano.' },
  },
  required: ['to', 'subject', 'body'],
  additionalProperties: false,
} as const;

export const DRAFT_EMAIL_DESCRIPTION =
  'Redacta un borrador de correo para que la persona lo revise antes de enviarlo. ' +
  'Úsala siempre que te pidan escribir, redactar o responder un correo: el borrador ' +
  'se le enseña en un editor, no se envía solo. No escribas el correo como texto ' +
  'de la respuesta — para eso está esta herramienta.';

/** El nombre viaja tal cual en el evento SSE, igual que `draft_email`. */
export const CREATE_TASK = 'create_task';

/**
 * Esquema de `create_task`.
 *
 * `sourceEmailId` es la razón por la que Doc pidió el contexto **antes** que
 * las herramientas: si la persona tiene un correo abierto, la tarea que salga
 * de él debe quedar enlazada. El modelo lo copia del bloque de contexto que ya
 * recibe en el prompt.
 *
 * No hay `assigneeId`: hoy las tareas son de su dueño y no existe asignación a
 * terceros en el esquema. Añadir el campo ahora sería un hueco que el modelo
 * rellenaría con ids inventados.
 */
export const CREATE_TASK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Qué hay que hacer, en una línea.' },
    description: { type: 'string', description: 'Detalle o contexto de la tarea.' },
    priority: {
      type: 'string',
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      description: 'Prioridad. Si no está claro, MEDIUM.',
    },
    dueDate: {
      type: 'string',
      description: 'Fecha límite en ISO 8601, solo si el texto la menciona.',
    },
    sourceEmailId: {
      type: 'string',
      description:
        'Id del correo del que sale la tarea. Cópialo del contexto si hay un correo abierto.',
    },
  },
  required: ['title'],
  additionalProperties: false,
} as const;

export const CREATE_TASK_DESCRIPTION =
  'Propone una tarea para el tablero. Úsala cuando de la conversación o del correo salga ' +
  'algo que haya que hacer. La tarea no se crea sola: se le enseña a la persona para que ' +
  'la confirme, así que propón en vez de preguntar si quiere que la crees.';

/** El nombre viaja tal cual en el evento SSE, igual que las otras. */
export const CHANGE_EMAIL_STATUS = 'change_email_status';

/** El vocabulario de estados, que es el `EmailStatus` de Prisma y nada más. */
export const ESTADOS_DE_CORREO = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED'] as const;

/**
 * Esquema de `change_email_status`.
 *
 * **No lleva `force`, y es a propósito.** Reabrir un correo ya despachado
 * responde 409 salvo con `force: true` — «la excepción del dueño», dice
 * `emails.controller.ts`. Poner ese campo en el esquema le daría al modelo la
 * llave para saltarse una barrera que existe justamente para que la salte una
 * persona a sabiendas. El frontend puede añadirlo al confirmar, después de ver
 * el 409; el modelo no.
 */
export const CHANGE_EMAIL_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    emailId: {
      type: 'string',
      description: 'Id del correo. Cópialo del contexto o del resultado de una búsqueda.',
    },
    status: {
      type: 'string',
      enum: [...ESTADOS_DE_CORREO],
      description:
        'Estado propuesto: PENDING (por despachar), IN_PROGRESS (en ello), ' +
        'COMPLETED (hecho) o DISMISSED (descartado).',
    },
  },
  required: ['emailId', 'status'],
  additionalProperties: false,
} as const;

export const CHANGE_EMAIL_STATUS_DESCRIPTION =
  'Propone mover un correo por el triage de la bandeja. Úsala cuando de la conversación se ' +
  'desprenda que un correo ya está atendido, descartado o en curso. El cambio no se aplica ' +
  'solo: se le enseña a la persona para que lo confirme, así que propón en vez de preguntar ' +
  'si quiere que lo cambies. Si no tienes el id del correo delante, búscalo antes.';

export const SEARCH_EMAILS = 'search_emails';
export const GET_METRICS = 'get_metrics';

export const SEARCH_EMAILS_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Qué buscar. Se busca en asunto, remitente y cuerpo del correo.',
    },
    limit: { type: 'integer', description: 'Cuántos devolver como mucho. Por defecto 10.' },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

export const SEARCH_EMAILS_DESCRIPTION =
  'Busca en los correos de la persona. Úsala cuando te pregunten por algo que estaría en su ' +
  'correo y no lo tengas delante, en vez de decir que no lo sabes.';

export const GET_METRICS_SCHEMA = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const GET_METRICS_DESCRIPTION =
  'Devuelve el estado del tablero: cuántas tareas hay por columna, cuántas vencidas, ' +
  'cuántos correos quedan por despachar y el tiempo registrado esta semana. Úsala cuando ' +
  'te pregunten cómo va todo o pidan un resumen.';

/**
 * Las dos formas de herramienta, que es lo que decide qué pasa cuando el modelo
 * la pide.
 *
 * - `propose`: **sale hacia el frontend** como evento `tool_call` y ahí termina
 *   el turno. Es lo que hace algo hacia afuera —mandar un correo, crear una
 *   tarea— y por eso lo confirma una persona.
 * - `execute`: **la ejecuta el backend** y le devuelve el resultado al modelo
 *   dentro del mismo turno, para que siga respondiendo con el dato en la mano.
 *   Solo para lecturas: no cambian nada, así que pedir confirmación sería
 *   interrumpir para preguntar si se puede mirar.
 */
export type ToolKind = 'propose' | 'execute';

/**
 * El catálogo completo, en un solo sitio.
 *
 * Cada estrategia lo traduce a su vocabulario (`input_schema` en Anthropic,
 * `parametersJsonSchema` en Google) recorriendo esta lista, así que añadir una
 * herramienta es una entrada aquí y nada más.
 */
export const COPILOT_TOOLS: readonly {
  name: string;
  description: string;
  schema: unknown;
  kind: ToolKind;
}[] = [
  {
    name: DRAFT_EMAIL,
    description: DRAFT_EMAIL_DESCRIPTION,
    schema: DRAFT_EMAIL_SCHEMA,
    kind: 'propose',
  },
  {
    name: CREATE_TASK,
    description: CREATE_TASK_DESCRIPTION,
    schema: CREATE_TASK_SCHEMA,
    kind: 'propose',
  },
  {
    name: CHANGE_EMAIL_STATUS,
    description: CHANGE_EMAIL_STATUS_DESCRIPTION,
    schema: CHANGE_EMAIL_STATUS_SCHEMA,
    // `propose`, como todo lo que cambia algo. Ponerla en `execute` se saltaría
    // la confirmación humana sin que nadie lo note: la prueba del catálogo
    // existe para que ese cambio no pase desapercibido en una revisión.
    kind: 'propose',
  },
  {
    name: SEARCH_EMAILS,
    description: SEARCH_EMAILS_DESCRIPTION,
    schema: SEARCH_EMAILS_SCHEMA,
    kind: 'execute',
  },
  {
    name: GET_METRICS,
    description: GET_METRICS_DESCRIPTION,
    schema: GET_METRICS_SCHEMA,
    kind: 'execute',
  },
];

/** ¿La ejecuta el backend en el mismo turno, o se le enseña a la persona? */
export function esEjecutable(toolName: string): boolean {
  return COPILOT_TOOLS.some((t) => t.name === toolName && t.kind === 'execute');
}

/** Lo que viaja en `payload` del evento `tool_call`. */
export interface CreateTaskPayload {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  sourceEmailId: string | null;
}

const PRIORIDADES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * Normaliza la propuesta de tarea a la forma exacta que espera el frontend.
 *
 * Misma razón que en el correo: los SDK entregan los argumentos sin tipar y la
 * tarjeta no debería defenderse de un `priority` inventado o una fecha que no
 * lo es. Una prioridad fuera del vocabulario cae a `MEDIUM` en vez de tumbar la
 * propuesta entera — es lo que hace también la capa de prioridad del Sprint 3.
 */
export function parseCreateTask(args: unknown): CreateTaskPayload {
  const entrada = (args ?? {}) as Record<string, unknown>;
  const priority = typeof entrada.priority === 'string' ? entrada.priority.toUpperCase() : '';
  const dueDate = typeof entrada.dueDate === 'string' ? entrada.dueDate : '';

  return {
    title: typeof entrada.title === 'string' ? entrada.title.trim() : '',
    description: typeof entrada.description === 'string' ? entrada.description : '',
    priority: (PRIORIDADES as readonly string[]).includes(priority)
      ? (priority as CreateTaskPayload['priority'])
      : 'MEDIUM',
    // Una fecha que no se puede parsear se descarta: pintar "Invalid Date" en
    // la tarjeta es peor que no enseñar fecha.
    dueDate: dueDate && !Number.isNaN(Date.parse(dueDate)) ? new Date(dueDate).toISOString() : null,
    sourceEmailId: typeof entrada.sourceEmailId === 'string' ? entrada.sourceEmailId : null,
  };
}

/** Lo que viaja en `payload` del evento `tool_call`. */
export interface DraftEmailPayload {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
}

/** Deja una lista de direcciones limpia: sin huecos, sin espacios sueltos, sin duplicados. */
function direcciones(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];

  const limpias = valor
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);

  return [...new Set(limpias)];
}

/**
 * Normaliza lo que devolvió el modelo a la forma exacta que espera el frontend.
 *
 * No es desconfianza gratuita: los dos SDK entregan los argumentos como un
 * objeto sin tipar, y aunque el esquema los guíe, el modelo puede mandar `to`
 * como cadena suelta, omitir `cc` o colar un elemento vacío. Pintar eso en un
 * editor de correo daría un destinatario en blanco o un `undefined.length`.
 *
 * La forma de salida es fija: los cuatro campos siempre, `to` y `cc` siempre
 * arreglos.
 */
/**
 * Normaliza los argumentos de la herramienta que sea.
 *
 * Un solo sitio donde se decide qué parser aplica: si cada estrategia eligiera
 * el suyo, añadir una herramienta obligaría a tocar los dos proveedores y sería
 * cuestión de tiempo que uno se quedara atrás.
 */
export function parseToolArgs(toolName: string, args: unknown): unknown {
  if (toolName === DRAFT_EMAIL) return parseDraftEmail(args);
  if (toolName === CREATE_TASK) return parseCreateTask(args);
  if (toolName === CHANGE_EMAIL_STATUS) return parseChangeEmailStatus(args);

  // Una herramienta que no conocemos no debería llegar aquí —el catálogo lo
  // fijamos nosotros— pero devolver lo que vino es mejor que reventar el
  // stream a medias.
  return args;
}

export function parseDraftEmail(args: unknown): DraftEmailPayload {
  const entrada = (args ?? {}) as Record<string, unknown>;

  return {
    // Una cadena suelta se acepta como un destinatario: es un error frecuente
    // del modelo y descartarlo perdería el borrador entero.
    to: typeof entrada.to === 'string' ? direcciones([entrada.to]) : direcciones(entrada.to),
    cc: typeof entrada.cc === 'string' ? direcciones([entrada.cc]) : direcciones(entrada.cc),
    subject: typeof entrada.subject === 'string' ? entrada.subject : '',
    body: typeof entrada.body === 'string' ? entrada.body : '',
  };
}

/** Lo que viaja en `payload` del evento `tool_call`. */
export interface ChangeEmailStatusPayload {
  emailId: string;
  /** `null` si el modelo propuso algo que no está en el vocabulario. */
  status: (typeof ESTADOS_DE_CORREO)[number] | null;
}

/**
 * Normaliza la propuesta de cambio de estado.
 *
 * ⚠️ **Un estado desconocido cae a `null`, NO a un valor por defecto**, y esta
 * es la diferencia con `parseCreateTask`. Allí una prioridad inventada baja a
 * `MEDIUM` porque equivocarse de prioridad es barato y perder la propuesta
 * entera es peor. Aquí no hay ningún estado inocente al que caer: elegir uno
 * convertiría una respuesta ininteligible del modelo en una acción concreta
 * sobre la bandeja de alguien. `DISMISSED` por descarte descartaría correos.
 *
 * Con `null`, la tarjeta tiene cómo saber que la propuesta no es confirmable y
 * no ofrecer el botón. Es la misma regla del filtro de excepciones y del guard
 * de OIDC: ante la duda, no actuar.
 */
export function parseChangeEmailStatus(args: unknown): ChangeEmailStatusPayload {
  const entrada = (args ?? {}) as Record<string, unknown>;
  const estado = typeof entrada.status === 'string' ? entrada.status.trim().toUpperCase() : '';

  return {
    emailId: typeof entrada.emailId === 'string' ? entrada.emailId.trim() : '',
    status: (ESTADOS_DE_CORREO as readonly string[]).includes(estado)
      ? (estado as ChangeEmailStatusPayload['status'])
      : null,
  };
}
