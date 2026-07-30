import { TaskStatus } from '@prisma/client';
import { completionStamp } from './completion';

const AHORA = new Date('2026-07-29T18:30:00.000Z');

describe('completionStamp', () => {
  it('sella la fecha al entrar en DONE', () => {
    expect(completionStamp(TaskStatus.IN_PROGRESS, TaskStatus.DONE, AHORA)).toEqual({
      completedAt: AHORA,
    });
  });

  it('sella la fecha si la tarea nace ya cumplida', () => {
    expect(completionStamp(null, TaskStatus.DONE, AHORA)).toEqual({ completedAt: AHORA });
  });

  it('limpia la fecha al reabrir una tarea', () => {
    // Sin esto, el throughput del día en que se cerró subiría para siempre por
    // un cierre que se deshizo.
    expect(completionStamp(TaskStatus.DONE, TaskStatus.TODO, AHORA)).toEqual({
      completedAt: null,
    });
  });

  it('no vuelve a sellar al reordenar dentro de DONE', () => {
    // Arrastrar la tarjeta no cambia cuándo se cerró.
    expect(completionStamp(TaskStatus.DONE, TaskStatus.DONE, AHORA)).toEqual({});
  });

  it('no toca nada en un cambio que no involucra DONE', () => {
    expect(completionStamp(TaskStatus.TODO, TaskStatus.IN_PROGRESS, AHORA)).toEqual({});
    expect(completionStamp(null, TaskStatus.OVERDUE, AHORA)).toEqual({});
  });
});
