import { Task } from '@prisma/client';
import { TASK_EVENTS, TasksGateway } from './tasks.gateway';
import { SessionService } from '../auth/session.service';

const tarea = { id: 't1', userId: 'u1', status: 'TODO', title: 'x' } as unknown as Task;

/** Socket simulado con lo que usa el gateway del handshake. */
const socketCon = (cookie?: string) => ({
  id: 'socket-1',
  handshake: { headers: cookie === undefined ? {} : { cookie } },
  join: jest.fn(),
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

  beforeEach(() => {
    session = { verifyAccess: jest.fn().mockResolvedValue({ sub: 'u1', email: 'a@b.c', typ: 'access' }) };
    gateway = new TasksGateway(session as unknown as SessionService);
    gateway.server = { emit: jest.fn(), to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as any;
  });

  it('mete al cliente en la sala de su usuario, que es `sub` del JWT', async () => {
    const client = socketCon('pmo_session=un-token');

    await gateway.handleConnection(client as any);

    expect(session.verifyAccess).toHaveBeenCalledWith('un-token');
    expect(client.join).toHaveBeenCalledWith('u1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rechaza un socket sin cookies', async () => {
    const client = socketCon();

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rechaza un socket con cookies pero sin la de sesión', async () => {
    const client = socketCon('otra=cosa');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(session.verifyAccess).not.toHaveBeenCalled();
  });

  it('rechaza un token inválido o caducado', async () => {
    session.verifyAccess.mockRejectedValue(new Error('jwt expired'));
    const client = socketCon('pmo_session=caducado');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
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
