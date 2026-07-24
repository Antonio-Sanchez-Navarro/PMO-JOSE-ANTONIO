import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE } from "./auth.constants";
import { SessionService } from "./session.service";
import type { AuthenticatedRequest } from "./auth.types";

/**
 * Protege rutas exigiendo una cookie de sesión válida y deja el usuario
 * en `req.user` para el decorador `@CurrentUser()`.
 *
 * Es intencionalmente *stateless*: no consulta la base de datos en cada
 * petición. El JWT ya trae `userId` y `email`; los handlers que necesiten el
 * registro completo pueden pedirlo con `UsersService.findById`.
 *
 * Uso: `@UseGuards(AuthGuard)` a nivel de controlador o de método.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly session: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE];

    if (!token) {
      throw new UnauthorizedException("No hay sesión activa");
    }

    const payload = await this.session.verifyAccess(token);
    (request as AuthenticatedRequest).user = {
      userId: payload.sub,
      email: payload.email,
    };
    return true;
  }
}
