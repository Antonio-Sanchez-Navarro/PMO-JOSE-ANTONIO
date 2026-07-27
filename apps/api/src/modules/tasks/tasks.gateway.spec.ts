import { Task } from '@prisma/client';
import { TASK_EVENTS, TasksGateway } from './tasks.gateway';

const tarea = { id: 't1', userId: 'u1', status: 'TODO', title: 'x' } as unknown as Task;

describe('TasksGateway', () => {
  let gateway: TasksGateway;
  let emit: jest.Mock;

  beforeEach(() => {
    gateway = new TasksGateway();
    emit = jest.fn();
    gateway.server = { emit } as any;
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
