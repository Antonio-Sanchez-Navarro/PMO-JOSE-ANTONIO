import { Injectable, Logger } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Estados desde los que una tarea puede caer a `OVERDUE`.
 *
 * `DONE` queda fuera porque ya se cumplió (aunque fuera con retraso) y `OVERDUE`
 * porque ya está marcada: esto es lo que hace el barrido idempotente sin
 * necesidad de una marca extra en la fila.
 */
const SWEEPABLE: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.POSTPONED];

export interface OverdueSweepResult {
  /** Tareas vencidas encontradas en el escaneo inicial. */
  candidates: number;
  /** Tareas efectivamente movidas a `OVERDUE`. */
  moved: number;
  /** Usuarios con al menos una tarea vencida. */
  users: number;
}

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mueve a la columna "Atrasadas" toda tarea con `dueDate` pasado.
   *
   * El movimiento es de ida: al pasar a `OVERDUE` se pierde de qué columna
   * venía. Es deliberado —guardar el estado previo obligaría a una columna más
   * en `Task` para un caso que el tablero ya resuelve— así que si el usuario
   * aplaza la fecha, saca la tarjeta arrastrándola.
   *
   * @param now instante de referencia; inyectable para las pruebas.
   */
  async sweep(now: Date = new Date()): Promise<OverdueSweepResult> {
    const candidates = await this.prisma.task.findMany({
      where: { status: { in: SWEEPABLE }, dueDate: { lt: now } },
      select: { id: true, userId: true },
    });

    if (candidates.length === 0) {
      return { candidates: 0, moved: 0, users: 0 };
    }

    // Se agrupa por usuario porque las posiciones del Kanban son por columna y
    // por usuario: cada uno se resuelve en su propia transacción, y el fallo de
    // uno no deja a los demás sin barrer.
    const byUser = new Map<string, string[]>();
    for (const task of candidates) {
      const ids = byUser.get(task.userId);
      if (ids) ids.push(task.id);
      else byUser.set(task.userId, [task.id]);
    }

    let moved = 0;
    for (const [userId, ids] of byUser) {
      try {
        moved += await this.moveToOverdue(userId, ids, now);
      } catch (error) {
        this.logger.error(`Falló el barrido de vencidas del usuario ${userId}`, error);
      }
    }

    this.logger.log(
      `Barrido de vencidas: ${moved}/${candidates.length} tareas movidas a OVERDUE (${byUser.size} usuarios)`,
    );

    return { candidates: candidates.length, moved, users: byUser.size };
  }

  /**
   * Anexa las tareas al final de la columna "Atrasadas" del usuario.
   *
   * Las columnas de origen quedan con huecos en `position` (0, 2, 3…) y no se
   * renumeran: el orden que ve el tablero es el del `ORDER BY position`, que los
   * huecos no alteran, y `PATCH /tasks/:id/move` reconstruye los índices en
   * cuanto alguien arrastra una tarjeta. Renumerar aquí multiplicaría las
   * escrituras de un job que corre cada hora sin que se note en la UI.
   */
  private moveToOverdue(userId: string, ids: string[], now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Relectura dentro de la transacción: entre el escaneo y este punto el
      // usuario ha podido cerrar la tarea o aplazarle la fecha desde el tablero.
      const stillDue = await tx.task.findMany({
        where: { id: { in: ids }, userId, status: { in: SWEEPABLE }, dueDate: { lt: now } },
        select: { id: true },
        // Las más vencidas arriba de la columna.
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });

      if (stillDue.length === 0) return 0;

      const last = await tx.task.findFirst({
        where: { userId, status: TaskStatus.OVERDUE },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      let position = last ? last.position + 1 : 0;

      // Secuencial, no `Promise.all`: Prisma desaconseja consultas concurrentes
      // sobre el cliente de una transacción interactiva (mismo criterio que
      // `TasksService.move`).
      for (const task of stillDue) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.OVERDUE, position: position++ },
        });
      }

      return stillDue.length;
    });
  }
}
