import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo de `PATCH /time/entries/:id`. Todos los campos son opcionales, pero un
 * cuerpo vacío da 400: corregir un fichaje es una decisión explícita.
 *
 * `taskId` no se puede cambiar. Mover un tramo de una tarea a otra falsearía el
 * informe de las dos; para eso se borra y se apunta donde toca.
 */
export class UpdateEntryDto {
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
