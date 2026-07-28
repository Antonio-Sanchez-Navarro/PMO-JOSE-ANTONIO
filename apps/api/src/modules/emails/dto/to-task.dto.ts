import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

/**
 * Vocabulario de categorías, el mismo que emite `AiService`. Se repite aquí
 * porque el DTO no puede importar del módulo de IA sin acoplar las dos capas, y
 * porque una categoría inventada por el cliente debe dar 400 y no colarse a la
 * columna.
 */
const CATEGORIES = [
  'PROJECT_MANAGEMENT',
  'INVOICING',
  'MEETING',
  'INFORMATIONAL',
  'OTHER',
] as const;

/**
 * Una tarea ya revisada por una persona en la cuarentena: puede venir editada,
 * o ser una de las que propuso el modelo tal cual.
 */
export class ConfirmedTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsEnum(TaskPriority)
  priority!: TaskPriority;

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

  /** `null` explícito para poder borrar la fecha que propuso el modelo. */
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

/**
 * Cuerpo de `POST /emails/:id/to-task`. Todos los campos son opcionales.
 *
 * Tres vías, en este orden de precedencia:
 *
 * 1. Con `tasks[]`: es la confirmación de la cuarentena. Se persiste
 *    exactamente lo que mandó la persona, sin volver a llamar al modelo.
 * 2. Con `title`: conversión 100% manual, tampoco cuesta tokens.
 * 3. Sin ninguno de los dos: la IA analiza el correo y se fuerza la creación de
 *    tarea aunque lo considere no accionable.
 */
export class ToTaskDto {
  /**
   * Las tareas que la persona aprobó en la cuarentena, después de revisar la
   * propuesta de `POST /emails/:id/classify`. Un arreglo vacío no vale: si no
   * quiere ninguna, no confirma.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConfirmedTaskDto)
  tasks?: ConfirmedTaskDto[];

  /** Categoría del correo, por si la persona corrigió la que dijo el modelo. */
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string;
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tagIds?: string[];

  /**
   * Permite convertir de nuevo un correo que ya tiene tareas. Sin esto la
   * respuesta es 409, para que un doble clic no genere duplicados.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
