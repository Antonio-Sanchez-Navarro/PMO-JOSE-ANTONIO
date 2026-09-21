import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskPriority, TaskSource, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { adjustPriority, esPrioridadManual, MOTIVO_PRIORIDAD_MANUAL } from '../ai/priority.rules';
import { completionStamp } from './completion';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TagsService } from '../tags/tags.service';
import { TasksGateway } from './tasks.gateway';
import { MoveTaskDto } from './dto/move-task.dto';
import { SELECT_TRIAGE, aTriageEmail } from '../emails/emails.service';

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

    // ─── Si la persona la eligió, la persona manda ────────────────────────
    //
    // Misma regla que en `update` y en el barrido: una prioridad **explícita**
    // no se escala ni se degrada, y queda marcada para que ningún proceso de
    // fondo la toque después.
    //
    // ⚠️ La diferencia está en **`dto.priority !== undefined`**, no en el valor.
    // Una tarea sin prioridad en el cuerpo nace `MEDIUM` por defecto, y eso no
    // es una decisión de nadie: es la ausencia de una. Comparar contra `MEDIUM`
    // en vez de contra `undefined` congelaría por accidente todas las tareas
    // creadas sin elegir, que son la mayoría, y el escalado por fecha dejaría
    // de existir en la práctica.
    const eligioLaPersona = dto.priority !== undefined;

    // `aiConfidence` es null: esta tarea no la propuso el modelo, así que no hay
    // confianza que ponderar. La fecha manda solo cuando nadie eligió.
    const decision = adjustPriority(
      { priority: dto.priority ?? TaskPriority.MEDIUM, dueDate, aiConfidence: null },
      now,
    );

    // El escalado no se aplica ni a lo que ya está cumplido ni a lo que eligió
    // una persona.
    const ajustada = decision.adjusted && status !== TaskStatus.DONE && !eligioLaPersona;
    const priority = ajustada ? decision.priority : (dto.priority ?? TaskPriority.MEDIUM);

    if (ajustada) {
      this.logger.log(`Prioridad al crear "${dto.title}": ${decision.reason}`);
    } else if (eligioLaPersona && decision.adjusted) {
      // Queda en el log que la fecha pedía más urgencia y no se aplicó: si
      // alguien se extraña de ver una tarea LOW venciendo mañana, aquí está el
      // porqué, y es que lo pidió así.
      this.logger.log(
        `Prioridad ${dto.priority} respetada al crear "${dto.title}" pese a la fecha: ${decision.reason}`,
      );
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
          // Una tarea puede nacer ya cumplida (apuntar algo que se hizo antes
          // de tener el tablero abierto), y entonces cuenta como cierre de hoy.
          ...completionStamp(null, status, now),
          // El motivo viaja con la tarea (deuda del Sprint 3): hasta ahora el
          // porqué solo quedaba en el log del proceso, donde la interfaz no
          // puede leerlo y donde se pierde al rotar.
          ...(ajustada
            ? {
                priorityReason: decision.reason,
                priorityAdjustedAt: now,
                priorityAdjustedFrom: dto.priority ?? TaskPriority.MEDIUM,
              }
            : {}),
          // Y si la eligió una persona, se marca **aquí y ahora**: el candado
          // tiene que existir desde que nace la fila, no desde la primera vez
          // que alguien la edite. Entre crear una tarea y editarla pueden pasar
          // días, y el barrido corre cada hora.
          ...(eligioLaPersona
            ? {
                priorityReason: MOTIVO_PRIORIDAD_MANUAL,
                priorityAdjustedAt: now,
                // `null`: no viene de ningún ajuste. No es que el sistema la
                // subiera desde algo, es que la puso una persona.
                priorityAdjustedFrom: null,
              }
            : {}),
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
        select: { id: true, status: true, userId: true, sourceEmailId: true },
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

    // Si la tarea provenía de un correo, hay que avisar a la bandeja de que el
    // conteo de tareas bajó (y si llega a 0, se desenlaza de la vista 'Convertido a Tareas')
    if (deleted.sourceEmailId) {
      const email = await this.prisma.email.findUnique({
        where: { id: deleted.sourceEmailId },
        select: SELECT_TRIAGE,
      });
      if (email) {
        // Enviar la actualización de correo para que la UI repinte el botón de generar tareas
        this.gateway.emitEmailUpdated(aTriageEmail(email), socketId);
      }
    }
  }

  async toggleSubtask(userId: string, taskId: string, subtaskId: string, isCompleted: boolean, socketId?: string) {
    const subtask = await this.prisma.subtask.updateMany({
      where: { id: subtaskId, taskId, task: { userId } },
      data: { isCompleted, completedAt: isCompleted ? new Date() : null },
    });

    if (subtask.count === 0) throw new NotFoundException(`Subtarea no encontrada`);

    // Fase 2: Al marcar Subtask como completado, cerrar el TimeEntry de la tarea padre.
    if (isCompleted) {
      const activo = await this.prisma.timeEntry.findFirst({
        where: { userId, taskId, endedAt: null },
      });

      if (activo) {
        const endedAt = new Date();
        const durationSec = Math.floor((endedAt.getTime() - activo.startedAt.getTime()) / 1000);
        const closed = await this.prisma.timeEntry.update({
          where: { id: activo.id },
          data: { endedAt, durationSec, activeFor: null },
        });
        this.gateway.emitTimeStopped(closed, socketId);
        this.logger.log(`Reloj detenido en tarea ${taskId} al completar subtarea ${subtaskId}`);
      }
    }

    const updatedTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { labels: true, subtasks: { orderBy: { order: 'asc' } }, obra: true },
    });

    if (updatedTask) {
      this.gateway.emitTaskUpdated(updatedTask, socketId);
    }
    
    return updatedTask;
  }

  async findAll(userId: string, params: QueryTasksDto) {
    // C-1: Quitado el `take = 50` por defecto para traer todas las tareas y que no difiera de las métricas.
    const { skip, take, status, priority, search, tagId, dueFrom, dueTo, obraId } = params;

    // Los ids repetidos en la query no son un error que merezca un 400: filtrar
    // dos veces por la misma etiqueta da el mismo resultado.
    const etiquetas = tagId?.length ? [...new Set(tagId.filter(Boolean))] : [];

    const where: Prisma.TaskWhereInput = {
      userId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(obraId && { obraId }),
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
          subtasks: { orderBy: { order: 'asc' } },
          obra: true,
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

      // ⚠️ **Sin `take`, y es obligatorio que sea así.** Esto lee la columna
      // entera para renumerar `position`: con un tope, las tarjetas que
      // quedaran fuera conservarían posiciones que ya se han reasignado, y el
      // tablero saldría con dos tarjetas en el mismo hueco o con huecos que no
      // se pueden ordenar. Lo acota una columna de un usuario, no un número.
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

      // Arrastrar una tarjeta a "Cumplidas" es la forma normal de cerrar algo,
      // así que es aquí donde se sella la fecha de cierre —y donde se limpia si
      // la tarjeta sale de esa columna.
      const cierre = completionStamp(from, to, new Date());

      const renumber = async (column: { id: string; position: number }[], status: TaskStatus) => {
        for (const [i, item] of column.entries()) {
          if (item.id === id) {
            // La tarjeta movida necesita escritura sí o sí: puede cambiar de columna.
            await tx.task.update({ where: { id }, data: { status, position: i, ...cierre } });
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

  /**
   * Qué prioridad queda —y qué rastro deja— cuando una persona edita a mano.
   *
   * **Regla de negocio: si la elige una persona, manda la persona.** Se guarda
   * con la marca de origen manual y **ningún proceso de fondo vuelve a
   * tocarla** — ni para subirla. Antes no había forma de saber quién había
   * puesto una prioridad, así que el barrido de vencidas reevaluaba todo por
   * igual y podía pisar en mitad de la noche lo que alguien había decidido a
   * mediodía.
   *
   * Tres caminos, y el que importa es el primero:
   *
   * 1. **La persona toca la prioridad** → se guarda tal cual, marcada. Sin
   *    escalado: subirle la urgencia a lo que acaba de elegir es exactamente
   *    lo que la regla prohíbe, y da igual que lo haga el barrido esta noche o
   *    esta misma llamada.
   * 2. **Solo cambia la fecha, y la prioridad ya era manual** → se respeta
   *    igual. El candado no se abre por mover una fecha.
   * 3. **Solo cambia la fecha y nadie la había fijado** → escala como en
   *    `create`: la fecha es un dato duro y no hay decisión humana que pisar.
   */
  private reevaluarPrioridad(
    task: {
      priority: TaskPriority;
      dueDate: Date | null;
      status: TaskStatus;
      aiConfidence: number | null;
      priorityReason: string | null;
    },
    dto: UpdateTaskDto,
    now: Date,
  ): Prisma.TaskUpdateInput {
    // 1 · Elección explícita de una persona: manda y queda marcada.
    if (dto.priority !== undefined) {
      this.logger.log(`Prioridad fijada a mano: ${task.priority} → ${dto.priority}`);
      return {
        priority: dto.priority,
        priorityReason: MOTIVO_PRIORIDAD_MANUAL,
        priorityAdjustedAt: now,
        // `null` porque no hubo ajuste del que venir: no es que el sistema la
        // subiera desde algo, es que la puso una persona.
        priorityAdjustedFrom: null,
      };
    }

    // 2 · Cambió la fecha, pero la prioridad ya la había fijado alguien.
    if (esPrioridadManual(task.priorityReason)) {
      return {};
    }

    // 3 · Nadie la había fijado: la fecha manda, como al crear.
    const dueDate = dto.dueDate !== undefined ? new Date(dto.dueDate) : task.dueDate;
    const status = dto.status ?? task.status;

    // Escalar lo que ya está cumplido no le sirve a nadie.
    if (status === TaskStatus.DONE) return {};

    const decision = adjustPriority(
      { priority: task.priority, dueDate, aiConfidence: task.aiConfidence },
      now,
    );

    if (!decision.adjusted) return {};

    this.logger.log(`Prioridad al cambiar la fecha: ${decision.reason}`);
    return {
      priority: decision.priority,
      priorityReason: decision.reason,
      priorityAdjustedAt: now,
      priorityAdjustedFrom: task.priority,
    };
  }

  async update(userId: string, id: string, updateTaskDto: UpdateTaskDto, socketId?: string) {
    const task = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException(`La tarea con ID ${id} no existe.`);

    const now = new Date();

    // ─── La prioridad manual pasa por la misma capa que al crear ─────────
    //
    // `create` escala por cercanía del vencimiento y `update` no lo hacía: la
    // misma tarea, con la misma fecha, salía con prioridades distintas según
    // si la fecha se puso al crearla o se cambió después. Se recalcula solo
    // cuando la persona toca **la prioridad o la fecha**; si no ha tocado
    // ninguna de las dos, no hay nada que reevaluar y el rastro anterior
    // -que quizá escribió el barrido de vencidas- se queda como está.
    const tocaPrioridad =
      updateTaskDto.priority !== undefined || updateTaskDto.dueDate !== undefined;

    const ajuste = tocaPrioridad
      ? this.reevaluarPrioridad(task, updateTaskDto, now)
      : {};

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...updateTaskDto,
        ...ajuste,
        // El modal de edición también puede cambiar el estado, no solo el
        // arrastre. `updateTaskDto.status` puede venir sin definir: entonces la
        // tarea se queda donde está y no hay cierre que sellar ni que limpiar.
        ...(updateTaskDto.status ? completionStamp(task.status, updateTaskDto.status, now) : {}),
      },
    });

    this.gateway.emitTaskUpdated(updated, socketId);

    return updated;
  }
}
