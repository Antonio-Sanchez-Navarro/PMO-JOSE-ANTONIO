import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

/** Lo que hay que saber para aceptar (o no) un token OIDC de Google. */
export interface CriteriosOidc {
  /** El `aud` que tiene que llevar el token. Sin esto no se valida nada. */
  audience?: string;
  /** Correo de la cuenta de servicio que debe haberlo firmado. */
  cuentaEsperada?: string;
  /** Nombre del emisor para los mensajes de log ("Pub/Sub", "Cloud Scheduler"). */
  etiqueta: string;
}

/**
 * Verifica los tokens OIDC con los que Google firma sus llamadas salientes.
 *
 * **Existe porque hay dos emisores distintos y no se pueden confundir.** Pub/Sub
 * empuja el webhook de Gmail y Cloud Scheduler llama a las rutas de `/cron`;
 * los dos mandan `Authorization: Bearer <JWT>` con la misma forma, pero **cada
 * uno firma con su propia cuenta de servicio**. Un guard que acepte la del otro
 * convierte a cualquiera de los dos caminos en disparador del contrario.
 *
 * La comprobación de la cuenta emisora es la que de verdad cierra la puerta: la
 * firma solo demuestra que el token lo emitió Google, y **Google emite tokens
 * para cualquiera que tenga un proyecto**. Sin `cuentaEsperada`, un tercero con
 * su propio Cloud Scheduler apuntando a esta URL pasaría la verificación de
 * firma sin problema.
 */
@Injectable()
export class GoogleOidcVerifier {
  private readonly logger = new Logger(GoogleOidcVerifier.name);

  /**
   * Una sola instancia: `google-auth-library` cachea aquí dentro las claves
   * públicas de Google. Crear un cliente por petición volvería a descargarlas
   * en cada llamada.
   */
  private readonly oauthClient = new OAuth2Client();

  /**
   * Devuelve el correo de la cuenta que firmó el token, o lanza 401.
   *
   * No devuelve un booleano a propósito: quien llama suele querer registrar
   * quién entró, y un `true` pelado obliga a volver a abrir el token para eso.
   */
  async verificar(cabecera: string | undefined, criterios: CriteriosOidc): Promise<string> {
    const { audience, cuentaEsperada, etiqueta } = criterios;

    if (!cabecera?.startsWith('Bearer ')) {
      throw new UnauthorizedException(`Falta el token OIDC de ${etiqueta}`);
    }

    if (!audience) {
      // Sin `aud` esperado no hay nada contra lo que validar el destinatario, y
      // aceptar «cualquier audiencia» es aceptar tokens emitidos para otro
      // servicio. Se rechaza: fallar cerrado es lo correcto en un guard.
      this.logger.error(`No hay audiencia configurada para ${etiqueta}: se rechaza la llamada`);
      throw new UnauthorizedException(`Webhook de ${etiqueta} mal configurado`);
    }

    const token = cabecera.slice('Bearer '.length).trim();

    let payload;
    try {
      const ticket = await this.oauthClient.verifyIdToken({ idToken: token, audience });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Token OIDC de ${etiqueta} inválido: ${(err as Error).message}`);
      throw new UnauthorizedException(`Token OIDC de ${etiqueta} inválido`);
    }

    if (!payload?.email || payload.email_verified !== true) {
      throw new UnauthorizedException('El token OIDC no acredita una cuenta de servicio verificada');
    }

    if (cuentaEsperada && payload.email !== cuentaEsperada) {
      this.logger.warn(
        `Llamada de ${etiqueta} firmada por una cuenta inesperada: ${payload.email} ` +
          `(se esperaba ${cuentaEsperada})`,
      );
      throw new UnauthorizedException('Cuenta de servicio no autorizada');
    }

    return payload.email;
  }
}
