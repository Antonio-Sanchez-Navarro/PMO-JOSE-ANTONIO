import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Color por defecto cuando el cliente no manda ninguno: un gris neutro que se
 * lee bien sobre claro y sobre oscuro. Mejor eso que un color aleatorio, que
 * haría que dos etiquetas creadas seguidas parecieran de familias distintas.
 */
export const DEFAULT_TAG_COLOR = '#64748B';

/** Cuerpo de `POST /tags`. */
export class CreateTagDto {
  /**
   * Se recorta antes de validar: " KYC " y "KYC" son la misma etiqueta para
   * cualquiera que las lea, y sin esto la clave única no las vería iguales.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  /**
   * Hexadecimal `#RRGGBB`. Se valida aquí y no en la base porque es una regla
   * de presentación: lo que protege es que el frontend no reciba un color que
   * no pueda pintar.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^#[0-9A-F]{6}$/, {
    message: 'color debe ser hexadecimal en formato #RRGGBB',
  })
  color?: string;
}
