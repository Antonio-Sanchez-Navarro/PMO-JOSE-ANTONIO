import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo de `POST /time/:taskId/start`. Opcional entero: la tarea va en la
 * ruta y lo único que se puede añadir es una nota.
 *
 * No hay campo para "detener el anterior": arrancar sobre otra tarea ya lo
 * detiene, que es lo que hace el botón de play de la tarjeta.
 */
export class StartTimeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
