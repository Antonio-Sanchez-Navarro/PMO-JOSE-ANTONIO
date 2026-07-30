import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimeEntry } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ZONA_POR_DEFECTO, enHoraLocal } from '../../common/time-zone';
import { TasksGateway } from '../tasks/tasks.gateway';
import { StartTimeDto } from './dto/start-time.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { QueryReportDto, QueryTimeDto, ReportGroup } from './dto/query-time.dto';

/** Código de Prisma para violación de índice único. */
const UNIQUE_VIOLATION = 'P2002';

/** Un fichaje con la tarea a la que pertenece, que es como lo pinta la tarjeta. */
export type TimeEntryWithTask = TimeEntry & {
  task: { id: string; title: string };
};

/** Una fila del informe: la suma de un grupo. */
export interface ReportRow {
  /** Identificador del grupo: el id de la tarea, o la fecha del tramo. */
  key: string;
  /** Cómo se enseña: el título de la tarea, o la misma fecha. */
  label: string;
  seconds: number;
}

export interface TimeReport {
  groupBy: ReportGroup;
  from: string | null;
  to: string | null;
  /**
   * En qué zona se cortaron los días. Viaja siempre —también con
   * `groupBy=task`, donde no se usa— para que el cliente pueda decir de qué
   * huso son las fechas que está pintando sin tener que acordarse de lo que
   * pidió.
   */
  tz: string;
  /** Suma de todo lo agrupado, para no obligar al cliente a recorrer las filas. */
  totalSec: number;
  rows: ReportRow[];
}

const INCLUDE_TASK = { task: { select: { id: true, title: true } } } as const;

/**
 * Registro de tiempos (Sprint 5).
 *
 * Dos formas de apuntar trabajo: el cronómetro (`start`/`stop`) y el tramo
 * escrito a mano (`createEntry`), para cuando nadie se acordó de pulsar play.
 *
 * **Un solo cronómetro por persona.** La regla la arbitra la base con el índice
 * único sobre `activeFor` —que lleva el `userId` mientras el fichaje corre y
 * `null` cuando se cierra— y no una comprobación entre leer y escribir: dos
 * pestañas pulsando play a la vez pasarían las dos por un `findFirst` que no ve
 * nada y acabarían con dos cronómetros contando sobre la misma persona. Con el
 * índice, la segunda choca y recibe un 409.
 */
@Injectable()
export class TimeService {
  private readonly logger = new Logger(TimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TasksGateway,
  ) {}

  /**
   * El fichaje en marcha, o `null`.
   *
   * Lo pide la interfaz al montar: sin esto, recargar la página perdería de
   * vista un cronómetro que sigue corriendo en la base.
   */
  findActive(userId: string): Promise<TimeEntryWithTask | null> {
    return this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null },
      include: INCLUDE_TASK,
    });
  }

  /**
   * Arranca el cronómetro sobre una tarea.
   *
   * Si ya corría **sobre esa misma tarea**, devuelve el que había en vez de
   * abrir otro: el botón de play es idempotente y un doble clic no parte el
   * tramo en dos.
   *
   * Si corría sobre **otra**, la detiene y arranca esta en la misma
   * transacción, que es el "cambiar de tarea" de la interfaz. Va junto a
   * propósito: un fallo entre las dos escrituras dejaría el tiempo anterior
   * contando sobre una tarea que ya nadie mira.
   */
  async start(userId: string, taskId: string, dto: StartTimeDto, socketId?: string): Promise<TimeEntryWithTask> {
    // Filtrar por userId además de por id: sin esto se podría fichar sobre la
    // tarea de otra persona con solo conocer su id.
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException(`La tarea con ID ${taskId} no existe.`);
    }

    const activo = await this.findActive(userId);
    if (activo?.taskId === taskId) {
      return activo;
    }

    const ahora = new Date();

    let creado: TimeEntryWithTask;
    // Sin valor inicial a propósito: las dos ramas del `catch` lanzan, así que
    // aquí abajo solo se llega con la transacción cumplida y las dos asignadas.
    let detenido: TimeEntryWithTask | null;

    try {
      const resultado = await this.prisma.$transaction(async (tx) => {
        const stopped = activo ? await this.close(tx, activo.id, ahora) : null;

        const entry = await tx.timeEntry.create({
          data: {
            userId,
            taskId: task.id,
            startedAt: ahora,
            note: dto.note ?? null,
            // El centinela: mientras vale el `userId`, el índice único impide
            // que nazca otro fichaje abierto de la misma persona.
            activeFor: userId,
          },
          include: INCLUDE_TASK,
        });

        return { entry, stopped };
      });

      creado = resultado.entry;
      detenido = resultado.stopped;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        // Otra pestaña ganó la carrera entre la lectura de arriba y este
        // insert. No es un 500: el estado es justo el que la regla protege.
        throw new ConflictException(
          'Ya tienes un cronómetro en marcha. Deténlo antes de arrancar otro.',
        );
      }
      throw error;
    }

    if (detenido) {
      this.logger.log(`Cronómetro cambiado de tarea: ${detenido.durationSec}s en ${detenido.taskId}`);
      this.gateway.emitTimeStopped(detenido, socketId);
    }

    this.logger.log(`Cronómetro en marcha sobre la tarea ${task.id}`);
    this.gateway.emitTimeStarted(creado, socketId);

    return creado;
  }

  /**
   * Detiene el cronómetro.
   *
   * Con `taskId` detiene el de esa tarea; sin él, el que esté corriendo, que es
   * lo que necesita un botón global de "parar" que no sabe sobre qué tarjeta
   * está el reloj.
   *
   * Sin ninguno en marcha responde 409 y no 404: el fichaje no es que no
   * exista, es que el estado no admite la operación.
   */
  async stop(userId: string, taskId?: string, socketId?: string): Promise<TimeEntryWithTask> {
    const activo = await this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null, ...(taskId ? { taskId } : {}) },
    });

    if (!activo) {
      throw new ConflictException(
        taskId
          ? `No hay un cronómetro activo para la tarea ${taskId}.`
          : 'No tienes ningún cronómetro en marcha.',
      );
    }

    const entry = await this.close(this.prisma, activo.id, new Date());

    this.logger.log(`Cronómetro detenido en la tarea ${entry.taskId}: ${entry.durationSec}s`);
    this.gateway.emitTimeStopped(entry, socketId);

    return entry;
  }

  /**
   * Apunta a mano un tramo que ya terminó.
   *
   * Nace cerrado —con `endedAt` y `durationSec`— y sin tocar el centinela, así
   * que no interfiere con el cronómetro que pueda estar corriendo.
   */
  async createEntry(
    userId: string,
    dto: CreateEntryDto,
    socketId?: string,
  ): Promise<TimeEntryWithTask> {
    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, userId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException(`La tarea con ID ${dto.taskId} no existe.`);
    }

    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);
    this.assertRango(startedAt, endedAt);

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId,
        taskId: task.id,
        startedAt,
        endedAt,
        durationSec: segundos(startedAt, endedAt),
        note: dto.note ?? null,
      },
      include: INCLUDE_TASK,
    });

    this.logger.log(`Tramo manual de ${entry.durationSec}s en la tarea ${task.id}`);
    this.gateway.emitTimeStopped(entry, socketId);

    return entry;
  }

  /**
   * Corrige un fichaje.
   *
   * Poner `endedAt` sobre el que está corriendo lo cierra de verdad —libera el
   * centinela y calcula la duración—, que es el caso de "me olvidé de pararlo
   * ayer". `taskId` no se toca: mover un tramo de una tarea a otra falsearía el
   * informe de las dos.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateEntryDto,
    socketId?: string,
  ): Promise<TimeEntryWithTask> {
    if (dto.startedAt === undefined && dto.endedAt === undefined && dto.note === undefined) {
      throw new BadRequestException('El cuerpo no trae ningún campo que cambiar.');
    }

    const actual = await this.prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!actual) {
      throw new NotFoundException(`No existe el registro de tiempo ${id}`);
    }

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : actual.startedAt;
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : actual.endedAt;

    if (endedAt) {
      this.assertRango(startedAt, endedAt);
    }

    const entry = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        startedAt,
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(endedAt
          ? // La duración se recalcula siempre que el tramo esté cerrado: mover
            // cualquiera de los dos extremos la cambia. Y se suelta el
            // centinela, que solo lo ocupa un fichaje en marcha.
            { endedAt, durationSec: segundos(startedAt, endedAt), activeFor: null }
          : {}),
      },
      include: INCLUDE_TASK,
    });

    this.gateway.emitTimeStopped(entry, socketId);

    return entry;
  }

  /** Borra un fichaje. */
  async remove(userId: string, id: string, socketId?: string): Promise<void> {
    // `deleteMany` filtrando por userId: la comprobación de propiedad y el
    // borrado son la misma operación, sin hueco entre leer y escribir. Se lee
    // antes la tarea porque el evento la lleva para que la tarjeta sepa a qué
    // total restarle el tramo.
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, userId },
      select: { id: true, taskId: true },
    });

    if (!entry) {
      throw new NotFoundException(`No existe el registro de tiempo ${id}`);
    }

    await this.prisma.timeEntry.deleteMany({ where: { id, userId } });

    this.gateway.emitTimeDeleted({ ...entry, userId }, socketId);
  }

  /** Los fichajes del usuario, del más reciente al más antiguo. */
  findAll(userId: string, query: QueryTimeDto): Promise<TimeEntryWithTask[]> {
    const { skip = 0, take = 50, taskId, from, to } = query;

    return this.prisma.timeEntry.findMany({
      skip,
      take,
      where: {
        userId,
        ...(taskId ? { taskId } : {}),
        ...(from || to
          ? {
              startedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                // Exclusivo, para que dos rangos consecutivos no cuenten dos
                // veces el mismo tramo.
                ...(to ? { lt: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: INCLUDE_TASK,
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Suma de tiempo por tarea, por día o por semana.
   *
   * Solo entran los fichajes cerrados: el que está corriendo todavía no tiene
   * duración, y estimarla haría que dos lecturas seguidas del mismo informe
   * dieran números distintos.
   *
   * Los días y las semanas se cortan en **hora local** (`?tz=`, por defecto
   * `America/Mexico_City`), no en UTC. Hasta el 2026-07-30 se cortaban en UTC y
   * `GET /dashboard/metrics` ya lo hacía en local: las dos gráficas del tablero
   * repartían los minutos de última hora de la tarde en días distintos y no
   * había forma de saber cuál de las dos mentía. Encargo de Doc: que las dos
   * cuenten igual.
   *
   * Cambia el reparto entre días, **no el total**: `totalSec` sale de las
   * mismas filas y no se mueve. Con `groupBy=task` no cambia absolutamente
   * nada.
   */
  async report(userId: string, query: QueryReportDto): Promise<TimeReport> {
    const groupBy: ReportGroup = query.groupBy ?? 'task';
    const tz = query.tz ?? ZONA_POR_DEFECTO;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const rows =
      groupBy === 'task'
        ? await this.reportPorTarea(userId, from, to)
        : await this.reportPorFecha(userId, from, to, groupBy, tz);

    return {
      groupBy,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      tz,
      totalSec: rows.reduce((suma, fila) => suma + fila.seconds, 0),
      rows,
    };
  }

  private async reportPorTarea(
    userId: string,
    from: Date | null,
    to: Date | null,
  ): Promise<ReportRow[]> {
    const grupos = await this.prisma.timeEntry.groupBy({
      by: ['taskId'],
      where: {
        userId,
        durationSec: { not: null },
        ...(from || to
          ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      },
      _sum: { durationSec: true },
    });

    if (grupos.length === 0) return [];

    // Una sola consulta para todos los títulos, no una por grupo.
    const tareas = await this.prisma.task.findMany({
      where: { id: { in: grupos.map((g) => g.taskId) } },
      select: { id: true, title: true },
    });
    const titulos = new Map(tareas.map((t) => [t.id, t.title]));

    return grupos
      .map((grupo) => ({
        key: grupo.taskId,
        // Borrar una tarea borra antes sus fichajes, así que el respaldo es
        // solo por si alguna vez llega uno huérfano.
        label: titulos.get(grupo.taskId) ?? '(tarea desconocida)',
        seconds: grupo._sum.durationSec ?? 0,
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }

  private async reportPorFecha(
    userId: string,
    from: Date | null,
    to: Date | null,
    groupBy: 'day' | 'week',
    tz: string,
  ): Promise<ReportRow[]> {
    // El `groupBy` de Prisma no sabe truncar fechas, así que el agrupamiento
    // por día o semana va en SQL: hacerlo en memoria obligaría a traerse todos
    // los fichajes del rango para sumarlos aquí.
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`"userId" = ${userId}`,
      Prisma.sql`"durationSec" IS NOT NULL`,
    ];
    // El filtro del rango se queda en UTC a propósito: `from` y `to` llegan como
    // instantes ISO y un instante no depende del huso desde el que se mire. La
    // zona solo decide en qué cubo cae cada tramo, no cuáles entran.
    if (from) condiciones.push(Prisma.sql`"startedAt" >= ${from}`);
    if (to) condiciones.push(Prisma.sql`"startedAt" < ${to}`);

    // La fecha se formatea en SQL y vuelve como texto ya cortado en `tz`. Antes
    // volvía un `Date` que se pasaba por `toISOString()`, lo cual solo funciona
    // mientras el cubo esté en UTC: en cuanto se corta en local, ese viaje de
    // ida y vuelta corre la etiqueta un día.
    const filas = await this.prisma.$queryRaw<{ bucket: string; seconds: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc(${groupBy}, ${enHoraLocal('startedAt', tz)}), 'YYYY-MM-DD') AS bucket,
             SUM("durationSec")::int AS seconds
      FROM "TimeEntry"
      WHERE ${Prisma.join(condiciones, ' AND ')}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return filas.map((fila) => {
      // `YYYY-MM-DD`; en semanas es el lunes, que es donde corta `date_trunc`.
      const fecha = String(fila.bucket);
      return { key: fecha, label: fecha, seconds: Number(fila.seconds) };
    });
  }

  /**
   * Cierra un fichaje: marca el final, calcula la duración y suelta el
   * centinela para que se pueda arrancar otro.
   *
   * Recibe el cliente (`prisma` o el `tx` de una transacción) porque el cambio
   * de tarea cierra y abre dentro de la misma.
   */
  private async close(
    client: Prisma.TransactionClient | PrismaService,
    id: string,
    endedAt: Date,
  ): Promise<TimeEntryWithTask> {
    const actual = await client.timeEntry.findUniqueOrThrow({
      where: { id },
      select: { startedAt: true },
    });

    return client.timeEntry.update({
      where: { id },
      data: {
        endedAt,
        durationSec: segundos(actual.startedAt, endedAt),
        activeFor: null,
      },
      include: INCLUDE_TASK,
    });
  }

  /** Un tramo que acaba antes de empezar no es un tramo. */
  private assertRango(startedAt: Date, endedAt: Date): void {
    if (endedAt.getTime() <= startedAt.getTime()) {
      throw new BadRequestException('El final del tramo tiene que ser posterior al principio.');
    }
  }
}

/**
 * Segundos enteros entre dos marcas, nunca negativos.
 *
 * El suelo en 0 protege de un reloj que salta hacia atrás (un ajuste de NTP en
 * medio de un fichaje corto): un `durationSec` negativo restaría del informe.
 */
function segundos(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}
