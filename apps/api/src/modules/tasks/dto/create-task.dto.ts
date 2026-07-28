import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

/**
 * Cuerpo de `POST /tasks` — creación directa desde el tablero.
 *
 * Solo el título es obligatorio: el resto tiene un valor razonable por defecto
 * (`TODO`, `MEDIUM`) para que crear una tarjeta rápida sea un campo y ya.
 *
 * `source` **no** se acepta del cliente: toda tarea que entra por aquí es
 * `MANUAL` por definición, y ese valor es justo el que la protege de que el
 * reproceso de un correo la borre.
 */
export class CreateTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'El título es obligatorio.' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /**
   * Fecha ISO. Se normaliza la cadena vacía a "sin fecha" porque un formulario
   * con el campo en blanco manda `''`, y rechazarlo con un 400 parecería un
   * fallo del backend cuando el usuario simplemente no puso fecha.
   */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tagIds?: string[];
}
