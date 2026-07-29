import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { EmailStatus } from '@prisma/client';

/**
 * Cuerpo de `PATCH /emails/:id/status`.
 *
 * `status` es obligatorio: mover un correo de estado es una decisión explícita
 * de la persona, así que una petición sin él no significa "déjalo como está",
 * significa que el cliente se equivocó y debe dar 400.
 */
export class UpdateEmailStatusDto {
  @IsEnum(EmailStatus)
  status!: EmailStatus;

  /**
   * Anulación administrativa: devuelve el correo a `PENDING` aunque ya estuviera
   * despachado.
   *
   * Sin esto, reabrir un correo responde 409 (ver `EmailsService.updateStatus`).
   * Va en el cuerpo y no en la query por dos motivos: es parte de la decisión
   * que se está tomando, no un filtro de lectura, y es la misma forma que ya
   * tiene `POST /emails/:id/to-task` para insistir sobre un correo convertido —
   * una sola convención para "sé lo que hago" en toda la API.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
