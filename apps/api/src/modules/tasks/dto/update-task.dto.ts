import { IsEnum, IsOptional, IsDateString, IsString, MaxLength } from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

export class UpdateTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  /**
   * La prioridad elegida a mano.
   *
   * ⚠️ **Faltaba, y su ausencia no daba error.** `main.ts` monta el
   * `ValidationPipe` con `whitelist: true`, que **descarta en silencio** lo
   * que no está declarado aquí: el frontend podía mandar una subida a
   * `URGENT`, recibir un 200 y no cambiar nada. El peor fallo posible —el
   * que parece que funcionó— porque la tarjeta se pinta con lo que el
   * cliente ya tenía y solo se descubre al recargar.
   *
   * Una tarea nace con prioridad (`POST /tasks`) y no había forma de
   * cambiarla después: subir algo a urgente obligaba a borrarla y
   * escribirla otra vez.
   */
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}
