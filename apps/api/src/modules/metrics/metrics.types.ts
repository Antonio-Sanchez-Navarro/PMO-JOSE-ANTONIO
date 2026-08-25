import { EmailStatus, TaskPriority, TaskStatus } from '@prisma/client';

export type { DashboardMetrics, ThroughputPoint, TimeSeriesPoint as TimePoint } from '@pmo/shared';

/**
 * La otra proyección: la que lee el copiloto.
 *
 * Mismo motor de cálculo, forma distinta y a propósito (aprobado por Doc el
 * 2026-07-29). En español y sin las series por día porque el modelo no recorre
 * una serie temporal, escribe una frase con ella: mandarle catorce puntos de
 * dos arrays son cientos de tokens por turno para que conteste "vas bien".
 */
export interface MetricsSummary {
  tareas: Record<TaskStatus, number>;
  tareasTotales: number;
  correosPendientes: number;
  horasRegistradasUltimos7Dias: number;
  tareasCerradasUltimos7Dias: number;
}
