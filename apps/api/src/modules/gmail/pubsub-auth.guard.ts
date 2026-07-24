import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';

/**
 * Valida que un push de Google Pub/Sub venga realmente de Google.
 *
 * Con autenticación OIDC activada en la suscripción, Google firma cada push y
 * envía `Authorization: Bearer <JWT>`. Verificamos la firma contra las claves
 * públicas de Google (las cachea `google-auth-library`), el `aud` esperado y
 * que la cuenta de servicio emisora sea la que configuramos.
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
  private readonly oauthClient = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const allowUnsigned =
      !isProduction && this.config.get<string>('GMAIL_PUBSUB_ALLOW_UNSIGNED') === 'true';

    if (!authorization?.startsWith('Bearer ')) {
      if (allowUnsigned) {
        this.logger.warn(
          'Push sin firma aceptado por GMAIL_PUBSUB_ALLOW_UNSIGNED=true (solo desarrollo)',
        );
        return true;
      }
      throw new UnauthorizedException('Falta el token OIDC de Pub/Sub');
    }

    const audience = this.config.get<string>('GMAIL_PUBSUB_AUDIENCE');
    if (!audience) {
      // Sin `aud` esperado no hay forma de validar a quién iba dirigido el token.
      this.logger.error('GMAIL_PUBSUB_AUDIENCE no está configurado: se rechaza el push');
      throw new UnauthorizedException('Webhook de Pub/Sub mal configurado');
    }

    const token = authorization.slice('Bearer '.length).trim();

    let payload;
    try {
      const ticket = await this.oauthClient.verifyIdToken({ idToken: token, audience });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Token OIDC de Pub/Sub inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Token OIDC de Pub/Sub inválido');
    }

    if (!payload?.email || payload.email_verified !== true) {
      throw new UnauthorizedException('El token OIDC no acredita una cuenta de servicio verificada');
    }

    const expectedAccount = this.config.get<string>('GMAIL_PUBSUB_SERVICE_ACCOUNT');
    if (expectedAccount && payload.email !== expectedAccount) {
      this.logger.warn(`Push firmado por una cuenta inesperada: ${payload.email}`);
      throw new UnauthorizedException('Cuenta de servicio no autorizada');
    }

    return true;
  }
}
