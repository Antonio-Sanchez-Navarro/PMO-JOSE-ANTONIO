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

    const alertas = { avisar: jest.fn().mockResolvedValue(undefined) };

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
      alertas as never,
    );

    // Se simula el cliente de Gmail en vez del módulo `googleapis` entero: lo
    // que hay que probar es la lógica de esta clase, no que Google sepa hablar.
    (service as unknown as { getGmailClient: unknown }).getGmailClient = jest
      .fn()
      .mockResolvedValue({ users: { stop, watch } });

    return { service, stop, watch, prisma, alertas };
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

/**
 * `syncHistory` / `persistEmails` — el marcador de historial y los dos fallos
 * que compartían `catch`.
 *
 * **Por qué existen estas pruebas.** Las 614 que ya había estaban todas en
 * verde mientras la ingesta perdía correos, porque ninguna miraba lo que pasa
 * cuando *guardar* o *encolar* fallan. Los tres agujeros eran:
 *
 * 1. El marcador se guardaba **pasara lo que pasara**. `persistEmails` se traga
 *    los fallos correo a correo, así que un `upsert` roto significaba que ese
 *    correo no se volvía a ver nunca: la siguiente sincronización arrancaba del
 *    marcador nuevo y `users.history.list` ya no lo mencionaba.
 * 2. El `upsert` y el `add` a la cola compartían `try`. Si Redis rechazaba, el
 *    correo ya estaba en la base, el contador **no** se incrementaba, el `catch`
 *    lo tapaba con un `warn` y el log decía un número **más bajo de lo real**
 *    sin un solo error. Guardado y sin clasificar, para siempre.
 * 3. `collectHistory` paginaba `while (pageToken)` sin tope. Quien lo rompía era
 *    Cloud Run cortando la petición, y Pub/Sub reintentaba desde el mismo
 *    marcador: un bucle que no converge.
 *
 * Cada `it` de aquí falla contra el código anterior. Esa es la condición para
 * que sirvan de algo.
 */
describe('GmailService · syncHistory y el marcador de historial', () => {
  const USUARIO = 'user-1';
  const MARCADOR_VIEJO = '1000';

  interface Opciones {
    upsert?: jest.Mock;
    add?: jest.Mock;
    paginas?: number;
    correos?: number;
  }

  function crear(opciones: Opciones = {}) {
    const correos = opciones.correos ?? 1;
    const paginas = opciones.paginas ?? 1;

    const upsert = opciones.upsert ?? jest.fn().mockImplementation(({ where }) =>
      Promise.resolve({ id: `db-${where.gmailMessageId}` }),
    );
    const add = opciones.add ?? jest.fn().mockResolvedValue({});

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ gmailHistoryId: MARCADOR_VIEJO }),
        update: jest.fn().mockResolvedValue({}),
      },
      email: { upsert },
    };

    const alertas = { avisar: jest.fn().mockResolvedValue(undefined) };

    const service = new GmailService(
      {} as never,
      { get: jest.fn() } as never,
      prisma as never,
      { add } as never,
      alertas as never,
    );

    // `users.history.list` devuelve `paginas` páginas; la última sin token.
    let llamadas = 0;
    const historyList = jest.fn().mockImplementation(() => {
      llamadas++;
      const ultima = llamadas >= paginas;
      return Promise.resolve({
        data: {
          history:
            llamadas === 1
              ? [
                  {
                    messagesAdded: Array.from({ length: correos }, (_, i) => ({
                      message: { id: `msg-${i}` },
                    })),
                  },
                ]
              : [],
          historyId: '2000',
          nextPageToken: ultima ? undefined : `pag-${llamadas}`,
        },
      });
    });

    const getProfile = jest.fn().mockResolvedValue({ data: { historyId: '9999' } });
    const messagesList = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'bf-1' }] } });

    (service as unknown as { getGmailClient: unknown }).getGmailClient = jest
      .fn()
      .mockResolvedValue({
        users: {
          history: { list: historyList },
          getProfile,
          messages: { list: messagesList },
        },
      });

    // `fetchMessages` habla con Gmail y no es lo que se prueba aquí.
    (service as unknown as { fetchMessages: unknown }).fetchMessages = jest
      .fn()
      .mockImplementation((_g: unknown, ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            threadId: 't',
            from: 'a@b.c',
            subject: 's',
            snippet: '',
            labels: [],
            date: '2026-08-21T00:00:00Z',
          })),
        ),
      );

    return { service, prisma, add, upsert, alertas, historyList, getProfile };
  }

  it('si un correo NO se puede guardar, el marcador se queda donde estaba', async () => {
    // El agujero original: el marcador avanzaba igual y ese correo desaparecía.
    const upsert = jest.fn().mockRejectedValue(new Error('la base dijo que no'));
    const { service, prisma } = crear({ upsert });

    const res = await service.syncHistory(USUARIO);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(res.historyId).toBe(MARCADOR_VIEJO);
  });

  it('si el correo se guarda pero NO se encola, el marcador tampoco avanza', async () => {
    // Este es el que más costaba ver: el dato está, el procesamiento no, y el
    // `catch` compartido lo dejaba en un `warn` con el contador sin subir.
    const add = jest.fn().mockRejectedValue(new Error('Redis dijo que no'));
    const { service, prisma } = crear({ add });

    const res = await service.syncHistory(USUARIO);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(res.historyId).toBe(MARCADOR_VIEJO);
  });

  it('un fallo al encolar NO impide que el correo quede guardado', async () => {
    // El `upsert` va primero y en su propio `try`: perder la clasificación no
    // puede llevarse por delante el dato.
    const add = jest.fn().mockRejectedValue(new Error('Redis dijo que no'));
    const { service, upsert } = crear({ add });

    await service.syncHistory(USUARIO);

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('cuando queda algo pendiente, avisa en vez de callarse', async () => {
    const add = jest.fn().mockRejectedValue(new Error('Redis dijo que no'));
    const { service, alertas } = crear({ add });

    await service.syncHistory(USUARIO);

    expect(alertas.avisar).toHaveBeenCalledTimes(1);
  });

  it('si todo va bien, el marcador avanza y no avisa a nadie', async () => {
    const { service, prisma, alertas } = crear();

    const res = await service.syncHistory(USUARIO);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(res.historyId).toBe('2000');
    expect(res.processed).toBe(1);
    expect(alertas.avisar).not.toHaveBeenCalled();
  });

  it('`processed` cuenta lo encolado, no lo intentado', async () => {
    // El log decía un número más bajo de lo real y sin error; ahora el número
    // significa exactamente una cosa.
    const add = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Redis dijo que no'));
    const { service } = crear({ add, correos: 2 });

    const res = await service.syncHistory(USUARIO);

    expect(res.processed).toBe(1);
  });

  it('un historial larguísimo se corta y cae a backfill en vez de paginar sin fin', async () => {
    // Sin tope, el bucle sólo lo rompía Cloud Run cortando la petición, y
    // Pub/Sub reintentaba desde el mismo marcador: nunca converge.
    const { service, historyList, getProfile, alertas } = crear({ paginas: 50 });

    const res = await service.syncHistory(USUARIO);

    expect(historyList.mock.calls.length).toBeLessThanOrEqual(20);
    expect(res.mode).toBe('backfill');
    expect(getProfile).toHaveBeenCalled();
    expect(alertas.avisar).toHaveBeenCalled();
  });
});

/**
 * `reconciliarSinClasificar` — la red que recoge lo que ningún worker recoge.
 *
 * **Por qué existe.** Cuando el `upsert` va bien y el `add` a la cola falla, el
 * correo queda en la base y **su trabajo nunca llegó a existir**: no está
 * atascado, no está fallido, no está. Ni `--min-instances=1` ni un ping lo ven
 * nunca, porque los dos parten de que hay algo que reintentar.
 *
 * Lo que se prueba aquí es el contrato que hace que esto sea seguro de correr
 * cada 15 minutos: la ventana de gracia (para no duplicar clasificaciones sobre
 * correos que están en la cola ahora mismo), el tope por vuelta, y el
 * `remove`+`add` con `jobId` que decide bien sin preguntar en qué estado está
 * el trabajo anterior.
 */
describe('GmailService · barrido de reconciliación', () => {
  function crear(
    opciones: { huerfanos?: string[]; add?: jest.Mock; remove?: jest.Mock; sinTexto?: number } = {},
  ) {
    const findMany = jest
      .fn()
      .mockResolvedValue((opciones.huerfanos ?? ['e1', 'e2']).map((id) => ({ id })));
    const add = opciones.add ?? jest.fn().mockResolvedValue({});
    const remove = opciones.remove ?? jest.fn().mockResolvedValue(undefined);

    // `count` cuenta los cerrados sin clasificar: es lo que convierte «cinco,
    // qué curioso» en «cincuenta, esto es una avería de la ingesta».
    const count = jest.fn().mockResolvedValue(opciones.sinTexto ?? 0);
    const prisma = { email: { findMany, count } };
    const alertas = { avisar: jest.fn().mockResolvedValue(undefined) };

    const service = new GmailService(
      {} as never,
      { get: jest.fn() } as never,
      prisma as never,
      { add, remove } as never,
      alertas as never,
    );

    return { service, findMany, add, remove, alertas, count };
  }

  it('solo mira correos sin `processedAt` y con antigüedad: no toca los recién llegados', async () => {
    // Sin la ventana de gracia reencolaría correos que están en la cola ahora
    // mismo, y dos trabajos a la vez sobre el mismo correo pueden crear las
    // tareas por duplicado.
    const { service, findMany } = crear();

    await service.reconciliarSinClasificar();

    const filtro = findMany.mock.calls[0][0].where;
    expect(filtro.processedAt).toBeNull();
    expect(filtro.receivedAt.lt).toBeInstanceOf(Date);
    expect(Date.now() - filtro.receivedAt.lt.getTime()).toBeGreaterThanOrEqual(29 * 60_000);
  });

  it('acota cuánto trabajo hace en una vuelta', async () => {
    // Corre dentro de una petición HTTP con el timeout de Cloud Run encima:
    // tiene que terminar.
    const { service, findMany } = crear();

    await service.reconciliarSinClasificar();

    expect(findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
  });

  it('borra el trabajo anterior antes de encolar, y usa el id del correo', async () => {
    // `add` con un jobId que ya existe se ignora. Eso protege del duplicado
    // cuando el trabajo está activo, pero bloquearía el reintento cuando está
    // terminado o fallido: por eso se intenta borrar antes.
    const { service, add, remove } = crear({ huerfanos: ['e1'] });

    await service.reconciliarSinClasificar();

    expect(remove).toHaveBeenCalledWith('e1');
    expect(add).toHaveBeenCalledWith('classify', { emailId: 'e1' }, { jobId: 'e1' });
  });

  it('si el trabajo anterior está activo y no se puede borrar, sigue igual', async () => {
    // `remove` falla sobre un job activo. No es un error: es la señal de que
    // está corriendo, y el `add` de después se ignora solo por el jobId.
    const remove = jest.fn().mockRejectedValue(new Error('cannot remove active job'));
    const { service, add } = crear({ huerfanos: ['e1'], remove });

    const res = await service.reconciliarSinClasificar();

    expect(add).toHaveBeenCalledTimes(1);
    expect(res.fallidos).toBe(0);
  });

  it('cuenta lo reencolado y lo fallido por separado', async () => {
    const add = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Redis dijo que no'));
    const { service } = crear({ huerfanos: ['e1', 'e2'], add });

    const res = await service.reconciliarSinClasificar();

    expect(res).toEqual({ candidatos: 2, reencolados: 1, fallidos: 1, sinTexto: 0 });
  });

  it('avisa cuando encuentra huérfanos, y calla cuando no hay nada', async () => {
    const conHuerfanos = crear({ huerfanos: ['e1'] });
    await conHuerfanos.service.reconciliarSinClasificar();
    expect(conHuerfanos.alertas.avisar).toHaveBeenCalledTimes(1);

    const limpio = crear({ huerfanos: [] });
    await limpio.service.reconciliarSinClasificar();
    expect(limpio.alertas.avisar).not.toHaveBeenCalled();
  });
});
