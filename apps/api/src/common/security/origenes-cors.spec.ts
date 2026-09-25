import cors from 'cors';
import { origenesCors } from './origenes-cors';

/**
 * El CORS con dos orígenes — preparación del dominio propio (DOC.md §6).
 *
 * **Lo que se fija aquí es que, sin `WEB_URL_EXTRA`, nada cambia**: ni el valor
 * que recibe `cors` ni la cabecera que sale. La variable nueva solo amplía.
 */
describe('origenesCors', () => {
  const WEB = 'https://pmo-dashboard-503418.web.app';
  const APP = 'https://app.pmo-app.com';

  it('sin WEB_URL_EXTRA devuelve la misma cadena que antes, no una lista de uno', () => {
    expect(origenesCors(WEB, undefined)).toBe(WEB);
    expect(origenesCors(WEB, '')).toBe(WEB);
    expect(origenesCors(WEB, '   ')).toBe(WEB);
  });

  it('sin WEB_URL cae en el frontend de desarrollo, como antes', () => {
    expect(origenesCors(undefined, undefined)).toBe('http://localhost:5173');
  });

  it('con WEB_URL_EXTRA admite los dos', () => {
    expect(origenesCors(WEB, APP)).toEqual([WEB, APP]);
  });

  it('un extra igual al principal no duplica', () => {
    expect(origenesCors(WEB, WEB)).toBe(WEB);
  });

  /** Lo que ve el navegador: la cabecera de la respuesta al preflight. */
  function permitido(origen: string, config: string | string[]): string | undefined {
    const cabeceras: Record<string, string> = {};
    const req = { method: 'OPTIONS', headers: { origin: origen, 'access-control-request-method': 'GET' } };
    const res = {
      statusCode: 0,
      setHeader: (k: string, v: string) => (cabeceras[k.toLowerCase()] = v),
      getHeader: (k: string) => cabeceras[k.toLowerCase()],
      end: () => undefined,
    };
    cors({ origin: config, credentials: true })(req as never, res as never, () => undefined);
    return cabeceras['access-control-allow-origin'];
  }

  it('con los dos, cada origen recibe su propia cabecera y uno ajeno ninguna', () => {
    const config = origenesCors(WEB, APP);
    expect(permitido(WEB, config)).toBe(WEB);
    expect(permitido(APP, config)).toBe(APP);
    expect(permitido('https://ajeno.example', config)).toBeUndefined();
  });

  it('sin el extra, el dominio nuevo NO entra', () => {
    expect(permitido(APP, origenesCors(WEB, undefined))).not.toBe(APP);
  });
});
