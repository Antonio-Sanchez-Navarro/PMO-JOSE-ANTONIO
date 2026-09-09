import { Worker } from 'bullmq';
import { GmailProcessor } from './gmail.processor';
import { GmailQuotaError } from './gmail-quota';

/**
 * P0 del 2026-09-08 · por qué la pausa tiene que ser `RateLimitError` y no un
 * error normal.
 *
 * Con un error corriente el job gasta sus tres intentos y acaba en la cola de
 * fallidos. Eso, aquí, **es perder el tramo**: el aviso de Pub/Sub desaparece,
 * nadie vuelve a pedir esos correos, y el marcador se queda esperando una
 * notificación que ya no va a llegar. Los `historyId` caducan a la semana, así
 * que un job tirado hoy es un backfill —y un hueco de correos— dentro de siete
 * días. Una cuota agotada es un «vuelve luego», no un fallo del trabajo.
 */
describe('GmailProcessor · la cuota agotada pausa la ingesta, no la rompe', () => {
  function crear(errorDeSync: unknown) {
    const syncHistory = jest.fn().mockRejectedValue(errorDeSync);
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) } };

    const processor = new GmailProcessor({ syncHistory } as never, prisma as never);

    const rateLimit = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(processor, 'worker', { value: { rateLimit }, configurable: true });

    return { processor, rateLimit, syncHistory };
  }

  const job = { id: 'j1', name: 'sync-history', data: { emailAddress: 'a@b.c' } } as never;

  it('pausa la cola y devuelve el job sin gastarle un intento', async () => {
    const { processor, rateLimit } = crear(new GmailQuotaError({ code: 429 }, 'descargando'));

    await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());

    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it('respeta el plazo que pide Google por encima del nuestro', async () => {
    const original = { code: 429, response: { headers: { 'retry-after': '90' } } };
    const { processor, rateLimit } = crear(new GmailQuotaError(original, 'descargando'));

    await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());

    // Siempre antes que un número inventado por nosotros: Google sabe cuándo se
    // rellena su cubo y nosotros lo estimamos.
    expect(rateLimit).toHaveBeenCalledWith(90_000);
  });

  it('sin plazo, escala en potencias de dos entre pausas seguidas', async () => {
    const { processor, rateLimit } = crear(new GmailQuotaError({ code: 403 }, 'descargando'));

    for (let i = 0; i < 3; i++) {
      await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());
    }

    // Si al volver el cubo sigue vacío, es que el ritmo anterior no bastaba.
    expect(rateLimit.mock.calls.map((c) => c[0])).toEqual([60_000, 120_000, 240_000]);
  });

  it('la escalada tiene techo: nunca duerme la ingesta más de 15 minutos', async () => {
    const { processor, rateLimit } = crear(new GmailQuotaError({ code: 403 }, 'descargando'));

    for (let i = 0; i < 10; i++) {
      await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());
    }

    expect(Math.max(...rateLimit.mock.calls.map((c) => c[0] as number))).toBe(15 * 60_000);
  });

  it('una sincronización buena reinicia la escalada', async () => {
    const { processor, rateLimit, syncHistory } = crear(
      new GmailQuotaError({ code: 403 }, 'descargando'),
    );

    await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());
    await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());

    syncHistory.mockResolvedValueOnce({ processed: 3, mode: 'incremental' });
    await processor.process(job);

    await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());

    // Sin este reinicio, un atasco ya resuelto seguiría castigando la ingesta
    // con esperas heredadas de un problema que ya no existe.
    expect(rateLimit.mock.calls.at(-1)?.[0]).toBe(60_000);
  });

  it('reconoce la cuota aunque el error llegue crudo, sin envolver', async () => {
    // `syncHistory` envuelve, pero no es el único camino hasta aquí: si algún
    // día otra ruta deja subir el error de Google tal cual, la pausa tiene que
    // funcionar igual. Confiar solo en el envoltorio sería confiar en que nadie
    // añada nunca otra llamada.
    const { processor, rateLimit } = crear({ code: 403, errors: [{ reason: 'rateLimitExceeded' }] });

    await expect(processor.process(job)).rejects.toThrow(Worker.RateLimitError());

    expect(rateLimit).toHaveBeenCalled();
  });

  it('un fallo que NO es de cuota se relanza para que BullMQ lo reintente', async () => {
    const { processor, rateLimit } = crear(new Error('se cayó la red'));

    await expect(processor.process(job)).rejects.toThrow('se cayó la red');

    // Pausar la ingesta entera por un fallo puntual de un buzón sería castigar
    // a todos por uno.
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
