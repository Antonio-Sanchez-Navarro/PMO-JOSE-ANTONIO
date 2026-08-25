import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/**
 * El cliente de Anthropic, con la misma política de reintentos en los dos
 * sitios que hablan con el modelo: la tubería de clasificación (`AiService`) y
 * el copiloto (`AnthropicStrategy`).
 *
 * **El SDK ya reintenta solo**, y eso es lo que aprovecha este módulo en vez de
 * escribir un bucle propio: reintenta 408, 409, 429 y 5xx con espera
 * exponencial, respeta la cabecera `retry-after` de la respuesta y no toca los
 * 4xx que no se arreglan repitiendo (un 400 por un esquema mal formado se
 * repetiría igual de mal cuatro veces). Lo único que falta de fábrica es subir
 * el tope —viene en 2— y ponerle un plazo máximo razonable.
 *
 * Lo que el SDK **no** cubre y sí resuelve el que llama:
 *
 * - **Un 429 que sobrevive a los reintentos.** Ahí ya no es un bache sino que
 *   la cuota está agotada; seguir insistiendo desde el mismo proceso solo
 *   alarga la cola. El worker de clasificación lo traduce a una pausa de la
 *   cola entera (ver `ai.processor.ts`), que es el único sitio donde tiene
 *   sentido frenar: el copiloto responde a una persona que está mirando y
 *   prefiere un error a los tres minutos de espera.
 * - **Un fallo a mitad de stream.** Los reintentos son de la petición, no de
 *   los bytes ya entregados: si la conexión se corta con media respuesta
 *   escrita, el SDK no puede rebobinar y el turno se pierde.
 */

/**
 * Cuántas veces se repite una petición que falló de forma transitoria.
 *
 * Cuatro y no dos porque el pico que hay que sobrevivir aquí no es de
 * milisegundos: cuando entra una tanda de correos, el 429 dura lo que tarde en
 * vaciarse el cubo de tokens del minuto. Con espera exponencial, cuatro
 * intentos cubren cerca de un minuto de saturación sin que nadie se entere.
 */
export const REINTENTOS_POR_DEFECTO = 4;

/** Plazo máximo de una petición **no** en streaming. */
export const TIMEOUT_POR_DEFECTO_MS = 120_000;

/** Suelo y techo de la espera que se le pide a la cola cuando hay 429. */
const ESPERA_MINIMA_MS = 1_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

export interface OpcionesDeCliente {
  /** Quién lo construye. Solo para el log de arranque. */
  contexto: string;
  /**
   * Plazo máximo por petición. El copiloto pide uno mucho mayor: sus turnos van
   * en streaming y pueden encadenar varias llamadas con herramientas.
   */
  timeoutPorDefectoMs?: number;
}

/**
 * Construye el cliente con los reintentos y el plazo ya puestos.
 *
 * Ambos se pueden pisar por entorno (`ANTHROPIC_MAX_RETRIES`,
 * `ANTHROPIC_TIMEOUT_MS`) sin tocar código, porque el número correcto depende
 * de la cuota de la organización y eso cambia sin avisar. Un valor que no sea
 * un número se ignora en silencio y se queda el de por defecto: una variable
 * mal escrita no debe dejar la API sin reintentos.
 */
export function crearClienteAnthropic(
  apiKey: string,
  config: ConfigService,
  opciones: OpcionesDeCliente,
): Anthropic {
  const maxRetries = entero(config.get('ANTHROPIC_MAX_RETRIES'), REINTENTOS_POR_DEFECTO, 0, 10);
  const timeout = entero(
    config.get('ANTHROPIC_TIMEOUT_MS'),
    opciones.timeoutPorDefectoMs ?? TIMEOUT_POR_DEFECTO_MS,
    5_000,
    15 * 60_000,
  );

  new Logger('Anthropic').log(
    `${opciones.contexto}: ${maxRetries} reintentos, ${Math.round(timeout / 1000)} s de plazo por petición`,
  );

  return new Anthropic({ apiKey, maxRetries, timeout });
}

/**
 * El código HTTP del fallo, o `null` si no vino de una respuesta.
 *
 * Se mira la propiedad y no `instanceof APIError` a propósito: en las pruebas
 * el módulo del SDK está sustituido por un doble y las clases de error no
 * existen, así que un `instanceof` reventaría al comprobar el error en vez de
 * al provocarlo. La forma (`status` numérico) sí sobrevive al doble.
 */
export function estadoHttp(error: unknown): number | null {
  const estado = (error as { status?: unknown } | null)?.status;
  return typeof estado === 'number' ? estado : null;
}

/** 429: se agotó la cuota por minuto. */
export function esLimiteDeTasa(error: unknown): boolean {
  return estadoHttp(error) === 429;
}

/** 529: la API está saturada. Se trata igual que un 429, con espera. */
export function esSobrecarga(error: unknown): boolean {
  return estadoHttp(error) === 529;
}

/**
 * ¿Merece la pena esperar y volver, o es un fallo nuestro que se repetiría
 * igual? Lo segundo incluye el 400 del esquema y el 401 de la credencial.
 */
/**
 * ¿El fallo es **por saldo agotado**?
 *
 * ⚠️ **No es un 429, y esa es la parte que hay que saber.** Un 429 es
 * `rate_limit_error`: se ha ido demasiado deprisa y esperar arregla. El saldo
 * agotado llega como **`billing_error` con estado 403**, y **no es
 * reintentable**: esperar no rellena la cuenta.
 *
 * Las dos cosas se distinguen por el campo `type` del error, no por el estado:
 * 403 lo comparten `billing_error` y `permission_error`, que piden cosas muy
 * distintas — una es «paga» y la otra «la clave no tiene permiso».
 *
 * **Por qué importa distinguirlo.** Sin esto, el día que se acabe el crédito
 * cada correo agota sus tres intentos y cae en la cola de fallidos. La DLQ
 * avisaría del síntoma —«un job falló»— y **nadie diría la causa**: alguien
 * estaría a las tres de la mañana leyendo trazas de clasificación con la
 * ingesta parada, cuando la respuesta era una línea de la consola de facturación.
 */
export function esSaldoAgotado(error: unknown): boolean {
  const tipo = (error as { type?: unknown } | null)?.type;
  if (tipo === 'billing_error') return true;

  // Respaldo por si el `type` no viaja: algunos envoltorios solo dejan el
  // mensaje. Se mira el texto **ademas** del tipo, nunca en su lugar.
  const mensaje = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  return estadoHttp(error) === 403 && /credit|balance|billing/.test(mensaje);
}

export function convieneEsperar(error: unknown): boolean {
  const estado = estadoHttp(error);
  return estado === 429 || estado === 529 || (estado !== null && estado >= 500);
}

/**
 * Cuánto pide esperar la propia API, en milisegundos, o `null` si no lo dice.
 *
 * Se prefiere siempre lo que manda el servidor a un número inventado por
 * nosotros. El orden no es caprichoso:
 *
 * 1. `retry-after-ms` y `retry-after` son la respuesta directa a "cuándo
 *    vuelvo"; la segunda puede venir en segundos o como fecha HTTP.
 * 2. Si no hay ninguna, se miran los `anthropic-ratelimit-*-reset`, que dicen
 *    cuándo se rellena cada cubo. Se coge **el más lejano**: quedarse con el
 *    más cercano garantiza volver a chocar con el otro.
 *
 * El resultado se acota entre un segundo y cinco minutos. Sin techo, una
 * cabecera con una fecha rara (o un reloj desajustado) dormiría la cola horas.
 */
export function esperaSugeridaMs(error: unknown, ahora: number = Date.now()): number | null {
  const cabeceras = (error as { headers?: { get?: unknown } } | null)?.headers;
  if (!cabeceras || typeof cabeceras.get !== 'function') return null;

  const leer = (nombre: string): string | null => {
    try {
      return (cabeceras.get as (n: string) => string | null)(nombre) ?? null;
    } catch {
      return null;
    }
  };

  const enMs = Number(leer('retry-after-ms'));
  if (Number.isFinite(enMs) && enMs > 0) return acotar(enMs);

  const retryAfter = leer('retry-after');
  if (retryAfter) {
    const segundos = Number(retryAfter);
    if (Number.isFinite(segundos) && segundos > 0) return acotar(segundos * 1000);

    // La otra forma que admite la cabecera: una fecha HTTP.
    const fecha = Date.parse(retryAfter);
    if (!Number.isNaN(fecha) && fecha > ahora) return acotar(fecha - ahora);
  }

  const resets = [
    'anthropic-ratelimit-requests-reset',
    'anthropic-ratelimit-tokens-reset',
    'anthropic-ratelimit-input-tokens-reset',
    'anthropic-ratelimit-output-tokens-reset',
  ]
    .map((nombre) => leer(nombre))
    .map((valor) => (valor ? Date.parse(valor) : NaN))
    .filter((fecha) => !Number.isNaN(fecha) && fecha > ahora);

  return resets.length ? acotar(Math.max(...resets) - ahora) : null;
}

/** Una línea que sirva en un log: código, tipo y id de petición si los hay. */
export function describirFallo(error: unknown): string {
  const estado = estadoHttp(error);
  const tipo = (error as { type?: unknown } | null)?.type;
  const requestId = (error as { requestID?: unknown } | null)?.requestID;
  const mensaje = error instanceof Error ? error.message : String(error);

  return [
    estado !== null ? `HTTP ${estado}` : null,
    typeof tipo === 'string' ? tipo : null,
    typeof requestId === 'string' ? `req ${requestId}` : null,
    mensaje,
  ]
    .filter(Boolean)
    .join(' · ');
}

function acotar(ms: number): number {
  return Math.min(ESPERA_MAXIMA_MS, Math.max(ESPERA_MINIMA_MS, Math.round(ms)));
}

function entero(valor: unknown, porDefecto: number, minimo: number, maximo: number): number {
  const numero = Number(typeof valor === 'string' ? valor.trim() : valor);
  if (!Number.isFinite(numero)) return porDefecto;

  return Math.min(maximo, Math.max(minimo, Math.trunc(numero)));
}
