import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksGateway } from './tasks.gateway';
import { PrismaService } from '../../common/prisma/prisma.service';

const USER = 'user-1';

/**
 * Gateway simulado. El servicio solo lo usa para anunciar cambios ya escritos,
 * así que en las pruebas que no miran el realtime basta con que no estalle.
 */
const gateway = () =>
  ({
    emitTaskCreated: jest.fn(),
    emitTaskUpdated: jest.fn(),
    emitTasksReordered: jest.fn(),
    emitTaskDeleted: jest.fn(),
  }) as unknown as TasksGateway;

/**
 * Prisma simulado con una tabla en memoria.
 *
 * Un mock de llamadas sueltas no serviría aquí: lo que hay que comprobar es el
 * estado final de las columnas tras renumerar, no qué métodos se invocaron.
 */
function makePrisma(rows: { id: string; status: string; position: number }[]) {
  const table = rows.map((r, i) => ({ ...r, userId: USER, createdAt: new Date(2026, 0, i + 1) }));

  const tx = {
    task: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(table.find((t) => t.id === where.id && t.userId === where.userId) ?? null),
      ),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          table
            .filter((t) => t.userId === where.userId && t.status === where.status)
            .sort((a, b) => a.position - b.position || +a.createdAt - +b.createdAt)
            .map((t) => ({ id: t.id, position: t.position })),
        ),
      ),
      update: jest.fn(({ where, data }) => {
        const row = table.find((t) => t.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      findUniqueOrThrow: jest.fn(({ where }) =>
        Promise.resolve(table.find((t) => t.id === where.id)!),
      ),
    },
  };

  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  /** Columna en su orden final, como la vería el tablero. */
  const column = (status: string) =>
    table
      .filter((t) => t.status === status)
      .sort((a, b) => a.position - b.position)
      .map((t) => `${t.id}@${t.position}`);

  return { prisma: prisma as unknown as PrismaService, tx, column, table };
}

/** Doble del servicio de etiquetas: estas pruebas no cuelgan ninguna. */
const tagsVacio = () => ({ resolveIds: jest.fn().mockResolvedValue([]) }) as any;

describe('TasksService.move', () => {
  const TODO = [
    { id: 'a', status: 'TODO', position: 0 },
    { id: 'b', status: 'TODO', position: 1 },
    { id: 'c', status: 'TODO', position: 2 },
    { id: 'd', status: 'TODO', position: 3 },
  ];
  const IN_PROGRESS = [
    { id: 'x', status: 'IN_PROGRESS', position: 0 },
    { id: 'y', status: 'IN_PROGRESS', position: 1 },
  ];

  it('rechaza con 404 una tarea que no es del usuario', async () => {
    const { prisma } = makePrisma(TODO);
    const service = new TasksService(prisma, gateway(), tagsVacio());

    await expect(
      service.move('otro-usuario', 'a', { status: 'TODO' as any, position: 0 }),
    ).rejects.toThrow(NotFoundException);
  });

  describe('dentro de la misma columna', () => {
    it('mueve hacia abajo y renumera sin huecos', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'a', { status: 'TODO' as any, position: 2 });

      expect(column('TODO')).toEqual(['b@0', 'c@1', 'a@2', 'd@3']);
    });

    it('mueve hacia arriba', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'd', { status: 'TODO' as any, position: 0 });

      expect(column('TODO')).toEqual(['d@0', 'a@1', 'b@2', 'c@3']);
    });

    it('acota una posición fuera de rango al último hueco', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'a', { status: 'TODO' as any, position: 999 });

      expect(column('TODO')).toEqual(['b@0', 'c@1', 'd@2', 'a@3']);
    });

    it('devuelve solo la columna afectada', async () => {
      const { prisma } = makePrisma(TODO);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      const result = await service.move(USER, 'a', { status: 'TODO' as any, position: 1 });

      expect(result.columns).toHaveLength(1);
      expect(result.columns[0]).toEqual({ status: 'TODO', taskIds: ['b', 'a', 'c', 'd'] });
    });

    it('no escribe las tarjetas cuya posición no cambia', async () => {
      const { prisma, tx } = makePrisma(TODO);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      // Mover 'c' (pos 2) a la 3 solo afecta a 'c' y 'd'.
      await service.move(USER, 'c', { status: 'TODO' as any, position: 3 });

      const escritas = tx.task.update.mock.calls.map((c) => c[0].where.id);
      expect(escritas).not.toContain('a');
      expect(escritas).not.toContain('b');
    });
  });

  describe('entre columnas', () => {
    it('inserta en destino y cierra el hueco en origen', async () => {
      const { prisma, column } = makePrisma([...TODO, ...IN_PROGRESS]);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'b', { status: 'IN_PROGRESS' as any, position: 1 });

      expect(column('IN_PROGRESS')).toEqual(['x@0', 'b@1', 'y@2']);
      expect(column('TODO')).toEqual(['a@0', 'c@1', 'd@2']);
    });

    it('cambia el status de la tarjeta movida', async () => {
      const { prisma, table } = makePrisma([...TODO, ...IN_PROGRESS]);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

      expect(table.find((t) => t.id === 'a')!.status).toBe('IN_PROGRESS');
    });

    it('devuelve las dos columnas afectadas, destino primero', async () => {
      const { prisma } = makePrisma([...TODO, ...IN_PROGRESS]);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      const result = await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]).toEqual({ status: 'IN_PROGRESS', taskIds: ['a', 'x', 'y'] });
      expect(result.columns[1]).toEqual({ status: 'TODO', taskIds: ['b', 'c', 'd'] });
    });

    it('admite mover a una columna vacía', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'a', { status: 'DONE' as any, position: 0 });

      expect(column('DONE')).toEqual(['a@0']);
      expect(column('TODO')).toEqual(['b@0', 'c@1', 'd@2']);
    });
  });

  it('hace todo el trabajo dentro de una transacción', async () => {
    const { prisma } = makePrisma(TODO);
    const service = new TasksService(prisma, gateway(), tagsVacio());

    await service.move(USER, 'a', { status: 'TODO' as any, position: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('renumera correctamente aunque las posiciones de partida estén repetidas', async () => {
    // Estado real previo al saneamiento: seis ceros en la misma columna.
    const { prisma, column } = makePrisma([
      { id: 'p', status: 'TODO', position: 0 },
      { id: 'q', status: 'TODO', position: 0 },
      { id: 'r', status: 'TODO', position: 0 },
    ]);
    const service = new TasksService(prisma, gateway(), tagsVacio());

    await service.move(USER, 'r', { status: 'TODO' as any, position: 0 });

    // El desempate por createdAt mantiene p antes que q.
    expect(column('TODO')).toEqual(['r@0', 'p@1', 'q@2']);
  });

  /**
   * `completedAt` era una columna muerta: existía desde el Sprint 1 y nadie la
   * escribía. Sin ella no hay throughput, así que se sella aquí, que es donde
   * de verdad se cierran las tareas: arrastrando la tarjeta.
   */
  describe('fecha de cierre', () => {
    const conCierre = () => [
      { id: 'a', status: 'TODO', position: 0 },
      { id: 'z', status: 'DONE', position: 0 },
    ];

    it('sella la fecha al arrastrar a Cumplidas', async () => {
      const { prisma, table } = makePrisma(conCierre());
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'a', { status: 'DONE' as any, position: 0 });

      expect((table.find((t) => t.id === 'a') as any).completedAt).toBeInstanceOf(Date);
    });

    it('la limpia al sacarla de Cumplidas', async () => {
      const { prisma, table } = makePrisma(conCierre());
      const service = new TasksService(prisma, gateway(), tagsVacio());
      (table.find((t) => t.id === 'z') as any).completedAt = new Date('2026-07-20T10:00:00Z');

      await service.move(USER, 'z', { status: 'TODO' as any, position: 0 });

      // Si se quedara puesta, el throughput del 20 contaría para siempre un
      // cierre que se deshizo.
      expect((table.find((t) => t.id === 'z') as any).completedAt).toBeNull();
    });

    it('no la vuelve a sellar al reordenar dentro de Cumplidas', async () => {
      const original = new Date('2026-07-20T10:00:00Z');
      const { prisma, table } = makePrisma([
        { id: 'z', status: 'DONE', position: 0 },
        { id: 'w', status: 'DONE', position: 1 },
      ]);
      const service = new TasksService(prisma, gateway(), tagsVacio());
      (table.find((t) => t.id === 'z') as any).completedAt = original;

      await service.move(USER, 'z', { status: 'DONE' as any, position: 1 });

      expect((table.find((t) => t.id === 'z') as any).completedAt).toEqual(original);
    });

    it('no le pone fecha de cierre a una tarea que no pasa por Cumplidas', async () => {
      const { prisma, table } = makePrisma(conCierre());
      const service = new TasksService(prisma, gateway(), tagsVacio());

      await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

      expect((table.find((t) => t.id === 'a') as any).completedAt).toBeUndefined();
    });
  });
});

describe('TasksService.create', () => {
  const HOUR_MS = 3_600_000;
  const inHours = (h: number) => new Date(Date.now() + h * HOUR_MS).toISOString();

  let prisma: any;
  let tx: any;
  let events: any;
  let service: TasksService;

  beforeEach(() => {
    tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'nueva', ...data })),
      },
    };
    prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    events = gateway();
    service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());
  });

  /** El `data` con el que se llamó a `task.create`. */
  const creada = () => tx.task.create.mock.calls[0][0].data;

  it('aplica los valores por defecto del tablero', async () => {
    await service.create(USER, { title: 'Llamar al proveedor' });

    expect(creada()).toMatchObject({
      userId: USER,
      title: 'Llamar al proveedor',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: null,
      tags: [],
      position: 0,
    });
  });

  it('marca la tarea como MANUAL para que el reproceso de correos no la borre', async () => {
    await service.create(USER, { title: 'x' });

    expect(creada().source).toBe('MANUAL');
  });

  it('la coloca al final de su columna', async () => {
    tx.task.findFirst.mockResolvedValue({ position: 7 });

    await service.create(USER, { title: 'x', status: 'IN_PROGRESS' as any });

    expect(creada().position).toBe(8);
    expect(tx.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, status: 'IN_PROGRESS' } }),
    );
  });

  it('escala la prioridad si la fecha aprieta', async () => {
    await service.create(USER, { title: 'x', priority: 'LOW' as any, dueDate: inHours(3) });

    expect(creada().priority).toBe('URGENT');
  });

  describe('auditoría de prioridad', () => {
    it('guarda el motivo con la tarea, no solo en el log', async () => {
      await service.create(USER, { title: 'x', priority: 'LOW' as any, dueDate: inHours(3) });

      // Hasta la deuda del Sprint 3, el porqué solo quedaba en el log del
      // proceso: la interfaz no podía leerlo y se perdía al rotar.
      expect(creada()).toMatchObject({
        priority: 'URGENT',
        priorityReason: expect.stringContaining('LOW → URGENT'),
        priorityAdjustedFrom: 'LOW',
        priorityAdjustedAt: expect.any(Date),
      });
    });

    it('una tarea que nace con la prioridad pedida no tiene nada que explicar', async () => {
      await service.create(USER, { title: 'x', priority: 'LOW' as any, dueDate: inHours(200) });

      // Un motivo vacío en la tarjeta se leería como que el sistema la tocó.
      expect(creada().priorityReason).toBeUndefined();
      expect(creada().priorityAdjustedFrom).toBeUndefined();
    });

    it('lo cumplido no se audita, porque tampoco se escala', async () => {
      await service.create(USER, {
        title: 'x',
        status: 'DONE' as any,
        priority: 'LOW' as any,
        dueDate: inHours(-5),
      });

      expect(creada()).toMatchObject({ priority: 'LOW' });
      expect(creada().priorityReason).toBeUndefined();
    });
  });

  it('respeta la prioridad elegida si la fecha está lejos', async () => {
    await service.create(USER, { title: 'x', priority: 'LOW' as any, dueDate: inHours(200) });

    expect(creada().priority).toBe('LOW');
  });

  it('nace en OVERDUE si se crea con una fecha ya pasada', async () => {
    await service.create(USER, { title: 'x', dueDate: inHours(-5) });

    expect(creada()).toMatchObject({ status: 'OVERDUE', priority: 'URGENT' });
  });

  it('no reabre una tarea creada como cumplida aunque la fecha haya pasado', async () => {
    await service.create(USER, { title: 'x', status: 'DONE' as any, priority: 'LOW' as any, dueDate: inHours(-5) });

    expect(creada()).toMatchObject({ status: 'DONE', priority: 'LOW' });
  });
});

describe('TasksService.remove', () => {
  let prisma: any;
  let tx: any;
  let events: any;
  let service: TasksService;

  beforeEach(() => {
    tx = {
      timeEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tarea-1', status: 'TODO', userId: USER }),
        delete: jest.fn().mockResolvedValue({ id: 'tarea-1' }),
      },
    };
    prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    events = gateway();
    service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());
  });

  it('comprueba la propiedad filtrando por usuario, no solo por id', async () => {
    await service.remove(USER, 'tarea-1');

    expect(tx.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tarea-1', userId: USER } }),
    );
    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: 'tarea-1' } });
  });

  it('borra antes los registros de tiempo, que no tienen cascada en el schema', async () => {
    await service.remove(USER, 'tarea-1');

    expect(tx.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'tarea-1', userId: USER } });
  });

  it('devuelve 404 si la tarea no existe o es de otro usuario', async () => {
    tx.task.findFirst.mockResolvedValue(null);

    await expect(service.remove(USER, 'ajena')).rejects.toThrow(NotFoundException);
    expect(tx.task.delete).not.toHaveBeenCalled();
  });
});

describe('TasksService.findAll — filtros y búsqueda', () => {
  let prisma: any;
  let service: TasksService;

  beforeEach(() => {
    prisma = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new TasksService(prisma as unknown as PrismaService, gateway(), tagsVacio());
  });

  /** El `where` con el que se consultó la tabla. */
  const where = () => prisma.task.findMany.mock.calls[0][0].where;

  it('siempre acota al usuario', async () => {
    await service.findAll(USER, {});

    expect(where()).toEqual({ userId: USER });
  });

  it('cuenta con el mismo where que lista, para que el total case con el filtro', async () => {
    await service.findAll(USER, { status: 'DONE' as any });

    expect(prisma.task.count).toHaveBeenCalledWith({ where: where() });
  });

  it('filtra por status y por priority', async () => {
    await service.findAll(USER, { status: 'IN_PROGRESS' as any, priority: 'HIGH' as any });

    expect(where()).toMatchObject({ status: 'IN_PROGRESS', priority: 'HIGH' });
  });

  it('busca en título y descripción sin distinguir mayúsculas', async () => {
    await service.findAll(USER, { search: 'cotización' });

    expect(where().OR).toEqual([
      { title: { contains: 'cotización', mode: 'insensitive' } },
      { description: { contains: 'cotización', mode: 'insensitive' } },
    ]);
  });

  it('combina búsqueda y filtros en la misma consulta', async () => {
    await service.findAll(USER, { search: 'obra', status: 'TODO' as any });

    expect(where()).toMatchObject({ userId: USER, status: 'TODO' });
    expect(where().OR).toHaveLength(2);
  });

  it('ignora una búsqueda vacía en vez de filtrar por cadena vacía', async () => {
    await service.findAll(USER, { search: '' });

    expect(where()).toEqual({ userId: USER });
  });

  describe('filtro por etiqueta del usuario', () => {
    it('filtra por la relación labels, no por el arreglo de texto de la IA', async () => {
      await service.findAll(USER, { tagId: ['tag-1'] } as never);

      // `tags` (texto libre del modelo) y `labels` (el modelo Tag, con color)
      // son dos cosas distintas: el desplegable de la interfaz se llena de las
      // segundas.
      expect(where().labels).toEqual({ some: { id: { in: ['tag-1'] } } });
      expect(where().tags).toBeUndefined();
    });

    it('varias etiquetas amplían la vista, no la vacían', async () => {
      await service.findAll(USER, { tagId: ['tag-1', 'tag-2'] } as never);

      // `some` y no `every`: es lo que hace un filtro de facetas.
      expect(where().labels).toEqual({ some: { id: { in: ['tag-1', 'tag-2'] } } });
    });

    it('un id repetido no cambia el resultado ni da 400', async () => {
      await service.findAll(USER, { tagId: ['tag-1', 'tag-1'] } as never);

      expect(where().labels.some.id.in).toEqual(['tag-1']);
    });

    it('sin etiquetas no acota por ellas', async () => {
      await service.findAll(USER, {});

      expect(where().labels).toBeUndefined();
    });
  });

  describe('filtro por rango de vencimiento', () => {
    it('incluye por abajo y excluye por arriba', async () => {
      await service.findAll(USER, {
        dueFrom: '2026-08-01T00:00:00.000Z',
        dueTo: '2026-08-08T00:00:00.000Z',
      } as never);

      // Exclusivo por arriba para que dos rangos consecutivos no cuenten dos
      // veces la misma tarea, igual que en el informe de tiempos.
      expect(where().dueDate).toEqual({
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lt: new Date('2026-08-08T00:00:00.000Z'),
      });
    });

    it('acepta solo el extremo de abajo', async () => {
      await service.findAll(USER, { dueFrom: '2026-08-01T00:00:00.000Z' } as never);

      expect(where().dueDate).toEqual({ gte: new Date('2026-08-01T00:00:00.000Z') });
    });

    it('acepta solo el extremo de arriba', async () => {
      await service.findAll(USER, { dueTo: '2026-08-08T00:00:00.000Z' } as never);

      expect(where().dueDate).toEqual({ lt: new Date('2026-08-08T00:00:00.000Z') });
    });

    it('sin rango no acota por fecha: las tareas sin vencimiento siguen saliendo', async () => {
      await service.findAll(USER, {});

      expect(where().dueDate).toBeUndefined();
    });
  });

  it('los filtros se combinan entre sí', async () => {
    await service.findAll(USER, {
      status: 'TODO' as never,
      search: 'obra',
      tagId: ['tag-1'],
      dueFrom: '2026-08-01T00:00:00.000Z',
    } as never);

    expect(where()).toMatchObject({
      userId: USER,
      status: 'TODO',
      labels: { some: { id: { in: ['tag-1'] } } },
      dueDate: { gte: new Date('2026-08-01T00:00:00.000Z') },
    });
    expect(where().OR).toHaveLength(2);
  });

  it('pagina con 0/50 por defecto', async () => {
    await service.findAll(USER, {});

    const args = prisma.task.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 0, take: 50 });
  });

  it('devuelve el total junto a la página pedida', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 'a', timeEntries: [] }]);
    prisma.task.count.mockResolvedValue(42);

    const res = await service.findAll(USER, { skip: 10, take: 5 });

    expect(res).toEqual({
      // Cada tarjeta viaja con su tiempo resumido (Sprint 5): sin fichajes, en
      // cero y sin cronómetro.
      data: [{ id: 'a', totalTimeSec: 0, activeTimeEntryId: null, activeTimeStartedAt: null }],
      total: 42,
      skip: 10,
      take: 5,
    });
  });

  describe('resumen de tiempo por tarjeta', () => {
    const arrancado = new Date('2026-07-29T10:00:00.000Z');

    it('suma los tramos cerrados y señala el cronómetro en marcha', async () => {
      prisma.task.findMany.mockResolvedValue([
        {
          id: 'a',
          timeEntries: [
            { id: 'e1', durationSec: 600, startedAt: new Date(), endedAt: new Date() },
            { id: 'e2', durationSec: 1800, startedAt: new Date(), endedAt: new Date() },
            // El que corre: sin duración todavía.
            { id: 'e3', durationSec: null, startedAt: arrancado, endedAt: null },
          ],
        },
      ]);

      const res = await service.findAll(USER, {});

      expect(res.data[0]).toMatchObject({
        totalTimeSec: 2400,
        activeTimeEntryId: 'e3',
        activeTimeStartedAt: arrancado,
      });
    });

    it('no deja escapar los fichajes en crudo en la respuesta', async () => {
      prisma.task.findMany.mockResolvedValue([
        { id: 'a', timeEntries: [{ id: 'e1', durationSec: 60, startedAt: new Date(), endedAt: new Date() }] },
      ]);

      const res = await service.findAll(USER, {});

      expect(res.data[0]).not.toHaveProperty('timeEntries');
    });
  });
});

describe('TasksService — emisión de eventos realtime', () => {
  let prisma: any;
  let tx: any;
  let events: any;
  let service: TasksService;

  beforeEach(() => {
    tx = {
      timeEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tarea-1', status: 'IN_PROGRESS', userId: USER }),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'nueva', ...data })),
        delete: jest.fn().mockResolvedValue({ id: 'tarea-1' }),
      },
    };
    prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    events = gateway();
    service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());
  });

  it('anuncia la tarea creada, con el id que le puso la base de datos', async () => {
    const creada = await service.create(USER, { title: 'Nueva' });

    expect(events.emitTaskCreated).toHaveBeenCalledWith(creada, undefined);
    expect(creada.id).toBe('nueva');
  });

  it('anuncia el borrado con la columna en la que estaba la tarjeta', async () => {
    await service.remove(USER, 'tarea-1');

    expect(events.emitTaskDeleted).toHaveBeenCalledWith(
      { id: 'tarea-1', status: 'IN_PROGRESS', userId: USER },
      undefined,
    );
  });

  it('no anuncia nada si la creación falla', async () => {
    // Escenario real: la transacción revienta y el cliente no debe ver una
    // tarjeta que no existe.
    prisma.$transaction.mockRejectedValue(new Error('sin conexión'));

    await expect(service.create(USER, { title: 'x' })).rejects.toThrow();
    expect(events.emitTaskCreated).not.toHaveBeenCalled();
  });

  it('no anuncia un borrado que devolvió 404', async () => {
    tx.task.findFirst.mockResolvedValue(null);

    await expect(service.remove(USER, 'ajena')).rejects.toThrow(NotFoundException);
    expect(events.emitTaskDeleted).not.toHaveBeenCalled();
  });
});

describe('TasksService — task.updated', () => {
  it('anuncia la tarea tras un PATCH, con la fila ya escrita', async () => {
    const prisma: any = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tarea-1', userId: USER }),
        update: jest.fn().mockResolvedValue({ id: 'tarea-1', userId: USER, status: 'DONE' }),
      },
    };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    const actualizada = await service.update(USER, 'tarea-1', { status: 'DONE' as any });

    expect(events.emitTaskUpdated).toHaveBeenCalledWith(actualizada, undefined);
    // La emitida es la de después del update, no la que se leyó para validar.
    expect(events.emitTaskUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DONE' }),
      undefined,
    );
  });

  /**
   * El arrastre no es la única forma de cerrar una tarea: el modal de edición
   * también cambia el estado. Si el sellado viviera solo en `move`, cerrar desde
   * el modal no contaría para el throughput.
   */
  describe('fecha de cierre desde el modal', () => {
    const prismaCon = (statusActual: string) => ({
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tarea-1', userId: USER, status: statusActual }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tarea-1', ...data })),
      },
    });

    it('sella la fecha si el PATCH cierra la tarea', async () => {
      const prisma: any = prismaCon('IN_PROGRESS');
      const service = new TasksService(prisma as unknown as PrismaService, gateway(), tagsVacio());

      await service.update(USER, 'tarea-1', { status: 'DONE' as any });

      expect(prisma.task.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    });

    it('la limpia si el PATCH reabre la tarea', async () => {
      const prisma: any = prismaCon('DONE');
      const service = new TasksService(prisma as unknown as PrismaService, gateway(), tagsVacio());

      await service.update(USER, 'tarea-1', { status: 'TODO' as any });

      expect(prisma.task.update.mock.calls[0][0].data.completedAt).toBeNull();
    });

    it('no la toca en un PATCH que no cambia el estado', async () => {
      const prisma: any = prismaCon('DONE');
      const service = new TasksService(prisma as unknown as PrismaService, gateway(), tagsVacio());

      // Cambiar el título de una tarea cerrada no la descierra.
      await service.update(USER, 'tarea-1', { title: 'Otro título' } as any);

      expect(prisma.task.update.mock.calls[0][0].data).not.toHaveProperty('completedAt');
    });
  });

  it('el payload del PATCH lleva userId, que es el filtro de seguridad del cliente', async () => {
    const prisma: any = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tarea-1', userId: USER }),
        update: jest.fn().mockResolvedValue({ id: 'tarea-1', userId: USER }),
      },
    };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    await service.update(USER, 'tarea-1', { status: 'DONE' as any });

    expect((events.emitTaskUpdated as jest.Mock).mock.calls[0][0].userId).toBe(USER);
  });

  it('no anuncia un PATCH que devolvió 404', async () => {
    const prisma: any = {
      task: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    await expect(service.update(USER, 'ajena', { status: 'DONE' as any })).rejects.toThrow(
      NotFoundException,
    );
    expect(events.emitTaskUpdated).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('anuncia la tarjeta arrastrada, ya con su columna nueva', async () => {
    const { prisma } = makePrisma([
      { id: 'a', status: 'TODO', position: 0 },
      { id: 'b', status: 'TODO', position: 1 },
    ]);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    const result = await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

    expect(events.emitTaskUpdated).toHaveBeenCalledTimes(1);
    expect(events.emitTaskUpdated).toHaveBeenCalledWith(result.task, undefined);
    expect((events.emitTaskUpdated as jest.Mock).mock.calls[0][0].status).toBe('IN_PROGRESS');
  });

  it('no anuncia un arrastre rechazado por no ser del usuario', async () => {
    const { prisma } = makePrisma([{ id: 'a', status: 'TODO', position: 0 }]);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    await expect(
      service.move('otro-usuario', 'a', { status: 'DONE' as any, position: 0 }),
    ).rejects.toThrow(NotFoundException);
    expect(events.emitTaskUpdated).not.toHaveBeenCalled();
  });
});

describe('TasksService — task.reordered', () => {
  const TABLERO = [
    { id: 'a', status: 'TODO', position: 0 },
    { id: 'b', status: 'TODO', position: 1 },
    { id: 'c', status: 'TODO', position: 2 },
    { id: 'x', status: 'IN_PROGRESS', position: 0 },
  ];

  it('anuncia el orden final de la columna tras un arrastre interno', async () => {
    const { prisma } = makePrisma(TABLERO);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    await service.move(USER, 'a', { status: 'TODO' as any, position: 2 });

    expect(events.emitTasksReordered).toHaveBeenCalledWith(
      USER,
      [{ status: 'TODO', taskIds: ['b', 'c', 'a'] }],
      undefined,
    );
  });

  it('anuncia las dos columnas cuando la tarjeta cambia de columna', async () => {
    const { prisma } = makePrisma(TABLERO);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    const result = await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

    // El mismo `columns` que devuelve el endpoint: una sola fuente de verdad.
    expect(events.emitTasksReordered).toHaveBeenCalledWith(USER, result.columns, undefined);
    expect(result.columns).toHaveLength(2);
  });

  it('emite primero la tarjeta y después el orden', async () => {
    const { prisma } = makePrisma(TABLERO);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

    // Al revés, un cliente aplicaría el orden con un id que aún no tiene en esa
    // columna.
    const orden = (events.emitTaskUpdated as jest.Mock).mock.invocationCallOrder[0];
    const reorden = (events.emitTasksReordered as jest.Mock).mock.invocationCallOrder[0];
    expect(orden).toBeLessThan(reorden);
  });

  it('no anuncia orden alguno si el arrastre se rechazó', async () => {
    const { prisma } = makePrisma(TABLERO);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    await expect(
      service.move('otro-usuario', 'a', { status: 'DONE' as any, position: 0 }),
    ).rejects.toThrow(NotFoundException);
    expect(events.emitTasksReordered).not.toHaveBeenCalled();
  });

  it('el resto de operaciones no reordena nada', async () => {
    const prisma: any = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a', userId: USER }),
        update: jest.fn().mockResolvedValue({ id: 'a', userId: USER }),
      },
    };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    await service.update(USER, 'a', { status: 'DONE' as any });

    expect(events.emitTasksReordered).not.toHaveBeenCalled();
  });
});

describe('TasksService — el socket que origina el cambio no recibe su eco', () => {
  const SOCKET = 'socket-del-que-arrastra';

  it('pasa el socket al arrastrar, en los dos eventos', async () => {
    const { prisma } = makePrisma([
      { id: 'a', status: 'TODO', position: 0 },
      { id: 'b', status: 'TODO', position: 1 },
    ]);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 }, SOCKET);

    expect(events.emitTaskUpdated).toHaveBeenCalledWith(expect.anything(), SOCKET);
    expect(events.emitTasksReordered).toHaveBeenCalledWith(USER, expect.anything(), SOCKET);
  });

  it('sin cabecera, el evento va a toda la sala', async () => {
    const { prisma } = makePrisma([{ id: 'a', status: 'TODO', position: 0 }]);
    const events = gateway();
    const service = new TasksService(prisma, events, tagsVacio());

    await service.move(USER, 'a', { status: 'DONE' as any, position: 0 });

    expect(events.emitTaskUpdated).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it('pasa el socket al crear', async () => {
    const tx: any = {
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'n', ...data })),
      },
    };
    const prisma: any = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    await service.create(USER, { title: 'x' }, SOCKET);

    expect(events.emitTaskCreated).toHaveBeenCalledWith(expect.anything(), SOCKET);
  });

  it('pasa el socket al borrar', async () => {
    const tx: any = {
      timeEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a', status: 'TODO', userId: USER }),
        delete: jest.fn().mockResolvedValue({ id: 'a' }),
      },
    };
    const prisma: any = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    await service.remove(USER, 'a', SOCKET);

    expect(events.emitTaskDeleted).toHaveBeenCalledWith(expect.anything(), SOCKET);
  });

  it('pasa el socket al editar', async () => {
    const prisma: any = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a', userId: USER }),
        update: jest.fn().mockResolvedValue({ id: 'a', userId: USER }),
      },
    };
    const events = gateway();
    const service = new TasksService(prisma as unknown as PrismaService, events, tagsVacio());

    await service.update(USER, 'a', { status: 'DONE' as any }, SOCKET);

    expect(events.emitTaskUpdated).toHaveBeenCalledWith(expect.anything(), SOCKET);
  });
});
