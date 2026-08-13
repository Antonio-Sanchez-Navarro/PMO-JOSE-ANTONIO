import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { GoogleOidcVerifier } from '../../common/security/google-oidc.verifier';

/**
 * Valida que un push de Google Pub/Sub venga realmente de Google.
 *
 * Con autenticación OIDC activada en la suscripción, Google firma cada push y
 * envía `Authorization: Bearer <JWT>`. La verificación —firma, `aud` y cuenta
 * de servicio emisora— vive en {@link GoogleOidcVerifier}, compartida con
 * `CronAuthGuard`; lo que cambia entre las dos puertas es **a quién** se espera
 * al otro lado, y eso es justo lo que no se puede compartir: Pub/Sub y Cloud
 * Scheduler firman con cuentas distintas.
 *
 * Sin esto, el endpoint es un disparador anónimo: cualquiera puede encolar
 * trabajo de sincronización para cualquier correo.
 *
 * Configuración (ver `.env.example` y `GCP_SETUP.md`):
 *  - `GMAIL_PUBSUB_AUDIENCE`        → el `aud` configurado en la suscripción.
 *  - `GMAIL_PUBSUB_SERVICE_ACCOUNT` → correo de la cuenta de servicio emisora.
 *  - `GMAIL_PUBSUB_ALLOW_UNSIGNED`  → solo para pruebas locales; se ignora en producción.
 */
@Injectable()
export class PubSubAuthGuard implements CanActivate {
  private readonly logger = new Logger(PubSubAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly oidc: GoogleOidcVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const allowUnsigned =
      !isProduction && this.config.get<string>('GMAIL_PUBSUB_ALLOW_UNSIGNED') === 'true';

    if (allowUnsigned && !request.headers.authorization?.startsWith('Bearer ')) {
      this.logger.warn(
        'Push sin firma aceptado por GMAIL_PUBSUB_ALLOW_UNSIGNED=true (solo desarrollo)',
      );
      return true;
    }

    await this.oidc.verificar(request.headers.authorization, {
      audience: this.config.get<string>('GMAIL_PUBSUB_AUDIENCE'),
      cuentaEsperada: this.config.get<string>('GMAIL_PUBSUB_SERVICE_ACCOUNT'),
      etiqueta: 'Pub/Sub',
    });

    return true;
  }
}
