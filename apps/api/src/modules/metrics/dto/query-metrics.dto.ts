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
   * En qué zona se corta un "día". Por defecto `America/Cancun` (UTC−5 fijo):
   * con UTC, todo lo hecho después de las 19:00 caería en la gráfica del día
   * siguiente. Ver `ZONA_POR_DEFECTO`, que cuenta por qué este valor decía
   * `America/Mexico_City` durante meses y qué desplazaba.
   */
  @IsOptional()
  @EsZonaHorariaValida()
  tz?: string;
}
