import { Module } from '@nestjs/common';
import { GoogleOidcVerifier } from './google-oidc.verifier';

/**
 * Piezas de seguridad que comparten varios módulos.
 *
 * De momento solo el verificador de tokens OIDC, que usan el webhook de Gmail
 * (Pub/Sub) y las rutas de `/cron` (Cloud Scheduler). Va en un módulo propio
 * para que la instancia —y con ella la caché de claves públicas de Google— sea
 * una sola en toda la aplicación.
 */
@Module({
  providers: [GoogleOidcVerifier],
  exports: [GoogleOidcVerifier],
})
export class SecurityModule {}
