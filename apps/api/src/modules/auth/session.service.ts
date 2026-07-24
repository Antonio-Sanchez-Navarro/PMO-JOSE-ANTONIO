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
   * enviaría. `sameSite: lax` permite recibirla en el redirect del callback de Google.
   */
  private cookieOptions(maxAgeSec: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
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
    } catch {
      throw new UnauthorizedException("Sesión inválida o expirada");
    }
    if (payload.typ !== expectedType) {
      throw new UnauthorizedException("Tipo de token incorrecto");
    }
    return payload;
  }
}
