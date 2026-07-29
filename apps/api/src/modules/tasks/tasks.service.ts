import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskPriority, TaskSource, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { adjustPriority } from '../ai/priority.rules';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TagsService } from '../tags/tags.service';
import { TasksGateway } from './tasks.gateway';
import { MoveTaskDto } from './dto/move-task.dto';

/**
 * Orden canónico de una columna del Kanban.
 *
 * `createdAt` desempata: mientras haya `position` repetidos (datos anteriores a
 * la renumeración) evita que la lista baile entre peticiones, porque sin
 * `ORDER BY` total Postgres no garantiza un orden estable.
 */
const COLUMN_ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

/** Columnas de las que el barrido horario saca una tarea vencida. */
const SWEEPABLE: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.POSTPONED];

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TasksGateway,
    private readonly tags: TagsService,
  ) {}

  /**
   * Crea una tarea desde el tablero y la deja al final de su columna.
   *
   * Al final y no al principio porque es lo que hace la UI optimista del
   * frontend (`[...prev, newTask]`): si el servidor la colocara arriba, la
   * tarjeta saltaría de sitio al confirmarse.
   *
   * Se aplican aquí las **mismas dos reglas que el barrido horario** —escalar la
   * prioridad por cercanía del vencimiento y mandar a "Atrasadas" lo ya
   * vencido— en vez de esperar a la siguiente pasada del cron. Si no, una tarea
   * creada con fecha pasada se quedaría hasta una hora en la columna equivocada
   * y luego se movería sola, que es más desconcertante que verla aparecer ya
   * donde le toca.
   */
  async create(userId: string, dto: CreateTaskDto, socketId?: string): Promise<Task> {
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const requested = dto.status ?? TaskStatus.TODO;
    const now = new Date();

    const vencida = dueDate !== null && dueDate < now && SWEEPABLE.includes(requested);
    const status = vencida ? TaskStatus.OVERDUE : requested;

    // `aiConfidence` es null: esta tarea no la propuso el modelo, así que no hay
    // confianza que ponderar. La fecha sigue mandando igual.
    const decision = adjustPriority(
      { priority: dto.priority ?? TaskPriority.MEDIUM, dueDate, aiConfidence: null },
      now,
    );
    // El escalado no se aplica a lo que ya está cumplido.
    const priority = status === TaskStatus.DONE ? (dto.priority ?? TaskPriority.MEDIUM) : decision.priority;

    if (decision.adjusted && status !== TaskStatus.DONE) {
      this.logger.log(`Prioridad al crear "${dto.title}": ${decision.reason}`);
    }

    // Antes de abrir la transacción: si alguna etiqueta no existe o es de otra
    // persona, esto lanza un 400 diciendo cuál. Sin la comprobación, un id
    // ajeno se colgaría de tu tarea sin protestar.
    const labels = await this.tags.resolveIds(userId, dto.tagIds);

    const task = await this.prisma.$transaction(async (tx) => {
      const last = await tx.task.findFirst({
        where: { userId, status },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      return tx.task.create({
        data: {
          userId,
          title: dto.title,
          description: dto.description,
          status,
          priority,
          dueDate,
          // Texto libre del modelo…
          tags: dto.tags ?? [],
          // …y etiquetas curadas por la persona, que son otra cosa.
          ...(labels.length > 0 ? { labels: { connect: labels } } : {}),
          position: last ? last.position + 1 : 0,
          source: TaskSource.MANUAL,
        },
        include: {
          labels: true,
        },
      });
    });

    // Fuera de la transacción: solo se anuncia lo que ya está confirmado en la
    // base de datos. Emitir dentro haría que un rollback dejara a los clientes
    // con una tarjeta que no existe.
    this.gateway.emitTaskCreated(task, socketId);

    return task;
  }

  /**
   * Borra una tarea del usuario.
   *
   * La lectura de propiedad va dentro de la transacción, así que no hay ventana
   * entre comprobar y borrar. Se lee además de qué columna era: el evento
   * `task.deleted` la lleva para que el tablero sepa dónde quitar la tarjeta sin
   * recorrer las cinco.
   *
   * La columna queda con un hueco en `position` y no se renumera, igual que tras
   * el barrido de vencidas: el orden no cambia y `PATCH /tasks/:id/move`
   * reconstruye los índices al primer arrastre.
   */
  async remove(userId: string, id: string, socketId?: string): Promise<void> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id, userId },
        select: { id: true, status: true, userId: true },
      });
      if (!task) throw new NotFoundException(`La tarea con ID ${id} no existe.`);

      // Los registros de tiempo apuntan a la tarea sin `onDelete: Cascade`, así
      // que borrarla con fichajes asociados reventaría por clave foránea. Hoy no
      // los crea nadie (Sprint 5), pero el borrado tiene que seguir funcionando
      // cuando existan.
      await tx.timeEntry.deleteMany({ where: { taskId: id, userId } });
      await tx.task.delete({ where: { id } });

      return task;
    });

    this.gateway.emitTaskDeleted(deleted, socketId);
  }

  async findAll(userId: string, params: QueryTasksDto) {
    const { skip = 0, take = 50, status, priority, search, tagId, dueFrom, dueTo } = params;

    // Los ids repetidos en la query no son un error que merezca un 400: filtrar
    // dos veces por la misma etiqueta da el mismo resultado.
    const etiquetas = tagId?.length ? [...new Set(tagId.filter(Boolean))] : [];

    const where: Prisma.TaskWhereInput = {
      userId,
      ...(status && { status }),
      ...(priority && { priority }),
      /**
       * Etiquetas del usuario (la relación `labels`, el modelo `Tag`), **no** el
       * arreglo de texto `tags` que extrae la IA.
       *
       * `some` y no `every`: marcar dos etiquetas en un filtro de facetas amplía
       * la vista. Y no hace falta comprobar de quién son —una etiqueta ajena
       * simplemente no casa con ninguna tarea de este `userId`—, así que un id
       * inventado devuelve lista vacía en vez de un 404 que delataría su
       * existencia.
       */
      ...(etiquetas.length ? { labels: { some: { id: { in: etiquetas } } } } : {}),
      /**
       * Rango de vencimiento: `dueFrom` incluye, `dueTo` excluye. Filtrar por
       * fecha deja fuera lo que no la tiene, porque `null` no cae en ningún
       * rango — y eso es lo correcto: "qué vence esta semana" no incluye lo que
       * no vence nunca.
       */
      ...(dueFrom || dueTo
        ? {
            dueDate: {
              ...(dueFrom ? { gte: new Date(dueFrom) } : {}),
              ...(dueTo ? { lt: new Date(dueTo) } : {}),
            },
          }
        : {}),
      // `mode: 'insensitive'` es el ILIKE de Postgres. Sin índice adicional:
      // con volúmenes de tablero (miles de filas) el escaneo secuencial es más
      // rápido que mantener un GIN, y `contains` con comodín por delante no
      // podría usar un índice B-tree de todas formas.
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        // Ya llegan como número: los convierte el DTO de la query.
        skip,
        take,
        where,
        // Prisma expects relation name 'sourceEmail' not 'email' based on schema
        include: {
          sourceEmail: {
            select: {
              subject: true,
              from: true
            }
          },
          labels: true,
          timeEntries: {
            select: { id: true, durationSec: true, startedAt: true, endedAt: true }
          },
        },
        // Sin `orderBy`, Postgres devolvía las filas en orden de heap: al
        // actualizar una tarea la lista podía reordenarse sola. `status` ordena
        // por el orden de declaración del enum, que es el de las columnas
        // (TODO, IN_PROGRESS, POSTPONED, DONE, OVERDUE).
        orderBy: [{ status: 'asc' }, ...COLUMN_ORDER],
      }),
      this.prisma.task.count({ where }),
    ]);

    const formattedData = data.map((task) => {
      let totalTimeSec = 0;
      let activeTimeEntryId: string | null = null;
      let activeTimeStartedAt: Date | null = null;

      for (const entry of task.timeEntries) {
        if (entry.durationSec) {
          totalTimeSec += entry.durationSec;
        }
        if (!entry.endedAt) {
          activeTimeEntryId = entry.id;
          activeTimeStartedAt = entry.startedAt;
        }
      }

      const { timeEntries, ...rest } = task;
      return {
        ...rest,
        totalTimeSec,
        activeTimeEntryId,
        activeTimeStartedAt,
      };
    });

    return { data: formattedData, total, skip, take };
  }

  /**
   * Mueve una tarea a una columna y a un hueco concreto, renumerando el resto.
   *
   * Por qué no vale `PATCH /tasks/:id` con `position`: cambiar la posición de
   * una tarjeta desplaza a todas las que van detrás. Si solo se escribiera la
   * tarjeta movida quedarían posiciones repetidas y el orden volvería a ser
   * arbitrario. Aquí se recalcula la columna entera dentro de una transacción,
   * así que o cuadra todo o no se escribe nada.
   *
   * Las escrituras van secuenciales, no en `Promise.all`: Prisma desaconseja
   * lanzar consultas concurrentes sobre el cliente de una transacción
   * interactiva. Con columnas de decenas de tarjetas el coste es irrelevante.
   */
  async move(userId: string, id: string, dto: MoveTaskDto, socketId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id, userId } });
      if (!task) throw new NotFoundException(`La tarea con ID ${id} no existe.`);

      const from = task.status;
      const to = dto.status;

      const columnOf = (status: TaskStatus) =>
        tx.task.findMany({
          where: { userId, status },
          orderBy: COLUMN_ORDER,
          select: { id: true, position: true },
        });

      // Origen sin la tarjeta que se mueve: es el estado tras "levantarla".
      const origin = (await columnOf(from)).filter((t) => t.id !== id);

      // Dentro de la misma columna, origen y destino son la misma lista: se
      // reordena sobre ella. Si no, se carga la columna de destino aparte.
      const target = from === to ? origin : await columnOf(to);

      // El frontend no tiene por qué saber cuántas tarjetas hay en destino: una
      // posición pasada de rosca se acota al último hueco. `splice` ya lo haría
      // solo; el `min` se queda porque hace explícito el contrato del endpoint.
      const index = Math.min(dto.position, target.length);
      target.splice(index, 0, { id, position: task.position });

      const renumber = async (column: { id: string; position: number }[], status: TaskStatus) => {
        for (const [i, item] of column.entries()) {
          if (item.id === id) {
            // La tarjeta movida necesita escritura sí o sí: puede cambiar de columna.
            await tx.task.update({ where: { id }, data: { status, position: i } });
          } else if (item.position !== i) {
            await tx.task.update({ where: { id: item.id }, data: { position: i } });
          }
        }
        return column.map((t) => t.id);
      };

      const targetIds = await renumber(target, to);
      // Si cambió de columna, la de origen también queda con un hueco que cerrar.
      const originIds = from === to ? targetIds : await renumber(origin, from);

      const moved = await tx.task.findUniqueOrThrow({ where: { id } });

      // Se devuelve el orden final de las columnas tocadas para que el tablero
      // se reconcilie sin pedir la lista entera otra vez.
      const columns =
        from === to
          ? [{ status: to, taskIds: targetIds }]
          : [
              { status: to, taskIds: targetIds },
              { status: from, taskIds: originIds },
            ];

      return { task: moved, columns };
    });

    // Con la transacción ya cerrada, y en este orden: primero la tarjeta con su
    // columna nueva, luego el orden final de las columnas tocadas. Al revés, un
    // cliente que aplicara el reordenamiento antes de conocer el cambio de
    // columna se encontraría un id que aún no tiene en esa lista.
    this.gateway.emitTaskUpdated(result.task, socketId);
    this.gateway.emitTasksReordered(userId, result.columns, socketId);

    return result;
  }

  async update(userId: string, id: string, updateTaskDto: UpdateTaskDto, socketId?: string) {
    const task = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException(`La tarea con ID ${id} no existe.`);

    const updated = await this.prisma.task.update({
      where: { id },
      data: updateTaskDto,
    });

    this.gateway.emitTaskUpdated(updated, socketId);

    return updated;
  }
}
