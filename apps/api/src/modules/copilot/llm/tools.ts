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
