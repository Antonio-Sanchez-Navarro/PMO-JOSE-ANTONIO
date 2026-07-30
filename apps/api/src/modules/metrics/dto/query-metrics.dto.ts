import { IsDateString, IsOptional, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

/**
 * Que la zona horaria exista de verdad.
 *
 * Sin esto, un `?tz=Marte/Olympus` llegaría a Postgres y saldría un 500 con un
 * error de base de datos en la respuesta. Con esto es un 400 que dice qué está
 * mal. La lista la pone el propio motor de `Intl`, así que no hay que
 * mantenerla a mano.
 */
@ValidatorConstraint({ name: 'esZonaHoraria', async: false })
export class EsZonaHoraria implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    try {
      // Lanza `RangeError` si la zona no la conoce el sistema.
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'tz debe ser una zona horaria IANA válida, por ejemplo America/Mexico_City';
  }
}

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
  @Validate(EsZonaHoraria)
  tz?: string;
}
