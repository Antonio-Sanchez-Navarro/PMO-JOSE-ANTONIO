import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TimeService } from './time.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TasksGateway } from '../tasks/tasks.gateway';

const USER_ID = 'user-1';
const TASK_ID = 'task-1';
const OTRA_TAREA = 'task-2';

const TAREA = { id: TASK_ID, title: 'Escrituración Lote 36' };

/** Un fichaje en marcha: sin final, sin duración y con el centinela puesto. */
const enMarcha = {
  id: 'entry-1',
  userId: USER_ID,
  taskId: TASK_ID,
  startedAt: new Date('2026-07-29T10:00:00.000Z'),
  endedAt: null,
  durationSec: null,
  note: null,
  activeFor: USER_ID,
  task: TAREA,
};

describe('TimeService', () => {
  let service: TimeService;
  let prisma: any;
  let tx: any;
  let gateway: {
    emitTimeStarted: jest.Mock;
    emitTimeStopped: jest.Mock;
    emitTimeDeleted: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      timeEntry: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ startedAt: enMarcha.startedAt }),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ ...enMarcha, id: where.id, ...data }),
        ),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'entry-nueva', ...data, task: TAREA }),
        ),
      },
    };
    prisma = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: TASK_ID }),
        findMany: jest.fn().mockResolvedValue([TAREA]),
      },
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ startedAt: enMarcha.startedAt }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'entry-nueva', ...data, task: TAREA }),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ ...enMarcha, id: where.id, ...data }),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    gateway = {
      emitTimeStarted: jest.fn(),
      emitTimeStopped: jest.fn(),
      emitTimeDeleted: jest.fn(),
    };

    service = new TimeService(
      prisma as unknown as PrismaService,
      gateway as unknown as TasksGateway,
    );
  });

  describe('arrancar el cronómetro', () => {
    it('404 si la tarea no existe o no es del usuario', async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.start(USER_ID, 'ajena', {})).rejects.toThrow(NotFoundException);
    });

    it('filtra la tarea por userId además de por id', async () => {
      await service.start(USER_ID, TASK_ID, {});

      expect(prisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TASK_ID, userId: USER_ID } }),
      );
    });

    it('marca el centinela para que la base impida un segundo cronómetro', async () => {
      await service.start(USER_ID, TASK_ID, {});

      expect(tx.timeEntry.create.mock.calls[0][0].data.activeFor).toBe(USER_ID);
    });

    it('un doble clic sobre la misma tarea devuelve el que ya corría', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);

      const entry = await service.start(USER_ID, TASK_ID, {});

      expect(entry).toBe(enMarcha);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(gateway.emitTimeStarted).not.toHaveBeenCalled();
    });

    it('arrancar sobre otra tarea cierra el anterior en la misma transacción', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);
      prisma.task.findFirst.mockResolvedValue({ id: OTRA_TAREA });

      await service.start(USER_ID, OTRA_TAREA, {});

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const cierre = tx.timeEntry.update.mock.calls[0][0];
      expect(cierre.where.id).toBe(enMarcha.id);
      expect(cierre.data.endedAt).toBeInstanceOf(Date);
      // Suelta el centinela: si no, el insert siguiente chocaría contra su
      // propio índice único.
      expect(cierre.data.activeFor).toBeNull();
      expect(tx.timeEntry.create).toHaveBeenCalledTimes(1);
    });

    it('anuncia el cierre y el arranque, sin eco a quien lo pidió', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);
      prisma.task.findFirst.mockResolvedValue({ id: OTRA_TAREA });

      await service.start(USER_ID, OTRA_TAREA, {}, 'socket-abc');

      expect(gateway.emitTimeStopped.mock.calls[0][1]).toBe('socket-abc');
      expect(gateway.emitTimeStarted.mock.calls[0][1]).toBe('socket-abc');
    });

    it('la carrera entre dos pestañas acaba en 409 y no en un 500 de Prisma', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await expect(service.start(USER_ID, TASK_ID, {})).rejects.toThrow(ConflictException);
    });

    it('un fallo que no sea el del índice sube tal cual', async () => {
      prisma.$transaction.mockRejectedValue(new Error('se cayó la base'));

      await expect(service.start(USER_ID, TASK_ID, {})).rejects.toThrow('se cayó la base');
    });
  });

  describe('detener el cronómetro', () => {
    it('409 si no hay ninguno en marcha', async () => {
      await expect(service.stop(USER_ID)).rejects.toThrow(ConflictException);
    });

    it('calcula la duración y suelta el centinela', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);
      prisma.timeEntry.findUniqueOrThrow.mockResolvedValue({
        startedAt: new Date('2026-07-29T10:00:00.000Z'),
      });
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:25:30.000Z'));

      await service.stop(USER_ID);

      const data = prisma.timeEntry.update.mock.calls[0][0].data;
      expect(data.durationSec).toBe(25 * 60 + 30);
      expect(data.activeFor).toBeNull();
      jest.useRealTimers();
    });

    it('sin taskId detiene el que corra, con taskId solo el de esa tarea', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);

      await service.stop(USER_ID);
      expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toEqual({
        userId: USER_ID,
        endedAt: null,
      });

      await service.stop(USER_ID, TASK_ID);
      expect(prisma.timeEntry.findFirst.mock.calls[1][0].where).toEqual({
        userId: USER_ID,
        endedAt: null,
        taskId: TASK_ID,
      });
    });
  });

  describe('tramos apuntados a mano', () => {
    const tramo = {
      taskId: TASK_ID,
      startedAt: '2026-07-28T09:00:00.000Z',
      endedAt: '2026-07-28T11:30:00.000Z',
    };

    it('nace cerrado y con su duración', async () => {
      await service.createEntry(USER_ID, tramo);

      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.durationSec).toBe(2.5 * 3600);
      expect(data.endedAt).toEqual(new Date(tramo.endedAt));
    });

    it('no toca el centinela: no compite con el cronómetro en marcha', async () => {
      await service.createEntry(USER_ID, tramo);

      expect(prisma.timeEntry.create.mock.calls[0][0].data).not.toHaveProperty('activeFor');
    });

    it('400 si el tramo acaba antes de empezar', async () => {
      await expect(
        service.createEntry(USER_ID, { ...tramo, endedAt: '2026-07-28T08:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 si empieza y acaba en el mismo instante', async () => {
      await expect(
        service.createEntry(USER_ID, { ...tramo, endedAt: tramo.startedAt }),
      ).rejects.toThrow(BadRequestException);
    });

    it('404 si la tarea no es del usuario', async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.createEntry(USER_ID, tramo)).rejects.toThrow(NotFoundException);
    });
  });

  describe('corregir un fichaje', () => {
    it('400 si el cuerpo no trae nada que cambiar', async () => {
      await expect(service.update(USER_ID, 'entry-1', {})).rejects.toThrow(BadRequestException);
    });

    it('404 si el fichaje no es del usuario', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, 'entry-1', { note: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('poner el final sobre el que corre lo cierra de verdad', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);

      await service.update(USER_ID, 'entry-1', { endedAt: '2026-07-29T11:00:00.000Z' });

      const data = prisma.timeEntry.update.mock.calls[0][0].data;
      expect(data.durationSec).toBe(3600);
      expect(data.activeFor).toBeNull();
    });

    it('mover el principio recalcula la duración del tramo ya cerrado', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({
        ...enMarcha,
        endedAt: new Date('2026-07-29T11:00:00.000Z'),
        durationSec: 3600,
        activeFor: null,
      });

      await service.update(USER_ID, 'entry-1', { startedAt: '2026-07-29T10:30:00.000Z' });

      expect(prisma.timeEntry.update.mock.calls[0][0].data.durationSec).toBe(1800);
    });

    it('editar solo la nota del que corre no lo cierra', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(enMarcha);

      await service.update(USER_ID, 'entry-1', { note: 'llamada con notaría' });

      const data = prisma.timeEntry.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('endedAt');
      expect(data).not.toHaveProperty('durationSec');
      expect(data.note).toBe('llamada con notaría');
    });

    it('400 si la corrección deja el final antes del principio', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({
        ...enMarcha,
        endedAt: new Date('2026-07-29T11:00:00.000Z'),
      });

      await expect(
        service.update(USER_ID, 'entry-1', { startedAt: '2026-07-29T12:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('borrar un fichaje', () => {
    it('404 si no es del usuario, sin llegar a borrar', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_ID, 'entry-1')).rejects.toThrow(NotFoundException);
      expect(prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('borra filtrando por userId y avisa con la tarea a la que restar', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'entry-1', taskId: TASK_ID });

      await service.remove(USER_ID, 'entry-1', 'socket-abc');

      expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: 'entry-1', userId: USER_ID },
      });
      expect(gateway.emitTimeDeleted).toHaveBeenCalledWith(
        { id: 'entry-1', taskId: TASK_ID, userId: USER_ID },
        'socket-abc',
      );
    });
  });

  describe('informe', () => {
    it('por tarea: suma, ordena de mayor a menor y pone el título', async () => {
      prisma.timeEntry.groupBy.mockResolvedValue([
        { taskId: TASK_ID, _sum: { durationSec: 600 } },
        { taskId: OTRA_TAREA, _sum: { durationSec: 3600 } },
      ]);
      prisma.task.findMany.mockResolvedValue([TAREA, { id: OTRA_TAREA, title: 'KYC' }]);

      const informe = await service.report(USER_ID, {});

      expect(informe.groupBy).toBe('task');
      expect(informe.rows.map((f) => f.label)).toEqual(['KYC', TAREA.title]);
      expect(informe.totalSec).toBe(4200);
    });

    it('deja fuera los fichajes sin cerrar: no tienen duración que sumar', async () => {
      await service.report(USER_ID, {});

      expect(prisma.timeEntry.groupBy.mock.calls[0][0].where.durationSec).toEqual({ not: null });
    });

    it('el rango es cerrado por abajo y abierto por arriba', async () => {
      await service.report(USER_ID, { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' });

      expect(prisma.timeEntry.groupBy.mock.calls[0][0].where.startedAt).toEqual({
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lt: new Date('2026-08-01T00:00:00.000Z'),
      });
    });

    it('por día agrupa en SQL y devuelve la fecha en YYYY-MM-DD', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { bucket: new Date('2026-07-28T00:00:00.000Z'), seconds: 1800 },
        { bucket: new Date('2026-07-29T00:00:00.000Z'), seconds: 900 },
      ]);

      const informe = await service.report(USER_ID, { groupBy: 'day' });

      expect(prisma.timeEntry.groupBy).not.toHaveBeenCalled();
      expect(informe.rows).toEqual([
        { key: '2026-07-28', label: '2026-07-28', seconds: 1800 },
        { key: '2026-07-29', label: '2026-07-29', seconds: 900 },
      ]);
      expect(informe.totalSec).toBe(2700);
    });

    it('sin fichajes devuelve el informe vacío y no busca títulos', async () => {
      const informe = await service.report(USER_ID, {});

      expect(informe.rows).toEqual([]);
      expect(informe.totalSec).toBe(0);
      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });
  });
});
