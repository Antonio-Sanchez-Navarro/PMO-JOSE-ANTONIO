import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { buildLoggerParams } from './logger.config';
import { REDACTED } from './gcp-logging';

const opciones = (env: Record<string, string | undefined> = {}): Options =>
  buildLoggerParams(env).pinoHttp as Options;

const peticion = (url: string, headers: Record<string, string> = {}) =>
  ({ url, method: 'GET', headers, httpVersion: '1.1', socket: {} }) as unknown as IncomingMessage;

const respuesta = (statusCode: number, setHeader = jest.fn()) =>
  ({ statusCode, setHeader }) as unknown as ServerResponse;

describe('Configuración de logs', () => {
  describe('Lo que no puede salir en un log', () => {
    /**
     * La prueba que sostiene todo lo demás.
     *
     * La sesión de esta API viaja en una cookie `httpOnly` que **es** un JWT
     * válido 15 minutos, y el serializador por defecto de `pino-http` registra
     * las cabeceras de petición. Sin esta lista, cada línea de log sería una
     * credencial utilizable — y los logs los ve más gente, y durante más
     * tiempo, que la base de datos.
     */
    it('tapa la cookie de sesión, el `authorization` y el `set-cookie`', () => {
      const { paths, censor } = opciones().redact as { paths: string[]; censor: string };

      expect(paths).toContain('req.headers.cookie');
      expect(paths).toContain('req.headers.authorization');
      expect(paths).toContain('res.headers["set-cookie"]');
      expect(censor).toBe(REDACTED);
    });

    it('tapa igual en formato de Google que en el de la terminal', () => {
      // Los logs de desarrollo se pegan en chats y en incidencias igual que los
      // de producción; que sean bonitos no los hace menos peligrosos.
      for (const LOG_FORMAT of ['gcp', 'pretty']) {
        const { paths } = opciones({ LOG_FORMAT }).redact as { paths: string[] };
        expect(paths).toContain('req.headers.cookie');
      }
    });
  });

  describe('Lo que se guarda de la petición', () => {
    const serializado = (url: string) => {
      const { req } = opciones().serializers as {
        req: (r: unknown) => Record<string, unknown>;
      };
      return req({
        id: 'abc',
        method: 'GET',
        url,
        query: Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? '')),
        headers: { cookie: 'pmo_session=jwt-valido' },
        socket: { remoteAddress: '10.0.0.1' },
      });
    };

    /**
     * Esta prueba nace de un fallo comprobado contra la aplicación el
     * 2026-08-03, no de una sospecha.
     *
     * El serializador de fábrica de `pino-http` guarda la petición como
     * *binding del logger hijo*, así que `url` y `query` en crudo aparecían en
     * **todas** las líneas de esa petición y no solo en la de cierre: el código
     * de autorización de Google salió cuatro veces en el log, incluso dentro de
     * un aviso que escribe `AuthService`. El mensaje sí salía tapado, que era
     * justo lo que daba la falsa sensación de estar cubierto.
     */
    it('la URL va saneada, no solo en el mensaje', () => {
      const req = serializado('/auth/google/callback?code=CODIGO&state=ESTADO');

      expect(JSON.stringify(req)).not.toContain('CODIGO');
      expect(JSON.stringify(req)).not.toContain('ESTADO');
    });

    it('no guarda `query` ni `params`, que llevaban lo mismo sin tapar', () => {
      const req = serializado('/auth/google/callback?code=CODIGO');

      expect(req.query).toBeUndefined();
      expect(req.params).toBeUndefined();
    });

    it('no guarda las cabeceras', () => {
      // El agente y la IP ya viajan en `httpRequest`, que es donde Cloud
      // Logging los sabe leer; las cabeceras solo añadían superficie.
      const req = serializado('/tasks');

      expect(req.headers).toBeUndefined();
      expect(JSON.stringify(req)).not.toContain('jwt-valido');
    });

    it('conserva lo que sirve para seguir una petición', () => {
      const req = serializado('/tasks?status=DONE');

      expect(req).toEqual({ id: 'abc', method: 'GET', url: '/tasks?status=DONE' });
    });

    it('de la respuesta guarda el estado y nada más', () => {
      const { res } = opciones().serializers as {
        res: (r: unknown) => Record<string, unknown>;
      };

      expect(res({ statusCode: 204, headers: { 'set-cookie': 'x=y' } })).toEqual({
        statusCode: 204,
      });
    });
  });

  describe('Formato para Google', () => {
    const gcp = () => opciones({ LOG_FORMAT: 'gcp' });

    it('escribe `severity` con los nombres que Cloud Logging reconoce', () => {
      const nivel = gcp().formatters?.level;

      expect(nivel?.('error', 50)).toEqual({ severity: 'ERROR' });
      expect(nivel?.('info', 30)).toEqual({ severity: 'INFO' });
    });

    it('el texto va en `message`, no en `msg`', () => {
      expect(gcp().messageKey).toBe('message');
    });

    it('no enchufa `pino-pretty`', () => {
      // Los dos a la vez dejan la salida sin colores y sin niveles: el
      // formateador sustituye `level`, que es justo lo que `pino-pretty` busca.
      expect(gcp().transport).toBeUndefined();
    });

    it('es el formato por defecto en producción', () => {
      expect(opciones({ NODE_ENV: 'production' }).messageKey).toBe('message');
    });
  });

  describe('Formato de terminal', () => {
    it('es el de por defecto fuera de producción, y no toca `severity`', () => {
      const local = opciones({ NODE_ENV: 'development' });

      expect(local.transport).toMatchObject({ target: 'pino-pretty' });
      expect(local.formatters?.level).toBeUndefined();
    });
  });

  describe('Qué se registra solo', () => {
    const ignora = (url: string) => {
      const auto = opciones().autoLogging as { ignore: (req: IncomingMessage) => boolean };
      return auto.ignore(peticion(url));
    };

    it.each(['/health', '/health/live', '/health/ready'])(
      'no registra la sonda %s',
      (url) => {
        // La dispara el orquestador cada pocos segundos, para siempre: se paga
        // por volumen y entierra el tráfico de personas.
        expect(ignora(url)).toBe(true);
      },
    );

    it('no registra el stream del copiloto', () => {
      // Es SSE: la línea de "completada" llegaría minutos tarde, midiendo lo
      // que la persona tardó en leer.
      expect(ignora('/copilot/chat')).toBe(true);
    });

    it('sí registra el tráfico normal', () => {
      expect(ignora('/tasks')).toBe(false);
      expect(ignora('/copilot/threads')).toBe(false);
    });
  });

  describe('Nivel según el resultado', () => {
    const nivel = (status: number, error?: Error) =>
      opciones().customLogLevel?.(peticion('/x'), respuesta(status), error);

    it('un 5xx es error', () => {
      expect(nivel(500)).toBe('error');
    });

    it('un 4xx es aviso, no error', () => {
      // Un 401 de cookie caducada pasa varias veces al día por diseño. Marcarlo
      // como error abriría una incidencia de Error Reporting cada vez.
      expect(nivel(401)).toBe('warn');
      expect(nivel(404)).toBe('warn');
    });

    it('lo que va bien es info', () => {
      expect(nivel(200)).toBe('info');
    });

    it('una excepción es error aunque el estado no lo diga', () => {
      expect(nivel(200, new Error('reventó después de responder'))).toBe('error');
    });
  });

  describe('Identificador de petición', () => {
    it('reutiliza el `x-request-id` que ya viniera', () => {
      const res = respuesta(200);
      const id = opciones().genReqId?.(
        peticion('/x', { 'x-request-id': 'de-fuera' }),
        res,
      );

      expect(id).toBe('de-fuera');
    });

    it('reutiliza el rastro de Google en vez de inventar otro', () => {
      // Así la línea de la aplicación y la del balanceador se encuentran.
      const id = opciones({ GOOGLE_CLOUD_PROJECT: 'pmo-demo' }).genReqId?.(
        peticion('/x', { traceparent: '00-abcdef1234567890-1111222233334444-01' }),
        respuesta(200),
      );

      expect(id).toBe('abcdef1234567890');
    });

    it('lo devuelve en la respuesta para poder correlacionar desde fuera', () => {
      const setHeader = jest.fn();
      opciones().genReqId?.(peticion('/x'), respuesta(200, setHeader));

      expect(setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
    });

    it('sin nada de lo anterior, inventa uno', () => {
      const id = opciones().genReqId?.(peticion('/x'), respuesta(200));

      expect(typeof id).toBe('string');
      expect(String(id).length).toBeGreaterThan(0);
    });
  });

  describe('La línea de petición completada', () => {
    const completar = (url: string, extra: Record<string, unknown> = {}) =>
      opciones().customSuccessObject?.(peticion(url), respuesta(204), {
        req: { headers: { cookie: 'session=jwt' } },
        res: {},
        responseTime: 42,
        ...extra,
      }) as Record<string, unknown>;

    it('cambia el req/res crudo por el `httpRequest` de Cloud Logging', () => {
      const entrada = completar('/tasks');

      expect(entrada.req).toBeUndefined();
      expect(entrada.res).toBeUndefined();
      expect(entrada.httpRequest).toMatchObject({
        requestMethod: 'GET',
        requestUrl: '/tasks',
        status: 204,
      });
    });

    it('la latencia va en segundos con sufijo, como la espera Google', () => {
      const { latency } = completar('/tasks').httpRequest as { latency: string };

      expect(latency).toBe('0.042s');
    });

    it('conserva lo que añadió el rastro', () => {
      const entrada = completar('/tasks', { 'logging.googleapis.com/trace': 'x' });

      expect(entrada['logging.googleapis.com/trace']).toBe('x');
    });

    it('la URL del `httpRequest` también va tapada', () => {
      const { requestUrl } = completar('/auth/google/callback?code=secreto')
        .httpRequest as { requestUrl: string };

      expect(requestUrl).not.toContain('secreto');
    });
  });

  it('el `context` de Nest se renombra, porque en Google significa otra cosa', () => {
    // En un evento de Error Reporting `context` tiene que ser un objeto; la
    // cadena con el nombre de la clase haría que se descartara la incidencia.
    expect(buildLoggerParams({}).renameContext).toBe('logger');
  });
});
