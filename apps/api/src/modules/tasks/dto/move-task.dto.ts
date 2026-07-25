import { IsEnum, IsInt, Min } from 'class-validator';
import { TaskStatus } from '@prisma/client';

/**
 * Cuerpo de `PATCH /tasks/:id/move`.
 *
 * Ambos campos son obligatorios: mover una tarjeta es siempre "a esta columna,
 * en este hueco". Un `PATCH /tasks/:id` normal no sirve para reordenar porque
 * cambiar el `position` de una tarea obliga a renumerar las demás de la
 * columna, y eso tiene que ocurrir en una transacción.
 */
export class MoveTaskDto {
  /** Columna de destino. */
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  /**
   * Índice de destino dentro de la columna, empezando en 0.
   *
   * Es la posición **después** de retirar la tarjeta de su sitio actual, que es
   * justo lo que dan las librerías de drag & drop. Si se pasa del final, se
   * acota al último hueco en vez de rechazar la petición: el frontend no tiene
   * por qué conocer el tamaño exacto de la columna.
   */
  @IsInt()
  @Min(0)
  position!: number;
}
