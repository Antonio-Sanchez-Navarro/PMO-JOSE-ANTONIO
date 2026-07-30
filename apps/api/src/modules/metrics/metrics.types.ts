import { EmailStatus, TaskPriority, TaskStatus } from '@prisma/client';

/** Cuántas tareas se cerraron ese día. */
export interface ThroughputPoint {
  /** `YYYY-MM-DD` en la zona horaria de la ventana. */
  date: string;
  count: number;
}

/** Cuánto tiempo se fichó ese día. */
export interface TimePoint {
  date: string;
  seconds: number;
}

/**
 * Lo que devuelve `GET /dashboard/metrics`.
 *
 * Contrato acordado con Doc el 2026-07-29. Las cuatro decisiones que lo
 * caracterizan, porque no son evidentes leyendo la forma:
 *
 * 1. `wip` es **solo** `IN_PROGRESS`. Las atrasadas no suman: WIP responde "en
 *    qué estoy trabajando", y meterlas lo convertiría en "cuánto debo", que es
 *    otra pregunta y está al lado.
 * 2. Las series vienen como **array ordenado** y no como objeto indexado por
 *    fecha, y traen **todos** los días de la ventana, incluidos los de cero. Un
 *    objeto obligaría al cliente a ordenar claves, y los huecos se dibujarían
 *    como saltos en la gráfica.
 * 3. `byStatus` y `byPriority` traen **siempre todas** las claves del enum, con
 *    cero donde no hay nada, para que la leyenda no cambie de tamaño.
 * 4. Los días se cortan en la **zona horaria de la ventana**, no en UTC: cerrar
 *    una tarea a las 19:00 en México cuenta para ese día, no para el siguiente.
 */
export interface DashboardMetrics {
  /** Cuándo se calculó. La respuesta no se cachea, pero el cliente sí puede. */
  generatedAt: string;
  window: {
    /** Inicio (ISO), inclusivo. */
    from: string;
    /** Fin (ISO), exclusivo. */
    to: string;
    /** Cuántos días locales cubre. Es también el largo de las series. */
    days: number;
    tz: string;
  };
  tasks: {
    byStatus: Record<TaskStatus, number>;
    total: number;
  };
  /** Trabajo en curso: tareas en `IN_PROGRESS`. */
  wip: number;
  overdue: {
    count: number;
    byPriority: Record<TaskPriority, number>;
  };
  throughput: {
    /** Cierres dentro de la ventana. */
    completedInWindow: number;
    /** Media por día de la ventana, con un decimal. */
    avgPerDay: number;
    perDay: ThroughputPoint[];
  };
  time: {
    totalSecInWindow: number;
    perDay: TimePoint[];
  };
  inbox: {
    /** Atajo de `byStatus.PENDING`: es el número que se enseña en el badge. */
    pending: number;
    byStatus: Record<EmailStatus, number>;
  };
}

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
