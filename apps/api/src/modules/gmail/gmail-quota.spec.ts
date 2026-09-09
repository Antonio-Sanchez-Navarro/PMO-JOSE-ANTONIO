import { esCuotaAgotada, esperaSugeridaGmailMs, GmailQuotaError } from './gmail-quota';

/**
 * El incendio del 2026-09-08 no fue que Gmail nos cortara: fue que **no
 * supimos distinguir** su corte de un correo que falla. Un 403 contaba como
 * «este mensaje no se pudo descargar», eso retenía el marcador de historial, y
 * el marcador retenido garantizaba volver a descargar el mismo tramo. El bucle
 * se alimentaba de su propio remedio.
 *
 * Lo que se fija aquí es esa frontera.
 */
describe('esCuotaAgotada', () => {
  /** Como los arma `googleapis`: el estado en `code`, los motivos en `errors`. */
  const errorGoogle = (code: number, reason?: string) => ({
    code,
    message: 'Quota exceeded for quota metric ...',
    ...(reason ? { errors: [{ reason }] } : {}),
  });

  it('un 429 es cuota sin discusión', () => {
    expect(esCuotaAgotada({ code: 429 })).toBe(true);
  });

  it('reconoce los cuatro motivos de cuota que manda Google en un 403', () => {
    for (const reason of [
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'quotaExceeded',
      'dailyLimitExceeded',
    ]) {
      expect(esCuotaAgotada(errorGoogle(403, reason))).toBe(true);
    }
  });

  // Ésta es la que importa de verdad. Gmail usa 403 para las dos cosas, y son
  // opuestas: la cuota se rellena sola esperando, y un permiso que falta no se
  // arregla esperando ni en una hora ni en una semana. Confundirlas dormiría la
  // ingesta indefinidamente por un OAuth mal concedido, sin decir la causa.
  it('un 403 por permisos NO es cuota, aunque comparta el estado', () => {
    expect(
      esCuotaAgotada({
        code: 403,
        message: 'Request had insufficient authentication scopes.',
        errors: [{ reason: 'insufficientPermissions' }],
      }),
    ).toBe(false);
  });

  it('lee los motivos también cuando vienen dentro de response.data', () => {
    expect(
      esCuotaAgotada({
        response: { status: 403, data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } },
      }),
    ).toBe(true);
  });

  it('el texto del mensaje es respaldo cuando el envoltorio se comió el cuerpo', () => {
    expect(esCuotaAgotada({ code: 403, message: 'Quota exceeded for quota metric' })).toBe(true);
  });

  it('no confunde con cuota lo que no lo es', () => {
    expect(esCuotaAgotada({ code: 404 })).toBe(false);
    expect(esCuotaAgotada({ code: 500 })).toBe(false);
    expect(esCuotaAgotada(new Error('se cayó la red'))).toBe(false);
    expect(esCuotaAgotada(null)).toBe(false);
  });
});

describe('esperaSugeridaGmailMs', () => {
  const conCabecera = (valor: string) => ({ response: { headers: { 'retry-after': valor } } });

  it('acepta los segundos', () => {
    expect(esperaSugeridaGmailMs(conCabecera('30'))).toBe(30_000);
  });

  it('acepta la fecha HTTP, que es la otra forma válida', () => {
    const ahora = Date.parse('2026-09-09T10:00:00Z');
    const dentroDeUnMinuto = new Date(ahora + 60_000).toUTCString();

    expect(esperaSugeridaGmailMs(conCabecera(dentroDeUnMinuto), ahora)).toBe(60_000);
  });

  it('sin cabecera dice `null` en vez de inventarse un número', () => {
    expect(esperaSugeridaGmailMs({ code: 429 })).toBeNull();
  });

  it('una fecha ya pasada no es una espera negativa: es que no hay dato', () => {
    const ahora = Date.parse('2026-09-09T10:00:00Z');
    const haceUnMinuto = new Date(ahora - 60_000).toUTCString();

    // Sin esto saldría un número negativo que, pasado a `rateLimit`, sería una
    // pausa de cero: volver a chocar de inmediato.
    expect(esperaSugeridaGmailMs(conCabecera(haceUnMinuto), ahora)).toBeNull();
  });
});

describe('GmailQuotaError', () => {
  it('conserva el error original y el plazo que pedía Google', () => {
    const original = { code: 429, response: { headers: { 'retry-after': '45' } } };

    const error = new GmailQuotaError(original, 'descargando el mensaje abc');

    expect(error).toBeInstanceOf(Error);
    expect(error.esperaMs).toBe(45_000);
    expect(error.causaOriginal).toBe(original);
    expect(error.message).toContain('descargando el mensaje abc');
  });
});
