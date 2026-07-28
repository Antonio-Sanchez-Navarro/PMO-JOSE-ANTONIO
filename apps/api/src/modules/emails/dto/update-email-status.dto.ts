import { IsEnum } from 'class-validator';
import { EmailStatus } from '@prisma/client';

/**
 * Cuerpo de `PATCH /emails/:id/status`.
 *
 * Un solo campo y obligatorio: mover un correo de estado es una decisión
 * explícita de la persona, así que una petición sin `status` no significa
 * "déjalo como está", significa que el cliente se equivocó y debe dar 400.
 */
export class UpdateEmailStatusDto {
  @IsEnum(EmailStatus)
  status!: EmailStatus;
}
