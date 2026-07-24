import { Controller, Get, Logger, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { OAUTH_STATE_COOKIE } from "./auth.constants";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Inicia el login: genera `state` anti-CSRF y redirige al consentimiento de Google. */
  @Get("google")
  googleLogin(@Res() res: Response) {
    const state = randomBytes(16).toString("hex");
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
      maxAge: 10 * 60 * 1000, // 10 min
    });
    return res.redirect(this.authService.getAuthorizationUrl(state));
  }

  /** Callback de Google: valida `state`, intercambia el code y (próximamente) emite sesión. */
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:5173";

    if (error) {
      this.logger.warn(`Consentimiento denegado: ${error}`);
      return res.redirect(`${webUrl}/?login=denied`);
    }
    if (!code) {
      return res.redirect(`${webUrl}/?login=error&reason=missing_code`);
    }

    // Validación anti-CSRF: el state del query debe coincidir con la cookie.
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    if (!state || !cookieState || state !== cookieState) {
      this.logger.warn("Validación de state fallida (posible CSRF)");
      return res.redirect(`${webUrl}/?login=error&reason=invalid_state`);
    }
    res.clearCookie(OAUTH_STATE_COOKIE);

    const user = await this.authService.handleCallback(code);

    // TODO(sesión JWT): emitir cookie de sesión httpOnly con el userId persistido.
    //   Por ahora redirigimos al frontend indicando éxito.
    return res.redirect(
      `${webUrl}/?login=success&email=${encodeURIComponent(user.email)}`,
    );
  }
}
