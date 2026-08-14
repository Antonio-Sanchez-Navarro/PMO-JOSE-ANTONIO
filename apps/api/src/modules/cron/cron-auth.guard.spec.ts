import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CronAuthGuard } from './cron-auth.guard';
import type { GoogleOidcVerifier } from '../../common/security/google-oidc.verifier';

/**
 * La puerta de `/cron`.
 *
 * Estas rutas son **públicas** —Cloud Run las sirve sin autenticación de
 * plataforma— así que este guard es lo único que separa el barrido de vencidas
 * y la renovación del watch de cualquiera que conozca la URL. Lo que se prueba
 * aquí es que valida al emisor correcto y que **falla cerrado**.
 */
describe('CronAuthGuard', () => {
  const AUDIENCIA = 'https://pmo-api.example/cron';
  const CUENTA = 'pmo-scheduler@pmo.iam.gserviceaccount.com';

  function contextoCon(authorization?: string) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
    } as never;
  }

  function crear(
    variables: Record<string, string | undefined>,
    verificar = jest.fn().mockResolvedValue(CUENTA),
  ) {
    const config = { get: (clave: string) => variables[clave] } as unknown as ConfigService;
    const oidc = { verificar } as unknown as GoogleOidcVerifier;
    return { guard: new CronAuthGuard(config, oidc), verificar };
  }

  const ENTORNO_BUENO = {
    NODE_ENV: 'production',
    CRON_OIDC_AUDIENCE: AUDIENCIA,
    CRON_SERVICE_ACCOUNT: CUENTA,
  };

  it('deja pasar a Cloud Scheduler con un token válido', async () => {
    const { guard, verificar } = crear(ENTORNO_BUENO);

    await expect(guard.canActivate(contextoCon('Bearer bueno'))).resolves.toBe(true);
    expect(verificar).toHaveBeenCalledWith('Bearer bueno', {
      audience: AUDIENCIA,
      cuentaEsperada: CUENTA,
      etiqueta: 'Cloud Scheduler',
    });
  });

  it('valida contra la cuenta de Scheduler, NO contra la de Pub/Sub', async () => {
    const { guard, verificar } = crear(ENTORNO_BUENO);

    await guard.canActivate(contextoCon('Bearer bueno'));

    // Cada puerta valida a su emisor. Aceptar la cuenta de Pub/Sub aquí
    // convertiría el webhook de Gmail en un disparador del cron, y al revés.
    const { cuentaEsperada } = verificar.mock.calls[0][1];
    expect(cuentaEsperada).toBe(CUENTA);
  });

  it('rechaza cuando el verificador no acredita el token', async () => {
    const verificar = jest.fn().mockRejectedValue(new UnauthorizedException('token inválido'));
    const { guard } = crear(ENTORNO_BUENO, verificar);

    await expect(guard.canActivate(contextoCon('Bearer falso'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  describe('en producción no hay puerta trasera', () => {
    it('CRON_ALLOW_UNSIGNED se ignora con NODE_ENV=production', async () => {
      const verificar = jest.fn().mockRejectedValue(new UnauthorizedException('falta token'));
      const { guard } = crear(
        { ...ENTORNO_BUENO, CRON_ALLOW_UNSIGNED: 'true' },
        verificar,
      );

      // Sin cabecera y con la bandera puesta: en local pasaría, en producción
      // no. Una bandera de desarrollo que sobreviva al despliegue es una ruta
      // publica sin autenticar.
      await expect(guard.canActivate(contextoCon(undefined))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(verificar).toHaveBeenCalled();
    });

    it('en local sí deja pasar sin firma cuando se pide explícitamente', async () => {
      const { guard, verificar } = crear({
        NODE_ENV: 'development',
        CRON_ALLOW_UNSIGNED: 'true',
        CRON_OIDC_AUDIENCE: AUDIENCIA,
        CRON_SERVICE_ACCOUNT: CUENTA,
      });

      await expect(guard.canActivate(contextoCon(undefined))).resolves.toBe(true);
      expect(verificar).not.toHaveBeenCalled();
    });

    it('en local, con la bandera puesta pero CON cabecera, verifica igualmente', async () => {
      const { guard, verificar } = crear({
        NODE_ENV: 'development',
        CRON_ALLOW_UNSIGNED: 'true',
        CRON_OIDC_AUDIENCE: AUDIENCIA,
        CRON_SERVICE_ACCOUNT: CUENTA,
      });

      await guard.canActivate(contextoCon('Bearer algo'));

      // La bandera es para poder llamar a mano, no para desactivar el guard.
      expect(verificar).toHaveBeenCalled();
    });
  });

  it('falla cerrado si falta la configuración: el verificador decide y este guard no lo tapa', async () => {
    // La comprobación de configuración vive en GoogleOidcVerifier (y tiene sus
    // propias pruebas). Lo que se comprueba aquí es que el guard le pasa lo que
    // haya —incluido `undefined`— en vez de inventarse un valor por defecto.
    const verificar = jest.fn().mockRejectedValue(new UnauthorizedException('mal configurado'));
    const { guard } = crear(
      { NODE_ENV: 'production', CRON_OIDC_AUDIENCE: undefined, CRON_SERVICE_ACCOUNT: undefined },
      verificar,
    );

    await expect(guard.canActivate(contextoCon('Bearer bueno'))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verificar).toHaveBeenCalledWith('Bearer bueno', {
      audience: undefined,
      cuentaEsperada: undefined,
      etiqueta: 'Cloud Scheduler',
    });
  });
});
