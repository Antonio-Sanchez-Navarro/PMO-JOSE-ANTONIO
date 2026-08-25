import { Task } from '@prisma/client';
import { TASK_EVENTS, TasksGateway } from './tasks.gateway';
import { CODIGO_SESION, SesionRechazadaError, SessionService } from '../auth/session.service';

const tarea = { id: 't1', userId: 'u1', status: 'TODO', title: 'x' } as unknown as Task;

/** Socket simulado con lo que usa el gateway del handshake. */
const socketCon = (cookie?: string) => ({
  id: 'socket-1',
  handshake: { headers: cookie === undefined ? {} : { cookie } },
  data: {} as Record<string, unknown>,
  join: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
});

describe('TasksGateway', () => {
  let gateway: TasksGateway;
  let emit: jest.Mock;
  let to: jest.Mock;
  let session: { verifyAccess: jest.Mock };

  beforeEach(() => {
    session = { verifyAccess: jest.fn().mockResolvedValue({ sub: 'u1', email: 'a@b.c', typ: 'access' }) };
    gateway = new TasksGateway(session as unknown as SessionService);
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    gateway.server = { emit, to } as any;
  });

  it('emite cada cambio con su nombre de evento', () => {
    gateway.emitTaskCreated(tarea);
    gateway.emitTaskUpdated(tarea);
    gateway.emitTaskDeleted(tarea);

    expect(emit).toHaveBeenNthCalledWith(1, TASK_EVENTS.created, tarea);
    expect(emit).toHaveBeenNthCalledWith(2, TASK_EVENTS.updated, tarea);
    expect(emit).toHaveBeenNthCalledWith(3, TASK_EVENTS.deleted, expect.objectContaining({ id: 't1' }));
  });

  it('el borrado manda id, columna y dueño, no la fila entera', () => {
    gateway.emitTaskDeleted(tarea);

    expect(emit).toHaveBeenCalledWith(TASK_EVENTS.deleted, {
      id: 't1',
      status: 'TODO',
      userId: 'u1',
    });
  });

  it('los payloads llevan userId, del que depende el filtro del cliente', () => {
    gateway.emitTaskUpdated(tarea);

    expect(emit.mock.calls[0][1].userId).toBe('u1');
  });

  describe('task.reordered', () => {
    const columnas = [{ status: 'TODO' as any, taskIds: ['b', 'a', 'c'] }];

    it('manda el orden de las columnas tocadas', () => {
      gateway.emitTasksReordered('u1', columnas);

      expect(emit).toHaveBeenCalledWith(TASK_EVENTS.reordered, {
        userId: 'u1',
        columns: columnas,
      });
    });

    it('lleva userId aunque aquí no haya fila de la que sacarlo', () => {
      gateway.emitTasksReordered('u1', columnas);

      expect(emit.mock.calls[0][1].userId).toBe('u1');
    });
  });

  describe('resiliencia', () => {
    // La tarea ya está escrita cuando se emite: un fallo del socket no puede
    // convertir una petición correcta en un 500.
    it('se traga un fallo del socket en vez de propagarlo', () => {
      emit.mockImplementation(() => {
        throw new Error('socket caído');
      });

      expect(() => gateway.emitTaskUpdated(tarea)).not.toThrow();
    });

    it('no estalla si el adaptador aún no ha arrancado', () => {
      gateway.server = undefined as any;

      expect(() => gateway.emitTaskUpdated(tarea)).not.toThrow();
    });
  });
});

describe('TasksGateway — handshake y salas', () => {
  let gateway: TasksGateway;
  let session: { verifyAccess: jest.Mock };

  /** Ejecuta el middleware que `afterInit` registra y devuelve lo que le pasó a `next`. */
  async function pasarPorElMiddleware(client: unknown): Promise<unknown> {
    let middleware!: (socket: unknown, next: (err?: unknown) => void) => void;
    gateway.afterInit({ use: (fn: never) => (middleware = fn) } as never);

    return new Promise((resolve) => {
      middleware(client, (err?: unknown) => resolve(err));
    });
  }

  beforeEach(() => {
    session = {
      verifyAccess: jest.fn().mockResolvedValue({ sub: 'u1', email: 'a@b.c', typ: 'access' }),
    };
    gateway = new TasksGateway(session as unknown as SessionService);
    gateway.server = { emit: jest.fn(), to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as any;
  });

  it('deja pasar una cookie válida y guarda el usuario para la sala', async () => {
    const client = socketCon('pmo_session=un-token');

    const err = await pasarPorElMiddleware(client);

    expect(err).toBeUndefined();
    expect(session.verifyAccess).toHaveBeenCalledWith('un-token');
    expect(client.data.userId).toBe('u1');
  });

  it('mete al cliente en la sala de su usuario, que es `sub` del JWT', () => {
    const client = socketCon('pmo_session=un-token');
    client.data.userId = 'u1';

    gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith('u1');
  });

  it('sin cookies: rechaza en el middleware con SESION_INVALIDA', async () => {
    const err = (await pasarPorElMiddleware(socketCon())) as { data?: { codigo?: string } };

    expect(err).toBeDefined();
    expect(err.data?.codigo).toBe('SESION_INVALIDA');
  });

  it('con cookies pero sin la de sesión: SESION_INVALIDA, y ni se mira el token', async () => {
    const err = (await pasarPorElMiddleware(socketCon('otra=cosa'))) as {
      data?: { codigo?: string };
    };

    expect(err.data?.codigo).toBe('SESION_INVALIDA');
    expect(session.verifyAccess).not.toHaveBeenCalled();
  });

  it('token caducado: SESION_CADUCADA, que es la que NO manda al usuario al login', async () => {
    session.verifyAccess.mockRejectedValue(
      new SesionRechazadaError(CODIGO_SESION.caducada, 'Sesión inválida o expirada'),
    );

    const err = (await pasarPorElMiddleware(socketCon('pmo_session=caducado'))) as {
      data?: { codigo?: string };
    };

    expect(err.data?.codigo).toBe('SESION_CADUCADA');
  });

  it('un fallo inesperado NO se disfraza de sesión inválida', async () => {
    // Si un tropiezo interno mandara `SESION_INVALIDA`, el cliente sacaría al
    // usuario al login por algo que no tiene nada que ver con su sesión.
    session.verifyAccess.mockRejectedValue(new Error('la base se cayó'));

    const err = (await pasarPorElMiddleware(socketCon('pmo_session=x'))) as {
      data?: { codigo?: string };
    };

    expect(err.data?.codigo).toBe('ERROR_INTERNO');
  });
});

describe('TasksGateway — supresión del eco', () => {
  let gateway: TasksGateway;
  let emitSala: jest.Mock;
  let emitExcepto: jest.Mock;
  let except: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    const session = { verifyAccess: jest.fn() };
    gateway = new TasksGateway(session as unknown as SessionService);
    emitSala = jest.fn();
    emitExcepto = jest.fn();
    except = jest.fn().mockReturnValue({ emit: emitExcepto });
    to = jest.fn().mockReturnValue({ emit: emitSala, except });
    gateway.server = { emit: jest.fn(), to } as any;
  });

  it('excluye al socket que provocó el cambio', () => {
    gateway.emitTaskUpdated(tarea, 'socket-abc');

    expect(to).toHaveBeenCalledWith('u1');
    expect(except).toHaveBeenCalledWith('socket-abc');
    expect(emitExcepto).toHaveBeenCalledWith(TASK_EVENTS.updated, tarea);
    // La emisión sin exclusión no debe dispararse también.
    expect(emitSala).not.toHaveBeenCalled();
  });

  it('excluye también en el reordenamiento, que es donde se nota el rebote', () => {
    gateway.emitTasksReordered('u1', [{ status: 'TODO' as any, taskIds: ['a'] }], 'socket-abc');

    expect(except).toHaveBeenCalledWith('socket-abc');
    expect(emitExcepto).toHaveBeenCalledWith(TASK_EVENTS.reordered, {
      userId: 'u1',
      columns: [{ status: 'TODO', taskIds: ['a'] }],
    });
  });

  it('emite a toda la sala si no hay socket que excluir', () => {
    gateway.emitTaskUpdated(tarea);

    expect(except).not.toHaveBeenCalled();
    expect(emitSala).toHaveBeenCalledWith(TASK_EVENTS.updated, tarea);
  });

  it('trata una cabecera vacía como ausencia de socket', () => {
    gateway.emitTaskUpdated(tarea, '   ');

    expect(except).not.toHaveBeenCalled();
    expect(emitSala).toHaveBeenCalled();
  });

  it('descarta un id absurdamente largo en vez de usarlo de nombre de sala', () => {
    gateway.emitTaskUpdated(tarea, 'x'.repeat(200));

    expect(except).not.toHaveBeenCalled();
    expect(emitSala).toHaveBeenCalled();
  });

  it('el borrado también respeta la exclusión', () => {
    gateway.emitTaskDeleted(tarea, 'socket-abc');

    expect(except).toHaveBeenCalledWith('socket-abc');
    expect(emitExcepto).toHaveBeenCalledWith(TASK_EVENTS.deleted, {
      id: 't1',
      status: 'TODO',
      userId: 'u1',
    });
  });
});

describe('§43.5 · un payload sin dueño no se difunde a todos', () => {
  let gateway: TasksGateway;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    gateway = new TasksGateway({ verifyAccess: jest.fn() } as unknown as SessionService);
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    gateway.server = { emit, to } as never;
  });

  const sinDuenno = { id: 't1', status: 'TODO', title: 'x' } as unknown as Task;

  it('no llama a server.emit, que iba a TODOS los clientes', () => {
    // El comportamiento anterior era `this.server.emit(...)`: el evento de un
    // usuario aterrizaba en la pantalla de cualquiera. Se defendía como «lo
    // visible en vez de lo silencioso», y el objetivo era bueno; el medio pagaba
    // esa visibilidad con los datos de alguien.
    gateway.emitTaskUpdated(sinDuenno);

    expect(emit).not.toHaveBeenCalled();
  });

  it('tampoco lo manda a una sala inventada', () => {
    // La otra forma de equivocarse: encaminar a la sala `undefined`, que es un
    // nombre válido para socket.io y no falla, solo no llega. Ni eso.
    gateway.emitTaskUpdated(sinDuenno);

    expect(to).not.toHaveBeenCalled();
  });

  it('deja rastro con nivel error, para que no sea un fallo mudo', () => {
    // Es la mitad que hay que conservar del razonamiento viejo: no difundir no
    // puede significar callarse. `error` y no `warn` porque Error Reporting lee
    // las excepciones de Cloud Logging y un `warn` se pierde entre el ruido.
    const registro = jest
      .spyOn(gateway['logger'], 'error')
      .mockImplementation(() => undefined);

    gateway.emitTaskUpdated(sinDuenno);

    expect(registro).toHaveBeenCalledTimes(1);
    expect(registro.mock.calls[0][0]).toContain('sin userId');
  });

  it('con dueño sigue emitiendo a su sala, que es el caso de siempre', () => {
    // La guarda no puede cobrarse el camino bueno.
    gateway.emitTaskUpdated(tarea);

    expect(to).toHaveBeenCalledWith('u1');
    expect(emit).toHaveBeenCalledWith(TASK_EVENTS.updated, tarea);
  });
});
