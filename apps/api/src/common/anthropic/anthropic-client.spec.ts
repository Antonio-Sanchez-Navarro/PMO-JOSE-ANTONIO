import {
  convieneEsperar,
  describirFallo,
  esLimiteDeTasa,
  esperaSugeridaMs,
  estadoHttp,
} from './anthropic-client';

/**
 * Un error del SDK, imitado por su forma y no por su clase.
 *
 * El código de producción tampoco usa `instanceof`: en las pruebas del módulo
 * de IA el SDK está sustituido por un doble y sus clases de error no existen,
 * así que comprobar la clase reventaría al mirar el error en vez de al
 * provocarlo. Estas pruebas fijan ese contrato.
 */
const fallo = (status: number, cabeceras: Record<string, string> = {}) => ({
  status,
  headers: new Headers(cabeceras),
  type: 'rate_limit_error',
  requestID: 'req_123',
  message: 'Too many requests',
});

const AHORA = Date.parse('2026-08-05T12:00:00Z');

describe('Clasificación de fallos de Anthropic', () => {
  it('reconoce el 429 y el 529 como esperables', () => {
    expect(esLimiteDeTasa(fallo(429))).toBe(true);
    expect(convieneEsperar(fallo(429))).toBe(true);
    expect(convieneEsperar(fallo(529))).toBe(true);
    expect(convieneEsperar(fallo(503))).toBe(true);
  });

  it('no espera por lo que se repetiría igual de mal', () => {
    // Un esquema inválido o una credencial revocada no se arreglan insistiendo:
    // pausar la cola por ellos la dejaría dormida sin motivo.
    expect(convieneEsperar(fallo(400))).toBe(false);
    expect(convieneEsperar(fallo(401))).toBe(false);
    expect(convieneEsperar(fallo(404))).toBe(false);
  });

  it('sobrevive a lo que no es un error de la API', () => {
    // La cancelación del usuario y un fallo de red llegan sin `status`.
    expect(estadoHttp(new Error('socket hang up'))).toBeNull();
    expect(convieneEsperar(new Error('abortado'))).toBe(false);
    expect(convieneEsperar(null)).toBe(false);
    expect(esperaSugeridaMs(new Error('sin cabeceras'))).toBeNull();
  });
});

describe('Cuánto esperar cuando la API dice que no', () => {
  it('prefiere retry-after-ms, que es lo más preciso', () => {
    expect(esperaSugeridaMs(fallo(429, { 'retry-after-ms': '4500' }), AHORA)).toBe(4500);
  });

  it('acepta retry-after en segundos', () => {
    expect(esperaSugeridaMs(fallo(429, { 'retry-after': '30' }), AHORA)).toBe(30_000);
  });

  it('acepta retry-after como fecha HTTP', () => {
    const cabecera = new Date(AHORA + 45_000).toUTCString();

    expect(esperaSugeridaMs(fallo(429, { 'retry-after': cabecera }), AHORA)).toBe(45_000);
  });

  it('sin retry-after, espera al cubo que más tarda en rellenarse', () => {
    // Quedarse con el más cercano garantiza volver a chocar con el otro.
    const espera = esperaSugeridaMs(
      fallo(429, {
        'anthropic-ratelimit-requests-reset': new Date(AHORA + 10_000).toISOString(),
        'anthropic-ratelimit-tokens-reset': new Date(AHORA + 40_000).toISOString(),
      }),
      AHORA,
    );

    expect(espera).toBe(40_000);
  });

  it('ignora los cubos que ya se rellenaron', () => {
    const espera = esperaSugeridaMs(
      fallo(429, {
        'anthropic-ratelimit-requests-reset': new Date(AHORA - 5_000).toISOString(),
      }),
      AHORA,
    );

    expect(espera).toBeNull();
  });

  it('acota la espera: una cabecera rara no duerme la cola durante horas', () => {
    const lejano = fallo(429, { 'retry-after': String(60 * 60 * 24) });
    expect(esperaSugeridaMs(lejano, AHORA)).toBe(5 * 60_000);

    const insignificante = fallo(429, { 'retry-after-ms': '5' });
    expect(esperaSugeridaMs(insignificante, AHORA)).toBe(1_000);
  });

  it('devuelve null si no hay ninguna pista', () => {
    expect(esperaSugeridaMs(fallo(429), AHORA)).toBeNull();
  });
});

describe('Descripción para el log', () => {
  it('lleva código, tipo e id de petición', () => {
    const linea = describirFallo(fallo(429));

    expect(linea).toContain('HTTP 429');
    expect(linea).toContain('rate_limit_error');
    expect(linea).toContain('req_123');
  });

  it('no se rompe con un error corriente', () => {
    expect(describirFallo(new Error('vaya'))).toContain('vaya');
  });
});
