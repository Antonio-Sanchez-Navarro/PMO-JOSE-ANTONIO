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
