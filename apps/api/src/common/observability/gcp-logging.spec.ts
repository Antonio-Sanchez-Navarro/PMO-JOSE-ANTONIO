import {
  GCP_SPAN_KEY,
  GCP_TRACE_KEY,
  GCP_TRACE_SAMPLED_KEY,
  REDACTED,
  sanitizeUrl,
  severityFor,
  traceFieldsFrom,
} from './gcp-logging';

describe('Formato de Cloud Logging', () => {
  describe('severityFor', () => {
    // Sin `severity` con estos nombres exactos, Cloud Logging mete **todo**
    // como DEFAULT: no se puede filtrar por gravedad ni salta Error Reporting.
    it.each([
      ['trace', 'DEBUG'],
      ['debug', 'DEBUG'],
      ['info', 'INFO'],
      ['warn', 'WARNING'],
      ['error', 'ERROR'],
      ['fatal', 'CRITICAL'],
    ])('%s → %s', (nivel, severidad) => {
      expect(severityFor(nivel)).toBe(severidad);
    });

    it('un nivel desconocido no rompe: cae en DEFAULT', () => {
      expect(severityFor('inventado')).toBe('DEFAULT');
    });
  });

  describe('sanitizeUrl', () => {
    /**
     * Esta es la prueba que justifica el archivo entero.
     *
     * `pino-http` registra `req.url` tal cual, y el callback de Google trae el
     * código de autorización en la propia URL. Sin tapar, cada inicio de sesión
     * dejaría en Cloud Logging el código con el que se canjean los tokens de
     * Gmail de la persona.
     */
    it('tapa el `code` del callback de Google', () => {
      const url = sanitizeUrl('/auth/google/callback?code=4/0AeanS0abc&scope=gmail');

      expect(url).not.toContain('4/0AeanS0abc');
      expect(url).toContain(`code=${encodeURIComponent(REDACTED)}`);
    });

    it('tapa también el `state`, y los nombres en mayúsculas', () => {
      const url = sanitizeUrl('/auth/google/callback?STATE=secreto-anti-csrf');

      expect(url).not.toContain('secreto-anti-csrf');
    });

    it.each(['token', 'access_token', 'refresh_token', 'id_token', 'api_key', 'password'])(
      'tapa %s',
      (nombre) => {
        expect(sanitizeUrl(`/x?${nombre}=valor-sensible`)).not.toContain(
          'valor-sensible',
        );
      },
    );

    it('deja intacto lo que no es secreto', () => {
      // Tapar la cadena de consulta entera sería más simple y dejaría los logs
      // sin lo único que sirve para entender un fallo de husos o de rango.
      const url = sanitizeUrl('/time/report?groupBy=day&tz=America/Mexico_City');

      expect(url).toContain('groupBy=day');
      expect(url).toContain('America');
    });

    it('una URL sin parámetros vuelve tal cual', () => {
      expect(sanitizeUrl('/health/ready')).toBe('/health/ready');
    });
  });

  describe('traceFieldsFrom', () => {
    const PROYECTO = 'pmo-demo';

    it('lee el `traceparent` de W3C', () => {
      const campos = traceFieldsFrom(
        { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' },
        PROYECTO,
      );

      expect(campos[GCP_TRACE_KEY]).toBe(
        `projects/${PROYECTO}/traces/0af7651916cd43dd8448eb211c80319c`,
      );
      expect(campos[GCP_SPAN_KEY]).toBe('b7ad6b7169203331');
      expect(campos[GCP_TRACE_SAMPLED_KEY]).toBe(true);
    });

    it('lee la cabecera propia de Google cuando no hay `traceparent`', () => {
      const campos = traceFieldsFrom(
        { 'x-cloud-trace-context': 'abc123/456;o=1' },
        PROYECTO,
      );

      expect(campos[GCP_TRACE_KEY]).toBe(`projects/${PROYECTO}/traces/abc123`);
      expect(campos[GCP_SPAN_KEY]).toBe('00000000000001c8');
      expect(campos[GCP_TRACE_SAMPLED_KEY]).toBe(true);
    });

    it('prefiere `traceparent` si vienen las dos', () => {
      // Cloud Run manda ambas; escribir dos rastros distintos partiría en dos
      // la misma petición en la consola.
      const campos = traceFieldsFrom(
        {
          traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
          'x-cloud-trace-context': 'abc123/456;o=1',
        },
        PROYECTO,
      );

      expect(campos[GCP_TRACE_KEY]).toContain('11111111111111111111111111111111');
    });

    it('sin proyecto no escribe rastro', () => {
      // El campo tiene que ir con la forma `projects/<id>/traces/<hex>`: a
      // medias no enlaza nada, así que es mejor no escribirlo.
      expect(
        traceFieldsFrom({ traceparent: '00-abc-def-01' }, undefined),
      ).toEqual({});
    });

    it('sin cabeceras de rastro no inventa nada', () => {
      expect(traceFieldsFrom({}, PROYECTO)).toEqual({});
    });
  });
});
