import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo de `POST /time/entries`: un tramo que ya terminó y que se apunta a
 * mano, porque nadie se acordó de pulsar play.
 *
 * Nace cerrado a propósito —`endedAt` es obligatorio— así que no compite con el
 * timer en marcha ni ocupa el centinela de "activo".
 */
export class CreateEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  taskId!: string;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  endedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
