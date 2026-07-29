import { TaskPriority, TaskStatus } from '@prisma/client';
import { OverdueService } from './overdue.service';
import { TasksGateway } from '../tasks/tasks.gateway';
import { PrismaService } from '../../common/prisma/prisma.service';

const NOW = new Date('2026-07-27T12:00:00.000Z');
const HOUR_MS = 3_600_000;

/** Fecha a `h` horas de `NOW` (negativa = ya vencida). */
const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR_MS);

type TaskRow = {
  id: string;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  aiConfidence?: number | null;
};

/** Fila con los valores por defecto que devuelve la relectura del servicio. */
const row = (t: TaskRow) => ({
  title: `tarea ${t.id}`,
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  dueDate: null,
  aiConfidence: 0.9,
  ...t,
});

/**
 * Doble de Prisma: `$transaction` ejecuta el callback contra el mismo objeto,
 * que es lo que hace el cliente interactivo real desde el punto de vista del
 * servicio (`tx.task.*`).
 */
function makePrisma() {
  const prisma: any = {
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
    },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  };
  return prisma;
}

/**
 * `findMany` se llama dos veces: escaneo global (id + userId) y relectura por
 * usuario (la fila completa).
 */
function scan(prisma: any, rows: TaskRow[], userId = 'u1') {
  prisma.task.findMany.mockReset();
  prisma.task.findMany
    .mockResolvedValueOnce(rows.map((r) => ({ id: r.id, userId })))
    .mockResolvedValue(rows.map(row));
}

/** Los `data` de cada `task.update`, indexados por id. */
const writes = (prisma: any) =>
  Object.fromEntries(
    prisma.task.update.mock.calls.map(([arg]: any) => [arg.where.id, arg.data]),
  );

describe('OverdueService — barrido y reevaluación del tablero', () => {
  let service: OverdueService;
  let prisma: any;
  let events: any;

  beforeEach(() => {
    prisma = makePrisma();
    events = { emitTaskUpdated: jest.fn(), emitTaskCreated: jest.fn(), emitTaskDeleted: jest.fn() };
    service = new OverdueService(prisma as unknown as PrismaService, events as unknown as TasksGateway);
  });

  describe('horizonte del escaneo', () => {
    it('mira hasta 72 h por delante, que es donde empieza a escalar la prioridad', async () => {
      await service.sweep(NOW);

      const { where } = prisma.task.findMany.mock.calls[0][0];
      expect(where.dueDate).toEqual({ lt: inHours(72) });
    });

    it('incluye OVERDUE (su prioridad aún puede subir) y excluye DONE', async () => {
      await service.sweep(NOW);

      const statuses = prisma.task.findMany.mock.calls[0][0].where.status.in;
      expect(statuses).toContain(TaskStatus.OVERDUE);
      expect(statuses).not.toContain(TaskStatus.DONE);
    });

    it('no abre transacción si no hay nada en el horizonte', async () => {
      const result = await service.sweep(NOW);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ candidates: 0, moved: 0, escalated: 0, users: 0 });
    });
  });

  describe('movimiento a la columna OVERDUE', () => {
    it('marca las vencidas y las anexa tras la última de la columna', async () => {
      scan(prisma, [
        { id: 't1', dueDate: inHours(-48), priority: TaskPriority.URGENT },
        { id: 't2', dueDate: inHours(-2), priority: TaskPriority.URGENT },
      ]);
      prisma.task.findFirst.mockResolvedValue({ position: 4 });

      const result = await service.sweep(NOW);

      expect(writes(prisma)).toEqual({
        t1: { status: TaskStatus.OVERDUE, position: 5 },
        t2: { status: TaskStatus.OVERDUE, position: 6 },
      });
      expect(result.moved).toBe(2);
    });

    it('empieza en la posición 0 si la columna está vacía', async () => {
      scan(prisma, [{ id: 't1', dueDate: inHours(-1), priority: TaskPriority.URGENT }]);
      prisma.task.findFirst.mockResolvedValue(null);

      await service.sweep(NOW);

      expect(writes(prisma).t1.position).toBe(0);
    });

    it('no consulta la cola de la columna si nadie va a entrar', async () => {
      scan(prisma, [{ id: 't1', dueDate: inHours(10), priority: TaskPriority.URGENT }]);

      await service.sweep(NOW);

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it('no mueve una tarea que ya estaba en OVERDUE', async () => {
      scan(prisma, [
        { id: 't1', status: TaskStatus.OVERDUE, dueDate: inHours(-5), priority: TaskPriority.URGENT },
      ]);

      const result = await service.sweep(NOW);

      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(result.moved).toBe(0);
    });
  });

  describe('reevaluación de prioridad', () => {
    it('sube la prioridad de una tarea que aún no vence pero se acerca', async () => {
      scan(prisma, [{ id: 't1', dueDate: inHours(3), priority: TaskPriority.LOW }]);

      const result = await service.sweep(NOW);

      // El motivo se guarda con la tarjeta, no solo en el log: este barrido sube
      // prioridades a una hora en la que nadie mira, y sin esto la persona se
      // encuentra una tarea en URGENT sin saber por qué.
      expect(writes(prisma)).toEqual({
        t1: {
          priority: TaskPriority.URGENT,
          priorityReason: expect.stringContaining('LOW → URGENT'),
          priorityAdjustedFrom: TaskPriority.LOW,
          priorityAdjustedAt: NOW,
        },
      });
      expect(result).toMatchObject({ moved: 0, escalated: 1 });
    });

    it('mueve y escala en la misma escritura si la tarea venció', async () => {
      scan(prisma, [{ id: 't1', dueDate: inHours(-3), priority: TaskPriority.LOW }]);

      const result = await service.sweep(NOW);

      expect(writes(prisma).t1).toEqual({
        priority: TaskPriority.URGENT,
        priorityReason: expect.stringContaining('LOW → URGENT'),
        priorityAdjustedFrom: TaskPriority.LOW,
        priorityAdjustedAt: NOW,
        status: TaskStatus.OVERDUE,
        position: 0,
      });
      expect(result).toMatchObject({ moved: 1, escalated: 1 });
    });

    it('escala una tarea ya atrasada sin volver a moverla', async () => {
      scan(prisma, [
        { id: 't1', status: TaskStatus.OVERDUE, dueDate: inHours(-30), priority: TaskPriority.MEDIUM },
      ]);

      const result = await service.sweep(NOW);

      expect(writes(prisma)).toEqual({
        t1: {
          priority: TaskPriority.URGENT,
          priorityReason: expect.stringContaining('MEDIUM → URGENT'),
          priorityAdjustedFrom: TaskPriority.MEDIUM,
          priorityAdjustedAt: NOW,
        },
      });
      expect(result).toMatchObject({ moved: 0, escalated: 1 });
    });

    it('no escribe nada si el estado y la prioridad ya son los que tocan', async () => {
      scan(prisma, [
        { id: 't1', status: TaskStatus.OVERDUE, dueDate: inHours(-30), priority: TaskPriority.URGENT },
        { id: 't2', dueDate: inHours(50), priority: TaskPriority.HIGH },
      ]);

      const result = await service.sweep(NOW);

      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ moved: 0, escalated: 0, candidates: 2 });
    });

    it('nunca baja la prioridad que ya tenía la tarea', async () => {
      scan(prisma, [{ id: 't1', dueDate: inHours(60), priority: TaskPriority.URGENT }]);

      await service.sweep(NOW);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('carreras con el tablero', () => {
    it('no escribe si la tarea salió del horizonte entre el escaneo y la transacción', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([{ id: 't1', userId: 'u1' }])
        .mockResolvedValue([]);

      const result = await service.sweep(NOW);

      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ candidates: 1, moved: 0, escalated: 0, users: 1 });
    });

    it('acota la relectura al usuario, para no colar tareas de otro', async () => {
      scan(prisma, [{ id: 't1', dueDate: inHours(-1) }]);

      await service.sweep(NOW);

      expect(prisma.task.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', id: { in: ['t1'] } }),
        }),
      );
    });
  });

  describe('aislamiento entre usuarios', () => {
    it('usa una transacción por usuario', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([
          { id: 't1', userId: 'u1' },
          { id: 't2', userId: 'u2' },
        ])
        .mockResolvedValue([row({ id: 't1', dueDate: inHours(-1) })]);

      const result = await service.sweep(NOW);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result.users).toBe(2);
    });

    it('sigue barriendo al resto si la transacción de uno falla', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([
          { id: 't1', userId: 'u1' },
          { id: 't2', userId: 'u2' },
        ])
        .mockResolvedValue([row({ id: 't2', dueDate: inHours(-1), priority: TaskPriority.URGENT })]);
      prisma.$transaction
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockImplementation((cb: any) => cb(prisma));

      const result = await service.sweep(NOW);

      expect(result).toMatchObject({ candidates: 2, moved: 1, users: 2 });
    });
  });
});

describe('OverdueService — anuncio de los cambios del cron', () => {
  let service: OverdueService;
  let prisma: any;
  let events: any;

  beforeEach(() => {
    prisma = makePrisma();
    events = { emitTaskUpdated: jest.fn(), emitTaskCreated: jest.fn(), emitTaskDeleted: jest.fn() };
    service = new OverdueService(prisma as unknown as PrismaService, events as unknown as TasksGateway);
  });

  it('emite una tarea por cada fila que tocó', async () => {
    scan(prisma, [
      { id: 't1', dueDate: inHours(-3), priority: TaskPriority.LOW },
      { id: 't2', dueDate: inHours(3), priority: TaskPriority.LOW },
    ]);

    await service.sweep(NOW);

    expect(events.emitTaskUpdated).toHaveBeenCalledTimes(2);
    const emitidas = events.emitTaskUpdated.mock.calls.map(([t]: any) => t.id);
    expect(emitidas.sort()).toEqual(['t1', 't2']);
  });

  it('emite la fila ya actualizada, no la que se leyó', async () => {
    scan(prisma, [{ id: 't1', dueDate: inHours(-3), priority: TaskPriority.LOW }]);

    await service.sweep(NOW);

    expect(events.emitTaskUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', status: TaskStatus.OVERDUE, priority: TaskPriority.URGENT }),
    );
  });

  it('no anuncia nada cuando no hubo cambios', async () => {
    scan(prisma, [
      { id: 't1', status: TaskStatus.OVERDUE, dueDate: inHours(-30), priority: TaskPriority.URGENT },
    ]);

    await service.sweep(NOW);

    expect(events.emitTaskUpdated).not.toHaveBeenCalled();
  });

  it('no anuncia los cambios de un usuario cuya transacción falló', async () => {
    prisma.task.findMany
      .mockResolvedValueOnce([
        { id: 't1', userId: 'u1' },
        { id: 't2', userId: 'u2' },
      ])
      .mockResolvedValue([row({ id: 't2', dueDate: inHours(-1), priority: TaskPriority.LOW })]);
    prisma.$transaction
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockImplementation((cb: any) => cb(prisma));

    await service.sweep(NOW);

    // Solo el segundo usuario llegó a escribir.
    expect(events.emitTaskUpdated).toHaveBeenCalledTimes(1);
    expect(events.emitTaskUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
  });
});
