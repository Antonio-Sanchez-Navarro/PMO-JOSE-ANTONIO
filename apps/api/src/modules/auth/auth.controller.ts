import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import { UsersService } from "../users/users.service";
import { OAUTH_STATE_COOKIE, REFRESH_COOKIE } from "./auth.constants";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import type { CurrentUserContext } from "./auth.types";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly session: SessionService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    @InjectQueue("gmail-sync") private readonly gmailQueue: Queue,
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

  /** Callback de Google: valida `state`, intercambia el code y emite la sesión. */
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
    await this.session.issue(res, user);

    // Activa las notificaciones push de Gmail para este usuario. Va por la cola
    // (y no por una llamada directa) para no bloquear el redirect del login y
    // para poder reintentar si la API de Google falla; además, inyectar
    // GmailService aquí crearía una dependencia circular con GmailModule.
    try {
      await this.gmailQueue.add(
        "watch-inbox",
        { userId: user.id },
        {
          // Un solo `watch` pendiente por usuario, aunque inicie sesión varias veces.
          // Sin `:` — BullMQ lo rechaza en los jobId.
          jobId: `watch-inbox-${user.id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 10_000 },
          removeOnComplete: true,
        },
      );
    } catch (err) {
      // Si Redis no está disponible, el login debe completarse igual.
      this.logger.warn(`No se pudo encolar watch-inbox para ${user.id}: ${(err as Error).message}`);
    }

    return res.redirect(`${webUrl}/?login=success`);
  }

  /** Perfil del usuario de la sesión actual. */
  @UseGuards(AuthGuard)
  @Get("me")
  async getCurrentUser(@CurrentUser() current: CurrentUserContext) {
    const user = await this.users.findById(current.userId);
    if (!user) {
      // La sesión apunta a un usuario borrado: el frontend debe rehacer login.
      throw new UnauthorizedException("El usuario de la sesión ya no existe");
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hasGoogleTokens: Boolean(user.googleTokens),
    };
  }

  /** Renueva el token de acceso a partir de la cookie de refresco. */
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      this.session.clear(res);
      throw new UnauthorizedException("No hay token de refresco");
    }

    const payload = await this.session.verifyRefresh(token);
    await this.session.issue(res, { id: payload.sub, email: payload.email });
    return { refreshed: true };
  }

  /** Cierra la sesión borrando ambas cookies. */
  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    this.session.clear(res);
    return { ok: true };
  }
}
