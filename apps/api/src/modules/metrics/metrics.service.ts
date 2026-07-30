import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailStatus, Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ZONA_POR_DEFECTO, enHoraLocal } from '../../common/time-zone';
import { QueryMetricsDto } from './dto/query-metrics.dto';
import { DashboardMetrics, MetricsSummary, ThroughputPoint, TimePoint } from './metrics.types';

/** Cuántos días cubre la ventana cuando nadie pide otra cosa. */
export const VENTANA_DIAS = 7;

// La zona por defecto y el `AT TIME ZONE` doble viven en `common/time-zone`:
// `GET /time/report` corta los días con las mismas piezas, y dos copias de esta
// lógica volverían a repartir los mismos minutos en días distintos.
export { ZONA_POR_DEFECTO };

/**
 * Los números del tablero, la bandeja y el reloj (Sprint 8).
 *
 * **Un solo motor de cálculo con dos proyecciones** (arquitectura acordada con
 * Doc el 2026-07-29): `dashboard()` para la ruta REST que pinta las gráficas y
 * `summary()` para la herramienta `get_metrics` del copiloto. Antes el copiloto
 * tenía su propia cuenta dentro de `ToolRunnerService`; tener dos lugares que
 * cuentan lo mismo acaba con dos respuestas distintas a la misma pregunta.
 *
 * Todo filtra por `userId`. Nada de esto agrega entre personas.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** El JSON completo de `GET /dashboard/metrics`. */
  async dashboard(userId: string, query: QueryMetricsDto = {}): Promise<DashboardMetrics> {
    const tz = query.tz ?? ZONA_POR_DEFECTO;
    const hasta = query.to ? new Date(query.to) : new Date();
    const desdePedido = query.from ? new Date(query.from) : null;

    if (desdePedido && desdePedido >= hasta) {
      throw new BadRequestException('`from` tiene que ser anterior a `to`.');
    }

    const { desde, dias } = await this.resolverVentana(desdePedido, hasta, tz);

    const [porEstado, atrasadasPorPrioridad, correosPorEstado, cierres, fichajes] =
      await Promise.all([
        this.prisma.task.groupBy({ by: ['status'], where: { userId }, _count: true }),
        this.prisma.task.groupBy({
          by: ['priority'],
          where: { userId, status: TaskStatus.OVERDUE },
          _count: true,
        }),
        this.prisma.email.groupBy({ by: ['status'], where: { userId }, _count: true }),
        this.cierresPorDia(userId, desde, hasta, tz),
        this.fichajesPorDia(userId, desde, hasta, tz),
      ]);

    const tareas = this.completar(TaskStatus, porEstado, (g) => g.status);
    const atrasadas = this.completar(TaskPriority, atrasadasPorPrioridad, (g) => g.priority);
    const correos = this.completar(EmailStatus, correosPorEstado, (g) => g.status);

    // Las series se rellenan sobre la lista completa de días de la ventana: la
    // consulta solo devuelve los días con datos, y un hueco en el array haría
    // que la gráfica uniera el lunes con el jueves con una línea recta.
    const throughputPerDay: ThroughputPoint[] = dias.map((date) => ({
      date,
      count: cierres.get(date) ?? 0,
    }));
    const timePerDay: TimePoint[] = dias.map((date) => ({
      date,
      seconds: fichajes.get(date) ?? 0,
    }));

    const cerradas = throughputPerDay.reduce((suma, d) => suma + d.count, 0);

    return {
      generatedAt: new Date().toISOString(),
      window: { from: desde.toISOString(), to: hasta.toISOString(), days: dias.length, tz },
      tasks: {
        byStatus: tareas,
        total: Object.values(tareas).reduce((a, b) => a + b, 0),
      },
      // Solo IN_PROGRESS, estricto: ver la nota 1 del contrato en metrics.types.
      wip: tareas[TaskStatus.IN_PROGRESS],
      overdue: {
        count: tareas[TaskStatus.OVERDUE],
        byPriority: atrasadas,
      },
      throughput: {
        completedInWindow: cerradas,
        avgPerDay: redondear(cerradas / dias.length),
        perDay: throughputPerDay,
      },
      time: {
        totalSecInWindow: timePerDay.reduce((suma, d) => suma + d.seconds, 0),
        perDay: timePerDay,
      },
      inbox: {
        pending: correos[EmailStatus.PENDING],
        byStatus: correos,
      },
    };
  }

  /**
   * La versión compacta que lee el copiloto: los mismos números sin las series.
   *
   * Se apoya en `dashboard()` en vez de repetir consultas para que no puedan
   * divergir: si mañana cambia lo que cuenta como WIP, cambia en los dos sitios
   * a la vez o no cambia en ninguno.
   */
  async summary(userId: string): Promise<MetricsSummary> {
    const m = await this.dashboard(userId);

    return {
      tareas: m.tasks.byStatus,
      tareasTotales: m.tasks.total,
      correosPendientes: m.inbox.pending,
      // En horas y no en segundos: el modelo va a escribir esto en una frase.
      horasRegistradasUltimos7Dias: redondear(m.time.totalSecInWindow / 3600),
      tareasCerradasUltimos7Dias: m.throughput.completedInWindow,
    };
  }

  /**
   * Resuelve los límites de la ventana y la lista de días locales que cubre.
   *
   * Va en SQL y no en JavaScript porque el corte por zona horaria lo hace
   * Postgres con su propia base de husos: hacerlo aquí obligaría a reimplementar
   * `Intl` a mano y a acertar con los cambios de horario.
   */
  private async resolverVentana(
    desdePedido: Date | null,
    hasta: Date,
    tz: string,
  ): Promise<{ desde: Date; dias: string[] }> {
    const filas = await this.prisma.$queryRaw<{ desde: Date; dias: string[] }[]>(Prisma.sql`
      WITH limites AS (
        SELECT COALESCE(
          ${desdePedido}::timestamptz,
          -- Por defecto: el arranque del día local de hace VENTANA_DIAS-1 días,
          -- para que la serie sea una semana entera que acaba hoy.
          -- El cast a int no es decorativo: Prisma manda los números como bigint
          -- y make_interval no tiene sobrecarga para bigint (error 42883).
          (date_trunc('day', ${hasta}::timestamptz AT TIME ZONE ${tz})
            - make_interval(days => ${VENTANA_DIAS - 1}::int)) AT TIME ZONE ${tz}
        ) AS desde
      )
      SELECT limites.desde,
             array_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d) AS dias
      FROM limites,
           generate_series(
             date_trunc('day', limites.desde AT TIME ZONE ${tz}),
             date_trunc('day', ${hasta}::timestamptz AT TIME ZONE ${tz}),
             interval '1 day'
           ) AS d
      GROUP BY limites.desde
    `);

    // Sin filas significa que la serie salió vacía: `from` cae después de `to`
    // aunque los dos sean fechas válidas por separado.
    if (filas.length === 0) {
      throw new BadRequestException('La ventana no contiene ningún día: revisa `from` y `to`.');
    }

    return { desde: new Date(filas[0].desde), dias: filas[0].dias };
  }

  /**
   * Cierres por día local. Es el throughput.
   *
   * Cuenta `completedAt`, no "cuántas están en DONE": lo segundo es inventario y
   * no dice nada del ritmo. Reabrir una tarea limpia su `completedAt`
   * (`tasks/completion.ts`), así que un cierre deshecho desaparece de aquí en
   * vez de quedarse contado para siempre.
   *
   * Las tareas cerradas antes del 2026-07-29 no tienen fecha —la columna no se
   * escribía— así que no aparecen. Decisión de Doc: la gráfica arranca vacía y
   * mide de verdad desde ahora, en vez de rellenarse con `updatedAt`, que se
   * mueve con cualquier edición y fecharía hoy un cierre de hace tres semanas.
   */
  private async cierresPorDia(
    userId: string,
    desde: Date,
    hasta: Date,
    tz: string,
  ): Promise<Map<string, number>> {
    const filas = await this.prisma.$queryRaw<{ dia: string; total: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${enHoraLocal('completedAt', tz)}), 'YYYY-MM-DD') AS dia,
             COUNT(*)::int AS total
      FROM "Task"
      WHERE "userId" = ${userId}
        AND "completedAt" IS NOT NULL
        AND "completedAt" >= ${desde}
        AND "completedAt" < ${hasta}
      GROUP BY dia
    `);

    return new Map(filas.map((f) => [f.dia, Number(f.total)]));
  }

  /**
   * Segundos fichados por día local.
   *
   * Solo tramos cerrados, igual que `GET /time/report`: el que está corriendo no
   * tiene duración, y estimarla haría que dos lecturas seguidas dieran números
   * distintos. Se agrupa por `startedAt`, así que un tramo que cruza la
   * medianoche cuenta entero en el día en que empezó.
   */
  private async fichajesPorDia(
    userId: string,
    desde: Date,
    hasta: Date,
    tz: string,
  ): Promise<Map<string, number>> {
    const filas = await this.prisma.$queryRaw<{ dia: string; segundos: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${enHoraLocal('startedAt', tz)}), 'YYYY-MM-DD') AS dia,
             SUM("durationSec")::int AS segundos
      FROM "TimeEntry"
      WHERE "userId" = ${userId}
        AND "durationSec" IS NOT NULL
        AND "startedAt" >= ${desde}
        AND "startedAt" < ${hasta}
      GROUP BY dia
    `);

    return new Map(filas.map((f) => [f.dia, Number(f.segundos)]));
  }

  /**
   * Convierte el resultado de un `groupBy` en un objeto con **todas** las claves
   * del enum, poniendo cero en las que no salieron.
   *
   * Prisma solo devuelve los grupos que existen. Sin este relleno, un tablero
   * sin nada pospuesto no traería la clave `POSTPONED` y la leyenda de la
   * gráfica cambiaría de tamaño según el día.
   */
  private completar<E extends Record<string, string>, G>(
    enumerado: E,
    grupos: (G & { _count: number })[],
    clave: (grupo: G) => string,
  ): Record<E[keyof E], number> {
    return Object.fromEntries(
      Object.values(enumerado).map((valor) => [
        valor,
        grupos.find((g) => clave(g) === valor)?._count ?? 0,
      ]),
    ) as Record<E[keyof E], number>;
  }
}

/** Un decimal. Lo que se enseña en una gráfica o se dice en una frase. */
function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}
