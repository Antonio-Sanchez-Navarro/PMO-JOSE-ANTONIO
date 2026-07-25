import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TaskPriority } from '@prisma/client';

/**
 * Cuerpo de `POST /emails/:id/to-task`. Todos los campos son opcionales.
 *
 * Con `title` la conversión es 100% manual: no se llama al modelo (no hay coste
 * de API). Sin `title`, la IA analiza el correo y se fuerza la creación de
 * tarea aunque lo considere no accionable.
 */
export class ToTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /**
   * Permite convertir de nuevo un correo que ya tiene tareas. Sin esto la
   * respuesta es 409, para que un doble clic no genere duplicados.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
