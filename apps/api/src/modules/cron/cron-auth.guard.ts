import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { GoogleOidcVerifier } from '../../common/security/google-oidc.verifier';

/**
 * Deja pasar solo a Cloud Scheduler.
 *
 * **No se reutiliza `PubSubAuthGuard` aunque el token tenga la misma forma.**
 * Los dos emisores son distintos: la suscripción push de Gmail firma con la
 * cuenta de servicio de Pub/Sub y los jobs de Scheduler con la suya, así que
 * ese guard devolvería 401 aquí —y, peor, si se relajara para aceptar ambas,
 * el webhook de Gmail quedaría autorizado a disparar el barrido de vencidas y
 * al revés. Cada puerta valida a su emisor.
 *
 * Configuración:
 *  - `CRON_OIDC_AUDIENCE`  → el `aud` con el que se crearon los jobs de Scheduler.
 *                            Suele ser la URL completa de la ruta.
 *  - `CRON_SERVICE_ACCOUNT`→ correo de la cuenta que firma los jobs.
 *  - `CRON_ALLOW_UNSIGNED` → solo para llamar a las rutas a mano en local.
 *                            **Se ignora cuando `NODE_ENV=production`.**
 */
@Injectable()
export class CronAuthGuard implements CanActivate {
  private readonly logger = new Logger(CronAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly oidc: GoogleOidcVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const enProduccion = this.config.get<string>('NODE_ENV') === 'production';
    const permitirSinFirma =
      !enProduccion && this.config.get<string>('CRON_ALLOW_UNSIGNED') === 'true';

    if (permitirSinFirma && !request.headers.authorization) {
      this.logger.warn(
        'Llamada a /cron sin firma aceptada por CRON_ALLOW_UNSIGNED=true (solo desarrollo)',
      );
      return true;
    }

    const cuenta = await this.oidc.verificar(request.headers.authorization, {
      audience: this.config.get<string>('CRON_OIDC_AUDIENCE'),
      cuentaEsperada: this.config.get<string>('CRON_SERVICE_ACCOUNT'),
      etiqueta: 'Cloud Scheduler',
    });

    this.logger.log(`Ejecución de cron autorizada para ${cuenta}`);
    return true;
  }
}
