/**
 * Traducción de nuestros logs al formato que Google Cloud entiende.
 *
 * Cloud Logging no lee un JSON cualquiera: reconoce **un puñado de campos con
 * nombre reservado** y trata el resto como carga útil. Escribir esos campos con
 * el nombre exacto es lo que separa un log consultable de una pared de texto:
 *
 * | Campo | Para qué |
 * |---|---|
 * | `severity` | El nivel. Sin esto **todo entra como `DEFAULT`** y no se puede filtrar por gravedad, ni salta Error Reporting |
 * | `message` | El texto que se ve en la lista sin desplegar la entrada |
 * | `time` | La hora del suceso. Sin ella se usa la de recepción, que llega después y desordena lo que pasó en el mismo milisegundo |
 * | `logging.googleapis.com/trace` | Enlaza todas las líneas de una misma petición |
 * | `httpRequest` | Método, ruta, estado y latencia en la columna de la consola |
 *
 * Y el que hace el trabajo de Sentry sin Sentry: una entrada con `severity`
 * `ERROR` o peor y un `@type` de `ReportedErrorEvent` **la recoge Error
 * Reporting automáticamente**, la agrupa por firma de la pila y la cuenta por
 * versión. No hay que enviar nada a ningún sitio: se escribe en la salida
 * estándar y el agente de Cloud Run hace el resto.
 */

/** El nivel de pino, con el nombre y los valores que espera Cloud Logging. */
const SEVERITY_BY_LEVEL: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export const severityFor = (label: string): string =>
  SEVERITY_BY_LEVEL[label] ?? 'DEFAULT';

/**
 * La marca que hace que Error Reporting recoja una entrada de log.
 *
 * Va acompañada de un `message` que **contiene la traza de pila entera**: es de
 * ahí de donde saca la firma con la que agrupa incidencias. Un `message` con
 * solo el texto del error las agruparía todas juntas.
 */
export const REPORTED_ERROR_EVENT_TYPE =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

/** Nombres reservados de Cloud Logging que usamos. */
export const GCP_TRACE_KEY = 'logging.googleapis.com/trace';
export const GCP_SPAN_KEY = 'logging.googleapis.com/spanId';
export const GCP_TRACE_SAMPLED_KEY = 'logging.googleapis.com/trace_sampled';

export interface TraceFields {
  [GCP_TRACE_KEY]?: string;
  [GCP_SPAN_KEY]?: string;
  [GCP_TRACE_SAMPLED_KEY]?: boolean;
}

/**
 * Saca el rastro de las cabeceras que pone Google delante de la aplicación.
 *
 * Se miran las dos porque Cloud Run manda las dos: `traceparent` es el estándar
 * de W3C y `X-Cloud-Trace-Context` es la propia de Google, más antigua y la que
 * sigue apareciendo sola en algunos productos. Se prefiere la estándar.
 *
 * Sin `projectId` no se devuelve el rastro: el campo `trace` de Cloud Logging
 * tiene que ir con la forma `projects/<id>/traces/<hex>` y a medias no enlaza
 * nada — mejor no escribirlo que escribirlo roto.
 */
export function traceFieldsFrom(
  headers: Record<string, string | string[] | undefined>,
  projectId?: string,
): TraceFields {
  if (!projectId) return {};

  const header = (name: string): string | undefined => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  // traceparent: 00-<trace-id 32 hex>-<span-id 16 hex>-<flags 2 hex>
  const traceparent = header('traceparent');
  if (traceparent) {
    const [, traceId, spanId, flags] = traceparent.split('-');
    if (traceId && spanId) {
      return {
        [GCP_TRACE_KEY]: `projects/${projectId}/traces/${traceId}`,
        [GCP_SPAN_KEY]: spanId,
        [GCP_TRACE_SAMPLED_KEY]: (parseInt(flags, 16) & 1) === 1,
      };
    }
  }

  // X-Cloud-Trace-Context: <trace-id>/<span-id>;o=1
  const cloudTrace = header('x-cloud-trace-context');
  if (cloudTrace) {
    const [ids, options] = cloudTrace.split(';');
    const [traceId, spanId] = ids.split('/');
    if (traceId) {
      let spanHex: string | undefined;
      if (spanId) {
        try {
          // X-Cloud-Trace-Context usa un decimal de 64 bits. Cloud Logging lo
          // espera en hexadecimal. `BigInt` evita la pérdida de precisión.
          spanHex = BigInt(spanId).toString(16).padStart(16, '0');
        } catch {
          // Si no es un número válido, se ignora en vez de romper la petición.
        }
      }

      return {
        [GCP_TRACE_KEY]: `projects/${projectId}/traces/${traceId}`,
        ...(spanHex ? { [GCP_SPAN_KEY]: spanHex } : {}),
        [GCP_TRACE_SAMPLED_KEY]: options === 'o=1',
      };
    }
  }

  return {};
}

/**
 * Parámetros de consulta cuyo valor **no puede acabar en un log**.
 *
 * Esto no es precaución teórica: `GET /auth/google/callback?code=…&state=…`
 * lleva el código de autorización de Google en la propia URL, y el serializador
 * por defecto de `pino-http` registra `req.url` entero. Sin esta lista, cada
 * inicio de sesión dejaría escrito en Cloud Logging el código con el que se
 * canjean los tokens de Gmail de la persona.
 */
const REDACTED_QUERY_PARAMS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'key',
  'api_key',
  'apikey',
  'password',
  'secret',
]);

export const REDACTED = '[REDACTADO]';

/**
 * Devuelve la URL con los valores sensibles tapados y el resto intacto.
 *
 * Se conserva lo demás —`?tz=`, `?groupBy=`, `?from=`— porque es justo lo que
 * se necesita para entender un fallo, y no tiene nada de secreto. Tapar la
 * cadena de consulta entera sería más simple y dejaría los logs inútiles.
 */
export function sanitizeUrl(url: string): string {
  const separator = url.indexOf('?');
  if (separator === -1) return url;

  const path = url.slice(0, separator);
  const params = new URLSearchParams(url.slice(separator + 1));

  let touched = false;
  for (const name of [...params.keys()]) {
    if (REDACTED_QUERY_PARAMS.has(name.toLowerCase())) {
      params.set(name, REDACTED);
      touched = true;
    }
  }

  if (!touched) return url;
  return `${path}?${params.toString()}`;
}
