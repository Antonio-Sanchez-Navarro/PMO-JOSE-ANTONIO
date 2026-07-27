import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

/**
 * Query de `GET /tasks`.
 *
 * Antes los filtros entraban como `string` y se colaban a Prisma con un `as
 * any`: `?status=BASURA` no daba 400 sino un 500 desde el driver. Aquí se
 * validan contra los enums, así que un valor inválido se rechaza en el borde.
 */
export class QueryTasksDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /**
   * Búsqueda libre sobre título y descripción, sin distinguir mayúsculas.
   *
   * Se recorta y la cadena vacía se descarta: `?search=` es el estado natural de
   * un cuadro de búsqueda recién vaciado y no debe filtrar nada.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  /** Tope de 200 para que un `?take=100000` no se lleve la tabla entera. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
