import type { Request } from "express";

/** Usuario resuelto por `AuthGuard` a partir del JWT de sesión. */
export interface CurrentUserContext {
  userId: string;
  email: string;
}

/** Request de Express con el usuario ya autenticado. */
export interface AuthenticatedRequest extends Request {
  user: CurrentUserContext;
}
