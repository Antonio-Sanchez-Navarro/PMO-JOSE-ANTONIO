import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Tope de ids por petición.
 *
 * Es **el mismo 200 que el `?take=` de `GET /emails`**, y se elige así para que
 * el cliente no tenga que aprenderse dos números: lo que cabe en una página es
 * lo que cabe en un lote. Gravity ya trocea a 200 por su cuenta, así que los
 * 318 no accionables de producción salen en dos llamadas.
 *
 * El tope no es decoración: sin él, un `emailIds` de cien mil entradas se
 * convierte en un `IN (...)` que la base tiene que planificar entero, y en una
 * respuesta con cien mil `skipped` dentro.
 */
export const MAX_IDS_POR_LOTE = 200;

/**
 * Cuerpo de `POST /emails/bulk-dismiss` (Fase 7).
 *
 * La lista es **explícita y cerrada**: son los ids que la persona seleccionó en
 * pantalla. No hay forma de mandar un filtro («descarta todo lo no accionable»)
 * y es deliberado — un filtro que se evalúa en el servidor descarta también lo
 * que entró entre que se pintó la lista y se pulsó el botón, que es
 * exactamente lo que nadie miró.
 */
export class BulkDismissDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_IDS_POR_LOTE)
  @IsString({ each: true })
  emailIds!: string[];

  /**
   * Descarta también los correos que ya se habían despachado
   * (`IN_PROGRESS` o `COMPLETED`).
   *
   * **Sin `force`, el lote solo mueve lo que está en `PENDING`.** Un descarte
   * masivo nace de una selección hecha sobre una lista que pudo pintarse hace
   * diez minutos: si en ese rato alguien completó uno de esos correos, el lote
   * no tiene por qué borrarle el trabajo de un clic que iba dirigido a los
   * boletines. Esos ids vuelven en `skipped` con `NOT_PENDING`, a la vista, y
   * quien de verdad quiera arrastrarlos reenvía con `force: true`.
   *
   * Es la misma convención de «sé lo que hago» que ya tienen
   * `PATCH /emails/:id/status` y `POST /emails/:id/to-task`, y va en el cuerpo
   * por el mismo motivo: es parte de la decisión, no un filtro de lectura.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
