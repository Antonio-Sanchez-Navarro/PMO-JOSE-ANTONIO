import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LlmProvider, LlmTier } from '../llm/llm.types';

/**
 * Lo que el usuario tenía delante al escribir, para que el copiloto no
 * pregunte por lo que ya está en pantalla.
 *
 * Son **ids, no contenido**: el cliente manda a qué se refiere y el backend lo
 * lee de la base comprobando que es del usuario. Si el cliente mandara el texto
 * de la tarea o del correo, cualquiera podría inyectar en el prompt un contexto
 * que no le pertenece.
 */
export class ChatContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  emailId?: string;
}

/**
 * Cuerpo de `POST /copilot/chat`.
 *
 * **El modelo se elige por (proveedor, nivel), nunca por id.** Un cuerpo que
 * aceptara `model: "claude-opus-5"` obligaría a desplegar el frontend cada vez
 * que sale un modelo nuevo, y dejaría que el cliente pidiera cualquier cadena.
 * `provider` y `tier` son un vocabulario cerrado que valida el enum: un valor
 * fuera de la lista da **400** y no llega a la fábrica.
 *
 * Los dos son **obligatorios** a propósito. Un valor por defecto en el backend
 * escondería en qué modelo se gastó el dinero, y una respuesta del copiloto se
 * lee distinto según quién la escribió: quien pregunta tiene que saberlo.
 */
export class StartChatDto {
  @IsEnum(LlmProvider)
  provider!: LlmProvider;

  @IsEnum(LlmTier)
  tier!: LlmTier;

  /** Lo que escribió la persona. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  message!: string;

  /**
   * Hilo al que pertenece el mensaje. Omitir para empezar uno nuevo.
   *
   * **Declarado pero todavía no honrado**: la persistencia de hilos es la
   * siguiente pieza del Sprint 6. Hoy cada llamada es un turno suelto; el campo
   * viaja ya en el contrato para que la interfaz no tenga que cambiar cuando
   * empiece a guardarse.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  threadId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
