import type { ConfigService } from '@nestjs/config';
import type { AlertService } from '../../common/alerts/alert.service';
import { FrontendAlDiaService } from './frontend-al-dia.service';

/**
 * La sonda que pregunta si producción sirve el frontend que le toca.
 *
 * **Lo que se fija aquí no es el camino feliz, es el falso positivo.** Vercel
 * etiqueta el build con el commit que lo **disparó**, y en este árbol ese commit
 * suele ser de otro agente —una bitácora, un `.md`— porque tres capas escriben
 * sobre el mismo `master`. Medido el 2026-08-24: producción servía `f634efa`,
 * una bitácora, mientras el último commit del frontend era `d2ae401`, **y estaba
 * al día**.
 *
 * Una sonda con `==` habría gritado desde el primer minuto, todos los días, y en
 * dos semanas nadie la miraría. La comprobación es **ancestría**.
 */
describe('FrontendAlDiaService · pregunta si producción está al día', () => {
  const HACE_MUCHO = new Date(Date.now() - 5 * 3_600_000).toISOString();
  const SERVIDO = 'f634efacd25bfdacef0f13cb5ed83ae305238b40';
  const REFERENCIA = 'd2ae401aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  interface Respuestas {
    version?: { ok: boolean; body?: unknown };
    commits?: { sha: string; fecha: string } | null;
    compare?: { ok: boolean; status?: string };
  }

  function crear(r: Respuestas = {}) {
    const avisar = jest.fn().mockResolvedValue(undefined);

    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url);

      if (u.endsWith('/version.json')) {
        const v = r.version ?? { ok: true, body: { commit: SERVIDO } };
        return { ok: v.ok, status: v.ok ? 200 : 503, json: async () => v.body };
      }

      if (u.includes('/commits?')) {
        if (r.commits === null) return { ok: false, status: 500, json: async () => [] };
        const c = r.commits ?? { sha: REFERENCIA, fecha: HACE_MUCHO };
        return {
          ok: true,
          status: 200,
          json: async () => [{ sha: c.sha, commit: { committer: { date: c.fecha } } }],
        };
      }

      // /compare/
      const c = r.compare ?? { ok: true, status: 'ahead' };
      return { ok: c.ok, status: c.ok ? 200 : 403, json: async () => ({ status: c.status }) };
    }) as unknown as typeof fetch;

    const service = new FrontendAlDiaService(
      { get: () => 'https://pmo-frontend-ten.vercel.app' } as unknown as ConfigService,
      { avisar } as unknown as AlertService,
    );

    return { service, avisar };
  }

  it('SHA distinto pero contenido → al día, y NO avisa', async () => {
    // El falso positivo que habría hecho inútil la sonda: el commit servido no
    // es el del frontend, y aun así lo contiene.
    const { service, avisar } = crear({ compare: { ok: true, status: 'ahead' } });

    const res = await service.comprobar();

    expect(res.estado).toBe('al-dia');
    expect(avisar).not.toHaveBeenCalled();
  });

  it('SHA idéntico también es al día', async () => {
    const { service } = crear({ compare: { ok: true, status: 'identical' } });

    expect((await service.comprobar()).estado).toBe('al-dia');
  });

  it('si el commit del frontend NO está dentro del servido → atrasado y avisa', async () => {
    const { service, avisar } = crear({ compare: { ok: true, status: 'diverged' } });

    const res = await service.comprobar();

    expect(res.estado).toBe('atrasado');
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('un cambio reciente del frontend no se reclama: CI, build y CDN tienen su plazo', async () => {
    const { service, avisar } = crear({
      commits: { sha: REFERENCIA, fecha: new Date().toISOString() },
      compare: { ok: true, status: 'diverged' },
    });

    const res = await service.comprobar();

    expect(res.estado).toBe('al-dia');
    expect(avisar).not.toHaveBeenCalled();
  });

  it('si no puede leer /version.json dice que NO PUEDE COMPROBARLO, no que esté roto', async () => {
    const { service, avisar } = crear({ version: { ok: false } });

    const res = await service.comprobar();

    expect(res.estado).toBe('indeterminado');
    // Y avisa igual: una sonda muda cuando no puede mirar es una sonda apagada
    // con apariencia de encendida.
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(String(avisar.mock.calls[0][0])).toContain('No se puede comprobar');
  });

  it('si GitHub no contesta al comparar, tampoco lo da por roto', async () => {
    const { service, avisar } = crear({ compare: { ok: false } });

    const res = await service.comprobar();

    expect(res.estado).toBe('indeterminado');
    expect(String(avisar.mock.calls[0][1])).toContain('NO significa que este roto');
  });

  it('si no sabe cuál fue el último commit del frontend, no inventa', async () => {
    const { service } = crear({ commits: null });

    expect((await service.comprobar()).estado).toBe('indeterminado');
  });

  it('dos pasadas seguidas en indeterminado piden UN solo mensaje', async () => {
    // No basta con que el freno exista en el diseno: si GitHub se cae media
    // hora con un freno corto, la sonda pasa de «no puedo comprobarlo» a
    // inundar el canal con «no puedo comprobarlo» cada quince minutos. El
    // barrido otra vez, con otro disfraz.
    //
    // Aqui se fija el contrato: las dos pasadas usan **la misma clave de freno**
    // y una ventana mayor que la cadencia, que es lo que hace que `AlertService`
    // deje pasar solo la primera. Que el freno funcione de verdad se comprueba
    // en vivo; esto impide que alguien le cambie la clave o la acorte sin darse
    // cuenta.
    const { service, avisar } = crear({ compare: { ok: false } });

    await service.comprobar();
    await service.comprobar();

    const claves = avisar.mock.calls.map((c) => c[2]);
    const ventanas = avisar.mock.calls.map((c) => c[3]);

    expect(new Set(claves).size).toBe(1);
    expect(ventanas.every((v) => v >= 12 * 3_600)).toBe(true);
  });

  it('el freno de indeterminado es MAS largo que el de atrasado', async () => {
    // No saber es menos urgente que saber que esta mal, pero no es lo mismo que
    // estar bien: avisa, y con mas silencio entre avisos.
    const atrasado = crear({ compare: { ok: true, status: 'behind' } });
    await atrasado.service.comprobar();

    const indeterminado = crear({ compare: { ok: false } });
    await indeterminado.service.comprobar();

    expect(indeterminado.avisar.mock.calls[0][3]).toBeGreaterThan(
      atrasado.avisar.mock.calls[0][3] as number,
    );
  });

  it('los avisos llevan freno mas largo que la cadencia del cron', async () => {
    const { service, avisar } = crear({ compare: { ok: true, status: 'behind' } });

    await service.comprobar();

    // Cuarto argumento: la ventana de silencio. Con una igual o menor que la
    // cadencia no frenaria nada, que es la leccion del barrido.
    expect(avisar.mock.calls[0][3]).toBeGreaterThan(3_600);
  });
});
