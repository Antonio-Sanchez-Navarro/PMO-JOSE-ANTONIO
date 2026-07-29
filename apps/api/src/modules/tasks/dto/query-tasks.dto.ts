import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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

  /**
   * Etiqueta del usuario por la que filtrar (el modelo `Tag`, con su color).
   *
   * **No es `tags`**, el arreglo de texto libre que extrae el modelo de cada
   * correo. Son dos cosas distintas a propósito —las del modelo nacen y mueren
   * con cada análisis, estas las crea una persona y esperan seguir ahí mañana—
   * y el desplegable de la interfaz se llena de estas.
   *
   * Se admiten varias: `?tagId=a&tagId=b` devuelve las tareas que tengan **al
   * menos una** de ellas. Se eligió unión y no intersección porque es lo que
   * hace un filtro de facetas: marcar dos etiquetas amplía la vista, no la
   * vacía.
   */
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tagId?: string[];

  /**
   * Rango de vencimiento, en ISO. `dueFrom` incluye y `dueTo` **excluye**, para
   * que dos rangos consecutivos no cuenten dos veces la misma tarea — igual que
   * en `GET /time/report` y `GET /emails`.
   *
   * Las tareas **sin fecha** quedan fuera en cuanto se usa cualquiera de los
   * dos: preguntar "qué vence esta semana" no incluye lo que no vence nunca.
   */
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

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
