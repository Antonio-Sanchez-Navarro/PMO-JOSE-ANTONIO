import { TaskStatus } from '@prisma/client';
import { OverdueService } from './overdue.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const NOW = new Date('2026-07-27T12:00:00.000Z');

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

/** `findMany` se llama dos veces: escaneo global y relectura por usuario. */
function scanReturns(prisma: any, scan: any[], stillDue = scan) {
  prisma.task.findMany.mockReset();
  prisma.task.findMany.mockResolvedValueOnce(scan).mockResolvedValue(stillDue);
}

describe('OverdueService — barrido de tareas vencidas', () => {
  let service: OverdueService;
  let prisma: any;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OverdueService(prisma as unknown as PrismaService);
  });

  describe('selección de candidatas', () => {
    it('solo considera tareas con dueDate anterior a "ahora" y en estados barribles', async () => {
      await service.sweep(NOW);

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.POSTPONED] },
            dueDate: { lt: NOW },
          },
        }),
      );
    });

    it('no abre transacción si no hay vencidas', async () => {
      const result = await service.sweep(NOW);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ candidates: 0, moved: 0, users: 0 });
    });

    it('excluye DONE y OVERDUE, lo que hace el barrido idempotente', async () => {
      await service.sweep(NOW);

      const statuses = prisma.task.findMany.mock.calls[0][0].where.status.in;
      expect(statuses).not.toContain(TaskStatus.DONE);
      expect(statuses).not.toContain(TaskStatus.OVERDUE);
    });
  });

  describe('movimiento a la columna OVERDUE', () => {
    it('marca cada tarea y la anexa tras la última de la columna', async () => {
      scanReturns(prisma, [
        { id: 't1', userId: 'u1' },
        { id: 't2', userId: 'u1' },
      ]);
      prisma.task.findFirst.mockResolvedValue({ position: 4 });

      const result = await service.sweep(NOW);

      expect(prisma.task.update).toHaveBeenNthCalledWith(1, {
        where: { id: 't1' },
        data: { status: TaskStatus.OVERDUE, position: 5 },
      });
      expect(prisma.task.update).toHaveBeenNthCalledWith(2, {
        where: { id: 't2' },
        data: { status: TaskStatus.OVERDUE, position: 6 },
      });
      expect(result).toEqual({ candidates: 2, moved: 2, users: 1 });
    });

    it('empieza en la posición 0 si la columna está vacía', async () => {
      scanReturns(prisma, [{ id: 't1', userId: 'u1' }]);
      prisma.task.findFirst.mockResolvedValue(null);

      await service.sweep(NOW);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: TaskStatus.OVERDUE, position: 0 },
      });
    });

    it('usa una transacción por usuario', async () => {
      scanReturns(
        prisma,
        [
          { id: 't1', userId: 'u1' },
          { id: 't2', userId: 'u2' },
        ],
        [{ id: 't1' }],
      );

      const result = await service.sweep(NOW);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result.users).toBe(2);
    });

    it('acota la relectura al usuario, para no colar tareas de otro', async () => {
      scanReturns(prisma, [{ id: 't1', userId: 'u1' }]);

      await service.sweep(NOW);

      expect(prisma.task.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', id: { in: ['t1'] } }),
        }),
      );
    });
  });

  describe('carreras con el tablero', () => {
    it('no escribe si la tarea dejó de estar vencida entre el escaneo y la transacción', async () => {
      scanReturns(prisma, [{ id: 't1', userId: 'u1' }], []);

      const result = await service.sweep(NOW);

      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(result).toEqual({ candidates: 1, moved: 0, users: 1 });
    });
  });

  describe('aislamiento entre usuarios', () => {
    it('sigue barriendo al resto si la transacción de uno falla', async () => {
      scanReturns(
        prisma,
        [
          { id: 't1', userId: 'u1' },
          { id: 't2', userId: 'u2' },
        ],
        [{ id: 't2' }],
      );
      prisma.$transaction
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockImplementation((cb: any) => cb(prisma));

      const result = await service.sweep(NOW);

      expect(result).toEqual({ candidates: 2, moved: 1, users: 2 });
    });
  });
});
