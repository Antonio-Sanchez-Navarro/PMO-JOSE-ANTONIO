import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { CookieOptions, Response } from "express";
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_COOKIE,
  REFRESH_TOKEN_TTL_SEC,
  SESSION_COOKIE,
  TOKEN_TYPE_ACCESS,
  TOKEN_TYPE_REFRESH,
} from "./auth.constants";

/** Contenido del JWT de sesión. */
export interface SessionPayload {
  /** `sub` = User.id */
  sub: string;
  email: string;
  typ: typeof TOKEN_TYPE_ACCESS | typeof TOKEN_TYPE_REFRESH;
  /** Instante de caducidad en segundos Unix. Lo pone el propio JWT. */
  exp?: number;
}

/**
 * Los dos motivos por los que se rechaza una sesión, y **son distintos para
 * quien los recibe**.
 *
 * - `SESION_CADUCADA` → la sesión era buena y se le pasó el plazo. Se arregla
 *   sola refrescando: el usuario no tiene que enterarse.
 * - `SESION_INVALIDA` → no hay sesión, o la que hay no sirve. Refrescar no
 *   arregla nada; toca volver a entrar.
 *
 * Hasta el 2026-08-21 esta diferencia **se perdía aquí dentro**: `verify`
 * envolvía cualquier fallo del JWT en un `catch` desnudo y el mensaje era el
 * mismo para los dos. Da igual lo que haga el cliente si el servidor ya se
 * comió el motivo.
 *
 * Los nombres son parte del contrato con el frontend y están en
 * `API_CONTRACTS.md`: **si se cambian aquí, se cambian allí**.
 */
export const CODIGO_SESION = {
  caducada: 'SESION_CADUCADA',
  invalida: 'SESION_INVALIDA',
} as const;

export type CodigoSesion = (typeof CODIGO_SESION)[keyof typeof CODIGO_SESION];

/**
 * Rechazo de sesión que **sí dice por qué**.
 *
 * Hereda de `UnauthorizedException` y **conserva los mensajes de siempre**, así
 * que las respuestas HTTP no cambian ni una coma: el `codigo` es información de
 * más para quien la sepa leer —hoy, el handshake del socket— y no viaja en el
 * cuerpo de la respuesta REST.
 */
export class SesionRechazadaError extends UnauthorizedException {
  constructor(
    readonly codigo: CodigoSesion,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Opciones comunes de las cookies de sesión.
   *
   * `path: "/"` es intencional: en desarrollo el frontend llega a la API por el
   * proxy de Vite (`/api/...`), así que una cookie limitada a `/auth` no se
   * enviaría.
   *
   * **`sameSite` cambia con el entorno, y no por gusto: en producción el
   * frontend y la API son sitios distintos.** La SPA vive en Vercel y la API en
   * Cloud Run, así que cada `fetch` del tablero es una petición *cross-site* y
   * el navegador **no adjunta** una cookie `Lax` — la descarta en silencio, sin
   * error de red ni aviso en consola. El síntoma es un 401 en todas las rutas
   * justo después de un login que pareció ir bien.
   *
   * `None` obliga a `secure`: el navegador **rechaza** un `SameSite=None` sin
   * `Secure`, así que las dos van juntas o no van. Cloud Run sirve por HTTPS,
   * de modo que en producción se cumple sola.
   *
   * En desarrollo se queda en `lax`, que es lo correcto **y** lo único que
   * funciona: el frontend llega por el proxy de Vite —mismo origen, no hace
   * falta `None`— y `secure` sobre `http://localhost` dejaría la cookie sin
   * guardar en la mitad de los navegadores.
   *
   * ⚠️ Esto depende de que el navegador acepte cookies de terceros. Con el
   * bloqueo de terceros activado, `SameSite=None` tampoco viaja. La solución
   * de fondo no es una bandera sino un **dominio propio** que ponga API y
   * frontend en el mismo sitio (`api.ejemplo.com` y `app.ejemplo.com`), y
   * entonces esto vuelve a `lax`.
   */
  private cookieOptions(maxAgeSec: number): CookieOptions {
    const enProduccion = this.config.get("NODE_ENV") === "production";

    return {
      httpOnly: true,
      sameSite: enProduccion ? "none" : "lax",
      secure: enProduccion,
      path: "/",
      maxAge: maxAgeSec * 1000,
    };
  }

  /** Firma el par de tokens y los deja en cookies httpOnly. */
  async issue(res: Response, user: { id: string; email: string }): Promise<void> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, email: user.email, typ: TOKEN_TYPE_ACCESS },
        { expiresIn: ACCESS_TOKEN_TTL_SEC },
      ),
      this.jwt.signAsync(
        { sub: user.id, email: user.email, typ: TOKEN_TYPE_REFRESH },
        { expiresIn: REFRESH_TOKEN_TTL_SEC },
      ),
    ]);

    res.cookie(SESSION_COOKIE, accessToken, this.cookieOptions(ACCESS_TOKEN_TTL_SEC));
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_TOKEN_TTL_SEC));
  }

  /** Borra ambas cookies (logout). */
  clear(res: Response): void {
    const { maxAge: _ignored, ...options } = this.cookieOptions(0);
    res.clearCookie(SESSION_COOKIE, options);
    res.clearCookie(REFRESH_COOKIE, options);
  }

  /** Verifica un token de acceso. Lanza 401 si es inválido, expiró o no es del tipo correcto. */
  verifyAccess(token: string): Promise<SessionPayload> {
    return this.verify(token, TOKEN_TYPE_ACCESS);
  }

  /** Verifica un token de refresco. */
  verifyRefresh(token: string): Promise<SessionPayload> {
    return this.verify(token, TOKEN_TYPE_REFRESH);
  }

  private async verify(token: string, expectedType: string): Promise<SessionPayload> {
    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch (error) {
      // `jsonwebtoken` distingue caducado de inválido con el nombre del error, y
      // ese dato se estaba tirando a la basura. Es la única señal que separa
      // «refresca y sigue» de «vuelve a entrar».
      const caducado = (error as { name?: string })?.name === "TokenExpiredError";
      throw new SesionRechazadaError(
        caducado ? CODIGO_SESION.caducada : CODIGO_SESION.invalida,
        "Sesión inválida o expirada",
      );
    }
    if (payload.typ !== expectedType) {
      // Un token de refresco usado como de acceso no está caducado: está mal
      // usado. Refrescar no lo arregla.
      throw new SesionRechazadaError(CODIGO_SESION.invalida, "Tipo de token incorrecto");
    }
    return payload;
  }
}
