/**
 * Reconocer cuándo Gmail nos está diciendo «para», y distinguirlo de todo lo
 * demás.
 *
 * Nace del incendio del 2026-09-08: la clasificación se rompió por una clave de
 * Anthropic inválida, los correos se quedaron sin encolar, y eso hizo que
 * `syncHistory` **retuviera el marcador de historial** —que es lo correcto
 * cuando falla un correo suelto— y volviera a descargar el mismo tramo en cada
 * notificación. Cada vuelta gastaba cuota de Gmail, y cuando la cuota se agotó,
 * el 403 pasó a contar como «un correo que no se pudo descargar»: más motivo
 * para retener el marcador, y más vueltas. Un bucle que se alimenta solo.
 *
 * La lección, y por eso este archivo existe: **un fallo por correo y un fallo de
 * la API entera no se parecen en nada**. El primero se reintenta; el segundo hay
 * que dejar de intentarlo inmediatamente, porque cada reintento empeora
 * exactamente aquello que lo causó.
 */

/**
 * Motivos con los que Google dice «te has pasado de cuota».
 *
 * Se mira el **motivo**, no el estado: Gmail devuelve 403 tanto para esto como
 * para `insufficientPermissions` —«esta clave no tiene permiso»—, y son cosas
 * opuestas. Confundirlas dormiría la cola esperando una cuota que se rellena
 * sola cuando el problema real es un OAuth mal concedido, que no se arregla
 * esperando ni en una hora ni en un día. Es la misma trampa que ya está
 * documentada para el 403 de Anthropic (`billing_error` contra
 * `permission_error`).
 */
const MOTIVOS_DE_CUOTA = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
  'backendError',
]);

/** El estado HTTP, mirando los tres sitios donde `googleapis` lo deja. */
function estadoHttp(error: unknown): number | null {
  const e = error as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  for (const valor of [e?.code, e?.status, e?.response?.status]) {
    if (typeof valor === 'number') return valor;
  }
  return null;
}

/** Los `reason` que trae el cuerpo del error, vengan por donde vengan. */
function motivos(error: unknown): string[] {
  const e = error as {
    errors?: Array<{ reason?: unknown }>;
    response?: { data?: { error?: { errors?: Array<{ reason?: unknown }> } } };
  } | null;

  const listas = [e?.errors, e?.response?.data?.error?.errors];
  return listas
    .flatMap((lista) => lista ?? [])
    .map((entrada) => String(entrada?.reason ?? ''))
    .filter(Boolean);
}

/**
 * ¿Es este error «no hay cuota, deja de pedir»?
 *
 * El 429 entra siempre: ahí no hay ambigüedad posible. El 403 solo entra si el
 * motivo lo confirma, con el texto del mensaje como **respaldo** —nunca en su
 * lugar—, porque algunos envoltorios se comen el cuerpo del error y dejan solo
 * la frase.
 */
export function esCuotaAgotada(error: unknown): boolean {
  const estado = estadoHttp(error);
  if (estado === 429) return true;
  if (estado !== 403) return false;

  if (motivos(error).some((motivo) => MOTIVOS_DE_CUOTA.has(motivo))) return true;

  const mensaje = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  return /quota exceeded|rate limit|too many requests/.test(mensaje);
}

/** Cuánto pide esperar Google, en milisegundos, o `null` si no lo dice. */
export function esperaSugeridaGmailMs(error: unknown, ahora: number = Date.now()): number | null {
  const cabeceras = (error as { response?: { headers?: Record<string, unknown> } } | null)?.response
    ?.headers;
  const crudo = cabeceras?.['retry-after'] ?? cabeceras?.['Retry-After'];
  if (crudo === undefined || crudo === null) return null;

  const texto = String(crudo).trim();

  // `Retry-After` viene en segundos o como fecha HTTP. Las dos formas son
  // válidas y hay que aceptar las dos: quedarse con una deja la otra en `NaN`,
  // que acabaría siendo una espera de cero.
  const segundos = Number(texto);
  const ms = Number.isFinite(segundos) ? segundos * 1000 : Date.parse(texto) - ahora;

  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

/**
 * Se acabó la cuota de Gmail. Envuelve al error original para no perder la
 * traza, y lleva encima **cuánto esperar** para que quien la reciba no tenga
 * que volver a leer las cabeceras.
 *
 * Es una clase y no un booleano por lo de siempre en esta casa: viaja hacia
 * arriba por sí sola, y quien la recibe no puede confundirla con «un correo
 * falló».
 */
export class GmailQuotaError extends Error {
  readonly esperaMs: number | null;
  readonly causaOriginal: unknown;

  constructor(causaOriginal: unknown, contexto: string) {
    super(`Cuota de Gmail agotada ${contexto}`);
    this.name = 'GmailQuotaError';
    this.esperaMs = esperaSugeridaGmailMs(causaOriginal);
    this.causaOriginal = causaOriginal;
  }
}
