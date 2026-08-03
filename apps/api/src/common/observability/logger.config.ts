import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import {
  GCP_TRACE_KEY,
  REDACTED,
  sanitizeUrl,
  severityFor,
  traceFieldsFrom,
} from './gcp-logging';

/**
 * Rutas que **no** generan una línea automática de petición.
 *
 * - Las sondas de salud las llama el orquestador cada pocos segundos, para
 *   siempre. Registrarlas es pagar almacenamiento en Cloud Logging por saber
 *   que la máquina sigue encendida, y de paso enterrar el tráfico real: en un
 *   día normal serían más líneas que peticiones de personas.
 * - `/copilot/chat` es un **stream SSE** que dura lo que dure la conversación.
 *   La línea de "petición completada" llegaría minutos tarde y con una
 *   duración que no mide nada: el tiempo que la persona tardó en leer.
 *
 * Los logs que escriba el código de esas rutas siguen saliendo; lo que se apaga
 * es solo el automático de entrada y salida.
 */
const SIN_LOG_AUTOMATICO = [/^\/health(\/|$)/, /^\/copilot\/chat(\?|$)/];

/** ¿La petición viene de una sonda de salud? La usa también el filtro global. */
export const esSondaDeSalud = (url: string): boolean => /^\/health(\/|$|\?)/.test(url);

/**
 * Qué se guarda de la petición, y **por qué tan poco**.
 *
 * El serializador por defecto de `pino-http` escribe `url`, `query`, `params`,
 * `headers`, `remoteAddress` y `remotePort`, y lo hace como *binding del logger
 * hijo*: no aparece solo en la línea de "petición completada", sino en **todas
 * las líneas que escriba cualquier código durante esa petición**.
 *
 * Comprobado contra la aplicación el 2026-08-03: con el serializador de fábrica,
 * `GET /auth/google/callback?code=…&state=…` dejaba el código de autorización de
 * Google **cuatro veces** en el log —en `url` y en `query`, y repetido en un
 * aviso que escribe `AuthService`—, aunque el texto del mensaje sí saliera
 * tapado. Tapar solo el mensaje daba una falsa sensación de seguridad.
 *
 * Por eso aquí no se filtra: se elige. `id`, `method` y la URL saneada. El
 * agente, la IP y el estado ya viajan en `httpRequest`, que es donde Cloud
 * Logging los sabe leer, y las cabeceras no hacen falta para diagnosticar nada
 * que no se vea en esos campos.
 */
const serializarPeticion = (req: IncomingMessage & { id?: unknown }) => ({
  id: req.id,
  method: req.method,
  url: sanitizeUrl(req.url ?? ''),
});

/** Del lado de la respuesta basta el estado: las cabeceras traen `set-cookie`. */
const serializarRespuesta = (res: ServerResponse) => ({ statusCode: res.statusCode });

/**
 * Campos que se tapan **en cualquier log**, venga de donde venga.
 *
 * `cookie` no es una precaución de manual: la sesión de esta API viaja en una
 * cookie `httpOnly` que **es** un JWT válido 15 minutos. Sin esta línea, cada
 * línea de log sería una credencial utilizable, y los logs los ve más gente y
 * durante más tiempo que la base de datos.
 */
const CAMPOS_TAPADOS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
];

const httpRequestFrom = (
  req: IncomingMessage,
  res: ServerResponse,
  responseTimeMs: unknown,
) => ({
  requestMethod: req.method,
  requestUrl: sanitizeUrl(req.url ?? ''),
  status: res.statusCode,
  userAgent: req.headers['user-agent'],
  remoteIp: req.socket?.remoteAddress,
  protocol: `HTTP/${req.httpVersion}`,
  // Cloud Logging quiere la latencia como duración en segundos con sufijo `s`.
  ...(typeof responseTimeMs === 'number'
    ? { latency: `${(responseTimeMs / 1000).toFixed(3)}s` }
    : {}),
});

/**
 * Cambia el `req`/`res` que pone `pino-http` por el `httpRequest` de Cloud
 * Logging, que es el que la consola pinta en columnas.
 *
 * Se quitan los originales en vez de dejarlos al lado: duplican la información
 * y son los que arrastran las cabeceras completas. Lo que añadió `customProps`
 * —el rastro, el id de petición— se conserva.
 */
const conHttpRequest = (
  req: IncomingMessage,
  res: ServerResponse,
  val: Record<string, unknown>,
) => {
  const entrada: Record<string, unknown> = { ...val };
  const responseTimeMs = entrada.responseTime;

  delete entrada.req;
  delete entrada.res;
  delete entrada.responseTime;

  entrada.httpRequest = httpRequestFrom(req, res, responseTimeMs);
  return entrada;
};

/**
 * Configuración de logs de la API.
 *
 * Dos formatos, y la diferencia importa:
 *
 * - **`gcp`** (por defecto en producción) — JSON de una línea con los nombres
 *   reservados de Cloud Logging. Se escribe en la salida estándar y el agente
 *   de Cloud Run lo recoge solo: no hay que enviar nada a ninguna parte ni
 *   guardar credenciales de telemetría.
 * - **`pretty`** (por defecto fuera de producción) — texto coloreado para leer
 *   en la terminal.
 *
 * **Los formateadores de Google se aplican solo en `gcp`**, y no por gusto: el
 * de nivel sustituye el campo `level` por `severity`, y `pino-pretty` busca
 * `level` para colorear. Con los dos a la vez, la terminal se queda sin
 * colores y sin niveles.
 */
export interface EntornoDeLogs {
  NODE_ENV?: string;
  LOG_LEVEL?: string;
  LOG_FORMAT?: string;
  GOOGLE_CLOUD_PROJECT?: string;
}

const esFormatoDeGoogle = (env: EntornoDeLogs): boolean =>
  (env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'gcp' : 'pretty')) === 'gcp';

/**
 * Lo que hay que decir en voz alta al arrancar, o `null` si no hay nada.
 *
 * **Sin `GOOGLE_CLOUD_PROJECT` la correlación por traza se apaga sin avisar.**
 * No es un fallo —el enlace tiene que ir con la forma `projects/<id>/traces/…`
 * y a medias no correlaciona nada, así que es mejor no escribirlo—, pero es
 * silencioso, y lo silencioso se descubre el día que hace falta seguir una
 * petición entre servicios y no se puede.
 *
 * Cloud Run **no** la inyecta: pone `K_SERVICE` y `K_REVISION`, no el id del
 * proyecto. Hay que ponerla a mano en el despliegue.
 *
 * Va como aviso y no como error a propósito: los logs siguen sirviendo sin
 * rastro, y tumbar el arranque por esto sería peor que el problema.
 */
export function avisoDeConfiguracion(env: EntornoDeLogs): string | null {
  if (esFormatoDeGoogle(env) && !env.GOOGLE_CLOUD_PROJECT) {
    return (
      'GOOGLE_CLOUD_PROJECT está vacía: los logs salen en formato de Cloud ' +
      'Logging pero sin enlace de traza, así que las líneas de una misma ' +
      'petición no se agruparán en la consola. Cloud Run no la inyecta sola.'
    );
  }

  return null;
}

export function buildLoggerParams(env: EntornoDeLogs): Params {
  const enProduccion = env.NODE_ENV === 'production';
  const paraGoogle = esFormatoDeGoogle(env);
  const projectId = env.GOOGLE_CLOUD_PROJECT;

  return {
    /**
     * Nest guarda en `context` el nombre de la clase que registra
     * (`AiProcessor`, `GmailService`…). En Cloud Logging **`context` es un
     * campo del evento de Error Reporting** y tiene que ser un objeto: una
     * cadena ahí hace que la incidencia se descarte. Se renombra a `logger`,
     * que además se lee mejor.
     */
    renameContext: 'logger',

    pinoHttp: {
      level: env.LOG_LEVEL ?? (enProduccion ? 'info' : 'debug'),

      /**
       * Los serializadores ya dejan fuera las cabeceras, así que estas rutas
       * son cinturón sobre tirantes: cubren el caso de que alguien registre a
       * mano un `{ req }` o un `{ headers }` sin pasar por aquí.
       */
      redact: { paths: CAMPOS_TAPADOS, censor: REDACTED },

      serializers: { req: serializarPeticion, res: serializarRespuesta },

      ...(paraGoogle
        ? {
            messageKey: 'message',
            // Hora del suceso en ISO. Sin ella Cloud Logging usa la de
            // recepción, que llega después y desordena lo que pasó junto.
            timestamp: stdTimeFunctions.isoTime,
            formatters: {
              level: (label: string) => ({ severity: severityFor(label) }),
            },
          }
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
          }),

      /**
       * Un identificador por petición que viaja en todas sus líneas.
       *
       * Si Google ya puso un rastro delante, se reutiliza **su** identificador
       * en vez de inventar otro: así la línea de la aplicación y la del
       * balanceador se encuentran la una a la otra en la consola.
       */
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existente = req.headers['x-request-id'];
        const rastro = traceFieldsFrom(req.headers, projectId)[GCP_TRACE_KEY];

        const id =
          (Array.isArray(existente) ? existente[0] : existente) ??
          rastro?.split('/').pop() ??
          randomUUID();

        res.setHeader('x-request-id', id);
        return id;
      },

      customProps: (req: IncomingMessage) =>
        paraGoogle ? traceFieldsFrom(req.headers, projectId) : {},

      autoLogging: {
        ignore: (req: IncomingMessage) =>
          SIN_LOG_AUTOMATICO.some((patron) => patron.test(req.url ?? '')),
      },

      /**
       * Un 4xx **no es un fallo del servidor**: es un cliente pidiendo algo
       * que no puede. Registrarlo como `error` llena de rojo un panel donde el
       * rojo tiene que significar "hay que mirar esto", y de paso dispara
       * Error Reporting con cada contraseña mal escrita.
       */
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },

      customSuccessObject: conHttpRequest,
      customErrorObject: (
        req: IncomingMessage,
        res: ServerResponse,
        _error: Error,
        val: Record<string, unknown>,
      ) => conHttpRequest(req, res, val),

      customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
        `${req.method} ${sanitizeUrl(req.url ?? '')} ${res.statusCode}`,
      customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
        `${req.method} ${sanitizeUrl(req.url ?? '')} ${res.statusCode}`,
    },
  };
}
