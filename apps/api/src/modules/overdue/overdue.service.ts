import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { adjustPriority, HIGH_WINDOW_HOURS } from '../ai/priority.rules';
import { TasksGateway } from '../tasks/tasks.gateway';

/**
 * Estados desde los que una tarea puede caer a `OVERDUE`.
 *
 * `DONE` queda fuera porque ya se cumplió (aunque fuera con retraso) y `OVERDUE`
 * porque ya está marcada: esto es lo que hace el movimiento idempotente sin
 * necesidad de una marca extra en la fila.
 */
const SWEEPABLE: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.POSTPONED];

/**
 * Estados cuya prioridad se reevalúa. Es `SWEEPABLE` más `OVERDUE`: una tarea
 * ya vencida sigue mereciendo que se le suba la prioridad —de hecho es el caso
 * más claro— aunque su columna ya no vaya a cambiar.
 */
const ADJUSTABLE: TaskStatus[] = [...SWEEPABLE, TaskStatus.OVERDUE];

const HOUR_MS = 3_600_000;

export interface OverdueSweepResult {
  /** Tareas dentro del horizonte de barrido. */
  candidates: number;
  /** Tareas movidas a la columna `OVERDUE`. */
  moved: number;
  /** Tareas a las que el paso del tiempo les subió la prioridad. */
  escalated: number;
  /** Usuarios con al menos una tarea en el horizonte. */
  users: number;
}

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TasksGateway,
  ) {}

  /**
   * Pasada de mantenimiento del tablero. Hace dos cosas sobre la misma lectura:
   *
   * 1. Mueve a "Atrasadas" toda tarea con `dueDate` pasado.
   * 2. Reevalúa la prioridad con `adjustPriority`, para que una tarea creada con
   *    vencimiento lejano suba sola conforme se acerca la fecha.
   *
   * Lo segundo es lo que hace que el tablero envejezca solo. Como la capa de
   * prioridad nunca baja nada, la operación es monótona: repetirla no oscila.
   * El precio es que una rebaja manual de prioridad sobre una tarea que vence
   * pronto se deshace en la siguiente pasada.
   *
   * El movimiento a `OVERDUE` es de ida: al pasar se pierde de qué columna
   * venía. Es deliberado —guardar el estado previo obligaría a una columna más
   * en `Task` para un caso que el tablero ya resuelve— así que si el usuario
   * aplaza la fecha, saca la tarjeta arrastrándola.
   *
   * @param now instante de referencia; inyectable para las pruebas.
   */
  async sweep(now: Date = new Date()): Promise<OverdueSweepResult> {
    // No hace falta mirar más allá de la ventana de escalado: fuera de ella
    // `adjustPriority` no cambiaría nada y la tarea aún no ha vencido.
    const horizon = new Date(now.getTime() + HIGH_WINDOW_HOURS * HOUR_MS);

    const candidates = await this.prisma.task.findMany({
      where: { status: { in: ADJUSTABLE }, dueDate: { lt: horizon } },
      select: { id: true, userId: true },
    });

    if (candidates.length === 0) {
      return { candidates: 0, moved: 0, escalated: 0, users: 0 };
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
    let escalated = 0;

    for (const [userId, ids] of byUser) {
      try {
        const result = await this.sweepUser(userId, ids, now, horizon);
        moved += result.moved;
        escalated += result.escalated;

        // Con la transacción ya cerrada: el tablero se entera de los cambios del
        // cron sin recargar. Una tarjeta por evento, que es lo que el frontend
        // sabe aplicar; a este ritmo (una pasada por hora) el volumen es
        // irrelevante.
        for (const task of result.updated) {
          this.gateway.emitTaskUpdated(task);
        }
      } catch (error) {
        this.logger.error(`Falló el barrido del usuario ${userId}`, error);
      }
    }

    this.logger.log(
      `Barrido: ${moved} tareas a OVERDUE y ${escalated} prioridades escaladas ` +
        `sobre ${candidates.length} candidatas (${byUser.size} usuarios)`,
    );

    return { candidates: candidates.length, moved, escalated, users: byUser.size };
  }

  /**
   * Resuelve las tareas de un usuario en una transacción.
   *
   * Las que pasan a `OVERDUE` se anexan al final de esa columna. Las columnas de
   * origen quedan con huecos en `position` (0, 2, 3…) y no se renumeran: el
   * orden que ve el tablero es el del `ORDER BY position`, que los huecos no
   * alteran, y `PATCH /tasks/:id/move` reconstruye los índices en cuanto alguien
   * arrastra una tarjeta.
   */
  private sweepUser(userId: string, ids: string[], now: Date, horizon: Date) {
    return this.prisma.$transaction(async (tx) => {
      // Relectura dentro de la transacción: entre el escaneo y este punto el
      // usuario ha podido cerrar la tarea o aplazarle la fecha desde el tablero.
      const tasks = await tx.task.findMany({
        where: { id: { in: ids }, userId, status: { in: ADJUSTABLE }, dueDate: { lt: horizon } },
        select: { id: true, title: true, status: true, priority: true, dueDate: true, aiConfidence: true },
        // Las más vencidas primero: es el orden en que se apilan en la columna.
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });

      if (tasks.length === 0) return { moved: 0, escalated: 0, updated: [] as Task[] };

      const vence = (task: (typeof tasks)[number]) =>
        task.dueDate !== null && task.dueDate < now && SWEEPABLE.includes(task.status);

      // La cola de la columna solo se consulta si alguien va a entrar en ella.
      let position = 0;
      if (tasks.some(vence)) {
        const last = await tx.task.findFirst({
          where: { userId, status: TaskStatus.OVERDUE },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        position = last ? last.position + 1 : 0;
      }

      let moved = 0;
      let escalated = 0;
      const updated: Task[] = [];

      // Secuencial, no `Promise.all`: Prisma desaconseja consultas concurrentes
      // sobre el cliente de una transacción interactiva (mismo criterio que
      // `TasksService.move`).
      for (const task of tasks) {
        const data: Prisma.TaskUpdateInput = {};

        const decision = adjustPriority(
          { priority: task.priority, dueDate: task.dueDate, aiConfidence: task.aiConfidence },
          now,
        );
        if (decision.adjusted) {
          data.priority = decision.priority;
          // El motivo se guarda con la tarjeta, no solo en el log: este barrido
          // sube prioridades solo, a una hora en la que nadie mira, y sin esto
          // la persona se encuentra una tarea en URGENT sin saber por qué.
          // Sobrescribe el ajuste anterior a propósito: la prioridad nunca baja,
          // así que el último motivo es el vigente.
          data.priorityReason = decision.reason;
          data.priorityAdjustedAt = now;
          data.priorityAdjustedFrom = task.priority;
          this.logger.debug(`Prioridad de "${task.title}": ${decision.reason}`);
        }

        if (vence(task)) {
          data.status = TaskStatus.OVERDUE;
          data.position = position++;
        }

        // Una tarea ya urgente y ya en su columna no genera escritura: es lo que
        // mantiene barato el barrido cuando no ha cambiado nada.
        if (Object.keys(data).length === 0) continue;

        updated.push(await tx.task.update({ where: { id: task.id }, data }));

        if (data.status) moved++;
        if (data.priority) escalated++;
      }

      return { moved, escalated, updated };
    });
  }
}
