import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query de `GET /time/entries`. Todos los filtros son opcionales. */
export class QueryTimeDto {
  @IsOptional()
  @IsString()
  taskId?: string;

  /** Desde (ISO). Se compara contra `startedAt`. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Hasta (ISO), exclusivo. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  /** Mismo tope que `GET /tasks` y `GET /emails`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

/** Cómo se agrupan las sumas de `GET /time/report`. */
export const REPORT_GROUPS = ['task', 'day', 'week'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

/** Query de `GET /time/report`. */
export class QueryReportDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /**
   * Por defecto `task`, que es la pregunta de la tarjeta ("cuánto llevo aquí").
   * `day` y `week` son las del dashboard. Un valor fuera de la lista da 400 en
   * vez de degradar en silencio a otro agrupamiento.
   */
  @IsOptional()
  @IsIn(REPORT_GROUPS)
  groupBy?: ReportGroup;
}
