import { GOOGLE_LOGIN_URL } from "../../lib/api";

/** Mensajes de error que el callback de la API puede devolver en la query. */
const LOGIN_ERRORS: Record<string, string> = {
  denied: "Cancelaste el permiso en Google. Vuelve a intentarlo para continuar.",
  missing_code: "Google no devolvió el código de autorización. Inténtalo de nuevo.",
  invalid_state: "La sesión de login expiró o no es válida. Inténtalo de nuevo.",
};

function readLoginError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const login = params.get("login");
  if (login === "denied") return LOGIN_ERRORS.denied;
  if (login === "error") return LOGIN_ERRORS[params.get("reason") ?? ""] ?? "No se pudo iniciar sesión.";
  return null;
}

export function LoginPage() {
  const error = readLoginError();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-800">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">

        <h1 className="mt-4 text-3xl font-bold tracking-tight">PMO Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Inicia sesión con la cuenta de Google cuyo Gmail quieres gestionar. Solo pedimos los
          permisos mínimos para leer y enviar correo.
        </p>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <a
          href={GOOGLE_LOGIN_URL}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <GoogleLogo />
          Continuar con Google
        </a>

        <p className="mt-6 text-xs text-slate-400">
          Tus tokens de Google se guardan cifrados (AES-256-GCM) y la sesión usa cookies httpOnly.
        </p>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.67a6.9 6.9 0 0 1 0-4.41V7.28H1.7a11.5 11.5 0 0 0 0 10.37l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.2 15.11 0 12 0 7.48 0 3.58 2.6 1.7 6.38l3.85 2.98C6.46 6.63 9 4.75 12 4.75Z"
      />
    </svg>
  );
}
