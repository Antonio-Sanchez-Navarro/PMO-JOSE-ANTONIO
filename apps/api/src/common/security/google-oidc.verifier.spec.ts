import { UnauthorizedException } from '@nestjs/common';
import { GoogleOidcVerifier } from './google-oidc.verifier';

/**
 * La puerta por la que entran Cloud Scheduler y Pub/Sub.
 *
 * Estas pruebas existen por un **fail-open descubierto el 2026-08-13**: la
 * cuenta de servicio emisora solo se comprobaba «si estaba configurada», así
 * que una variable de entorno vacía abría la puerta **en silencio** — la firma
 * seguía validando y los logs decían que todo iba bien.
 *
 * Y eso no es un detalle de configuración: la firma acredita que el token lo
 * emitió Google, **no que la llamada sea nuestra**. Google emite tokens OIDC a
 * cualquiera con un proyecto, y estas rutas son públicas, así que un tercero
 * puede apuntar su propio Scheduler y firmar con su cuenta. Lo único que lo
 * distingue de nosotros es ese correo.
 *
 * De ahí que la prueba que más importa aquí sea la del caso 3: con un token
 * **perfectamente válido**, si falta la cuenta esperada, hay que rechazar.
 */
describe('GoogleOidcVerifier', () => {
  /** Lo que devolvería Google para un token bueno de Cloud Scheduler. */
  const PAYLOAD_BUENO = {
    email: 'pmo-scheduler@pmo-dashboard-503418.iam.gserviceaccount.com',
    email_verified: true,
  };

  const CRITERIOS = {
    audience: 'https://pmo-api.example/cron',
    cuentaEsperada: PAYLOAD_BUENO.email,
    etiqueta: 'Cloud Scheduler',
  };

  /**
   * Un verificador con el cliente de Google sustituido.
   *
   * Se reemplaza el campo privado en vez de simular el módulo entero: lo que
   * hay que probar es la lógica de decisión de esta clase, no que
   * `google-auth-library` sepa validar una firma.
   */
  function crear(verifyIdToken: jest.Mock) {
    const verifier = new GoogleOidcVerifier();
    (verifier as unknown as { oauthClient: unknown }).oauthClient = { verifyIdToken };
    return verifier;
  }

  /** Un cliente que valida cualquier token y devuelve el payload que se le diga. */
  const clienteQueAcepta = (payload: unknown = PAYLOAD_BUENO) =>
    jest.fn().mockResolvedValue({ getPayload: () => payload });

  describe('1 · token ausente o inválido', () => {
    it('sin cabecera Authorization no entra nadie', async () => {
      const verifyIdToken = clienteQueAcepta();

      await expect(crear(verifyIdToken).verificar(undefined, CRITERIOS)).rejects.toThrow(
        UnauthorizedException,
      );
      // No se llega a verificar nada: falta el token, no hay qué comprobar.
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('una cabecera que no es Bearer se rechaza', async () => {
      const verifyIdToken = clienteQueAcepta();

      await expect(
        crear(verifyIdToken).verificar('Basic dXN1YXJpbzpjbGF2ZQ==', CRITERIOS),
      ).rejects.toThrow(UnauthorizedException);
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('un token que Google no valida se rechaza, y el motivo no se filtra al cliente', async () => {
      const verifyIdToken = jest.fn().mockRejectedValue(new Error('Invalid token signature'));

      await expect(crear(verifyIdToken).verificar('Bearer falso', CRITERIOS)).rejects.toThrow(
        // El mensaje interno de la librería se queda en el log: al otro lado
        // solo se dice que el token no vale.
        'Token OIDC de Cloud Scheduler inválido',
      );
    });

    it('un token válido de una cuenta ajena se rechaza', async () => {
      const verifyIdToken = clienteQueAcepta({
        email: 'atacante@otro-proyecto.iam.gserviceaccount.com',
        email_verified: true,
      });

      await expect(crear(verifyIdToken).verificar('Bearer bueno', CRITERIOS)).rejects.toThrow(
        'Cuenta de servicio no autorizada',
      );
    });

    it('un token sin correo verificado se rechaza', async () => {
      const verifyIdToken = clienteQueAcepta({ email: CRITERIOS.cuentaEsperada, email_verified: false });

      await expect(crear(verifyIdToken).verificar('Bearer bueno', CRITERIOS)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('2 · configuración incompleta — falla cerrado', () => {
    /**
     * **La regresión del fail-open.** El token es impecable: firma buena,
     * audiencia correcta y la cuenta que de verdad usa Scheduler. Lo único que
     * falta es la variable de entorno — y eso basta para rechazar.
     *
     * Antes del 2026-08-13 este caso devolvía el correo tan campante.
     */
    it.each([
      ['sin definir', undefined],
      ['vacía', ''],
    ])('con la cuenta de servicio %s rechaza aunque el token sea válido', async (_, cuenta) => {
      const verifyIdToken = clienteQueAcepta();
      const verifier = crear(verifyIdToken);

      await expect(
        verifier.verificar('Bearer perfectamente-valido', {
          ...CRITERIOS,
          cuentaEsperada: cuenta,
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Y ni siquiera se molesta en verificar la firma: se corta antes, porque
      // ninguna firma podría compensar el dato que falta.
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('sin audiencia configurada también rechaza, y sin verificar nada', async () => {
      const verifyIdToken = clienteQueAcepta();
      const verifier = crear(verifyIdToken);

      await expect(
        verifier.verificar('Bearer perfectamente-valido', {
          ...CRITERIOS,
          audience: undefined,
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(verifyIdToken).not.toHaveBeenCalled();
    });
  });

  describe('3 · el camino bueno', () => {
    it('devuelve el correo cuando la firma, la audiencia y la cuenta cuadran', async () => {
      const verifyIdToken = clienteQueAcepta();

      await expect(crear(verifyIdToken).verificar('Bearer bueno', CRITERIOS)).resolves.toBe(
        CRITERIOS.cuentaEsperada,
      );
    });

    it('exige la audiencia esperada al validar, no cualquiera', async () => {
      const verifyIdToken = clienteQueAcepta();

      await crear(verifyIdToken).verificar('Bearer bueno', CRITERIOS);

      expect(verifyIdToken).toHaveBeenCalledWith({
        idToken: 'bueno',
        audience: CRITERIOS.audience,
      });
    });

    it('los dos emisores se validan por separado: la cuenta de Pub/Sub no abre /cron', async () => {
      // Mismo verificador, criterios distintos. Es lo que impide que el webhook
      // de Gmail pueda disparar el barrido de vencidas, y al revés.
      const verifyIdToken = clienteQueAcepta({
        email: 'pmo-pubsub-push@pmo-dashboard-503418.iam.gserviceaccount.com',
        email_verified: true,
      });

      await expect(crear(verifyIdToken).verificar('Bearer bueno', CRITERIOS)).rejects.toThrow(
        'Cuenta de servicio no autorizada',
      );

      await expect(
        crear(verifyIdToken).verificar('Bearer bueno', {
          audience: 'https://pmo-api.example/webhooks/gmail',
          cuentaEsperada: 'pmo-pubsub-push@pmo-dashboard-503418.iam.gserviceaccount.com',
          etiqueta: 'Pub/Sub',
        }),
      ).resolves.toBe('pmo-pubsub-push@pmo-dashboard-503418.iam.gserviceaccount.com');
    });
  });
});
