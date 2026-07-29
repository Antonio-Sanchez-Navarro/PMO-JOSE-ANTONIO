import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

/**
 * Cuerpo de `POST /copilot/tasks/create`.
 *
 * Es la tarea que la persona **ya revisó** en la tarjeta del chat, con las
 * correcciones que hiciera — no lo que propuso el modelo. Mismo patrón que el
 * correo: el copiloto propone, una persona confirma, y lo que se guarda es lo
 * que había en pantalla.
 *
 * La forma coincide con el `payload` del evento `tool_call`, así que la tarjeta
 * devuelve el objeto editado sin traducir nada.
 */
export class CreateTaskFromCopilotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  /**
   * Correo del que sale la tarea, si había uno abierto.
   *
   * Se comprueba que sea del usuario antes de enlazarlo: el id lo copia el
   * modelo del bloque de contexto, y un id ajeno colgaría la tarea del correo
   * de otra persona.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceEmailId?: string | null;
}
