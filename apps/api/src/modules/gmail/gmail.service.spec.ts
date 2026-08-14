import type { ConfigService } from '@nestjs/config';
import { GmailService } from './gmail.service';

/**
 * `watchInbox` — el orden `stop` → `watch`, que es la ingesta entera.
 *
 * **Por qué existen estas pruebas.** Gmail admite un solo cliente de
 * notificaciones push por desarrollador y rechaza el segundo con
 * `400 INVALID_ARGUMENT · "Only one user push notification client allowed per
 * developer (call /stop then try again)"`. Sin el `stop` previo, el primer
 * `watch` funciona —no hay ninguno que estorbe— y **todas las renovaciones
 * posteriores fallan**. Eso es exactamente lo que pasó: el watch del 08-13
 * entró bien y la ingesta iba camino de apagarse sola el 08-20, siete días
 * después, sin un solo error visible.
 *
 * Es un fallo que solo aparece a partir de la segunda ejecución, así que una
 * prueba que llame una vez y compruebe «funcionó» no lo habría visto nunca.
 * Lo que se prueba aquí es el **orden**.
 */
describe('GmailService · watchInbox', () => {
  const USUARIO = 'user-1';
  const TEMA = 'projects/pmo/topics/gmail-ingest';

  function crear(opciones: { stop?: jest.Mock; watch?: jest.Mock; tema?: string | undefined } = {}) {
    const stop = opciones.stop ?? jest.fn().mockResolvedValue({});
    const watch = opciones.watch ?? jest.fn().mockResolvedValue({ data: { historyId: '123' } });

    const config = {
      get: jest.fn().mockReturnValue('tema' in opciones ? opciones.tema : TEMA),
    } as unknown as ConfigService;

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ gmailHistoryId: 'ya-tenia' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const service = new GmailService(
      {} as never, // AuthService: no se usa, getGmailClient está simulado
      config,
      prisma as never,
      {} as never, // cola de clasificación: no interviene aquí
    );

    // Se simula el cliente de Gmail en vez del módulo `googleapis` entero: lo
    // que hay que probar es la lógica de esta clase, no que Google sepa hablar.
    (service as unknown as { getGmailClient: unknown }).getGmailClient = jest
      .fn()
      .mockResolvedValue({ users: { stop, watch } });

    return { service, stop, watch, prisma };
  }

  it('para el watch anterior ANTES de poner el nuevo', async () => {
    const { service, stop, watch } = crear();

    await service.watchInbox(USUARIO);

    expect(stop).toHaveBeenCalledWith({ userId: 'me' });
    expect(watch).toHaveBeenCalled();
    // El orden es el arreglo entero: invertirlo devuelve el 400 de Gmail.
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(watch.mock.invocationCallOrder[0]);
  });

  it('renovar dos veces seguidas sigue funcionando: el fallo original solo salía a la segunda', async () => {
    const { service, stop, watch } = crear();

    const primera = await service.watchInbox(USUARIO);
    const segunda = await service.watchInbox(USUARIO);

    expect(primera.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('si el stop falla, se intenta el watch igualmente: sobre un buzón sin watch stop no es obligatorio', async () => {
    const stop = jest.fn().mockRejectedValue(new Error('no habia watch'));
    const { service, watch } = crear({ stop });

    const resultado = await service.watchInbox(USUARIO);

    expect(watch).toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
  });

  it('un rechazo de Gmail devuelve ok=false con el motivo legible', async () => {
    const mensaje =
      'Only one user push notification client allowed per developer (call /stop then try again)';
    const watch = jest.fn().mockRejectedValue(
      Object.assign(new Error(mensaje), {
        code: 400,
        response: { status: 400, data: { error: { status: 'INVALID_ARGUMENT', message: mensaje } } },
      }),
    );
    const { service } = crear({ watch });

    const resultado = await service.watchInbox(USUARIO);

    expect(resultado.ok).toBe(false);
    // El motivo tiene que viajar hacia arriba: sin él, el cron vuelve a
    // registrar un «0 de 1» sin causa, que es lo que dejó pasar dos días.
    expect(resultado.motivo).toContain('call /stop then try again');
    expect(resultado.motivo).toContain('INVALID_ARGUMENT');
  });

  it('un tropiezo de la base DESPUÉS del watch no lo invalida: el watch ya está puesto en Gmail', async () => {
    const { service, watch, prisma } = crear();
    prisma.user.findUnique.mockRejectedValue(new Error('Postgres se cayó'));

    const resultado = await service.watchInbox(USUARIO);

    expect(watch).toHaveBeenCalled();
    // Antes esto se contaba como watch fallido y el cron reportaba «0 de 1»
    // con la ingesta perfectamente viva.
    expect(resultado.ok).toBe(true);
  });

  it('sin GMAIL_PUBSUB_TOPIC no llama a Gmail y dice por qué', async () => {
    const { service, stop, watch } = crear({ tema: undefined });

    const resultado = await service.watchInbox(USUARIO);

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain('GMAIL_PUBSUB_TOPIC');
    expect(stop).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
  });
});
