import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const USER = 'user-1';

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
    const service = new TasksService(prisma);

    await expect(
      service.move('otro-usuario', 'a', { status: 'TODO' as any, position: 0 }),
    ).rejects.toThrow(NotFoundException);
  });

  describe('dentro de la misma columna', () => {
    it('mueve hacia abajo y renumera sin huecos', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma);

      await service.move(USER, 'a', { status: 'TODO' as any, position: 2 });

      expect(column('TODO')).toEqual(['b@0', 'c@1', 'a@2', 'd@3']);
    });

    it('mueve hacia arriba', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma);

      await service.move(USER, 'd', { status: 'TODO' as any, position: 0 });

      expect(column('TODO')).toEqual(['d@0', 'a@1', 'b@2', 'c@3']);
    });

    it('acota una posición fuera de rango al último hueco', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma);

      await service.move(USER, 'a', { status: 'TODO' as any, position: 999 });

      expect(column('TODO')).toEqual(['b@0', 'c@1', 'd@2', 'a@3']);
    });

    it('devuelve solo la columna afectada', async () => {
      const { prisma } = makePrisma(TODO);
      const service = new TasksService(prisma);

      const result = await service.move(USER, 'a', { status: 'TODO' as any, position: 1 });

      expect(result.columns).toHaveLength(1);
      expect(result.columns[0]).toEqual({ status: 'TODO', taskIds: ['b', 'a', 'c', 'd'] });
    });

    it('no escribe las tarjetas cuya posición no cambia', async () => {
      const { prisma, tx } = makePrisma(TODO);
      const service = new TasksService(prisma);

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
      const service = new TasksService(prisma);

      await service.move(USER, 'b', { status: 'IN_PROGRESS' as any, position: 1 });

      expect(column('IN_PROGRESS')).toEqual(['x@0', 'b@1', 'y@2']);
      expect(column('TODO')).toEqual(['a@0', 'c@1', 'd@2']);
    });

    it('cambia el status de la tarjeta movida', async () => {
      const { prisma, table } = makePrisma([...TODO, ...IN_PROGRESS]);
      const service = new TasksService(prisma);

      await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

      expect(table.find((t) => t.id === 'a')!.status).toBe('IN_PROGRESS');
    });

    it('devuelve las dos columnas afectadas, destino primero', async () => {
      const { prisma } = makePrisma([...TODO, ...IN_PROGRESS]);
      const service = new TasksService(prisma);

      const result = await service.move(USER, 'a', { status: 'IN_PROGRESS' as any, position: 0 });

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]).toEqual({ status: 'IN_PROGRESS', taskIds: ['a', 'x', 'y'] });
      expect(result.columns[1]).toEqual({ status: 'TODO', taskIds: ['b', 'c', 'd'] });
    });

    it('admite mover a una columna vacía', async () => {
      const { prisma, column } = makePrisma(TODO);
      const service = new TasksService(prisma);

      await service.move(USER, 'a', { status: 'DONE' as any, position: 0 });

      expect(column('DONE')).toEqual(['a@0']);
      expect(column('TODO')).toEqual(['b@0', 'c@1', 'd@2']);
    });
  });

  it('hace todo el trabajo dentro de una transacción', async () => {
    const { prisma } = makePrisma(TODO);
    const service = new TasksService(prisma);

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
    const service = new TasksService(prisma);

    await service.move(USER, 'r', { status: 'TODO' as any, position: 0 });

    // El desempate por createdAt mantiene p antes que q.
    expect(column('TODO')).toEqual(['r@0', 'p@1', 'q@2']);
  });
});
