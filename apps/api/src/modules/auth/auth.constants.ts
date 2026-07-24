/**
 * Scopes de Google solicitados en el consentimiento OAuth.
 * Ver ARCHITECTURE.md §5. Mantener al mínimo necesario.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify", // leer/etiquetar correos
  "https://www.googleapis.com/auth/gmail.send", // enviar correos (copiloto)
];

/** Cookie httpOnly donde se guarda el `state` para validar el callback (anti-CSRF). */
export const OAUTH_STATE_COOKIE = "pmo_oauth_state";

/** Cookie httpOnly con el JWT de sesión (corta duración). */
export const SESSION_COOKIE = "pmo_session";

/** Cookie httpOnly con el JWT de refresco (larga duración). */
export const REFRESH_COOKIE = "pmo_refresh";

/** Vigencia del token de acceso: corta, se renueva con el refresh. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 min

/** Vigencia del token de refresco. */
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 días

/**
 * Claim `typ` que distingue ambos tokens: evita que un refresh sirva como
 * token de acceso (y viceversa) aunque compartan el mismo secreto.
 */
export const TOKEN_TYPE_ACCESS = "access";
export const TOKEN_TYPE_REFRESH = "refresh";
