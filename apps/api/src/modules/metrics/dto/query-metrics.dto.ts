import { IsDateString, IsOptional } from 'class-validator';
import { EsZonaHorariaValida } from '../../../common/time-zone';

/** Query de `GET /dashboard/metrics`. Los tres parámetros son opcionales. */
export class QueryMetricsDto {
  /**
   * Inicio de la ventana (ISO), inclusivo. Por defecto, el arranque del día
   * local de hace seis días, para que la serie cubra una semana completa
   * terminando hoy.
   */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fin de la ventana (ISO), exclusivo. Por defecto, ahora. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /**
   * En qué zona se corta un "día". Por defecto `America/Mexico_City`, que es
   * donde trabaja quien usa esto: con UTC, todo lo hecho después de las 18:00
   * caería en la gráfica del día siguiente.
   */
  @IsOptional()
  @EsZonaHorariaValida()
  tz?: string;
}
