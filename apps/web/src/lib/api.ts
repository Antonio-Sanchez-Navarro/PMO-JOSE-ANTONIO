/**
 * Cliente HTTP de la API.
 *
 * En desarrollo todo pasa por el proxy de Vite (`/api` → `http://localhost:3000`),
 * así que las cookies httpOnly de sesión viajan como same-origin.
 */

/**
 * La dirección de la API sale de `VITE_API_URL`, y de ningún otro sitio.
 *
 * Aquí vivía una constante con la URL de producción. El problema no era que
 * estuviera mal —servía—: era que **cambiarla exigía un commit y un
 * despliegue**. Y no es hipotético, lo cazó la auditoría 9926: este servicio
 * tiene dos direcciones (la opaca y la del número de proyecto) y el cliente de
 * OAuth tenía registrada la otra. Ese es exactamente el caso que una variable
 * resuelve en un minuto y una constante convierte en un despliegue.
 *
 * En desarrollo no hace falta ponerla: `/api` lo proxifica Vite al backend
 * local, y eso es además lo que mantiene las cookies de sesión como same-origin.
 */
const configuredApiUrl: string | undefined =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || undefined;

/**
 * Producción sin variable: no hay a dónde llamar.
 *
 * Se declara en vez de dejar que las peticiones salgan contra el propio
 * dominio, porque ese fallo se disfraza de 404 y manda a quien lo depura a
 * buscar una ruta que no existe, en vez de a la configuración que falta.
 */
export const API_URL_MISSING = Boolean(import.meta.env.PROD) && !configuredApiUrl;

export const API_BASE = configuredApiUrl ?? (import.meta.env.PROD ? "" : "/api");

if (API_URL_MISSING) {
  console.error(
    "[PMO] Falta VITE_API_URL: el frontend no sabe a qué API llamar. " +
      "Defínela en Vercel (Settings → Environment Variables) y vuelve a desplegar.",
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  if (API_URL_MISSING) {
    throw new ApiError(
      0,
      "La aplicación no tiene configurada la dirección de la API (falta VITE_API_URL).",
    );
  }
  return fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshed = await request("/auth/refresh", { method: "POST" });
        return refreshed.ok;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

/**
 * Hace la petición y, si el token de acceso expiró (401), intenta renovarlo
 * una sola vez con la cookie de refresco antes de reintentar.
 * Si múltiples peticiones reciben 401 simultáneamente, comparten un solo refresco.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await request(path, init);

  if (response.status === 401 && path !== "/auth/refresh") {
    const ok = await doRefresh();
    if (ok) {
      response = await request(path, init);
    }
  }

  if (!response.ok) {
    let errorMsg = `${init?.method ?? "GET"} ${path} → ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.message) {
        errorMsg = Array.isArray(errBody.message)
          ? errBody.message.join(", ")
          : String(errBody.message);
      }
    } catch {
      // Si no viene JSON, dejamos el mensaje por defecto
    }
    throw new ApiError(response.status, errorMsg);
  }

  // 204 y similares no traen cuerpo.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** URL de inicio del login con Google (navegación completa, no fetch). */
export const GOOGLE_LOGIN_URL = `${API_BASE}/auth/google`;
