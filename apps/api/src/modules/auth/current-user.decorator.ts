import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, CurrentUserContext } from "./auth.types";

/**
 * Inyecta el usuario autenticado en un handler protegido por `AuthGuard`.
 *
 * ```ts
 * @UseGuards(AuthGuard)
 * @Get("tasks")
 * list(@CurrentUser() user: CurrentUserContext) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
