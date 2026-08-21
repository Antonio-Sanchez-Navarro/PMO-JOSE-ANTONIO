/**
 * Cliente HTTP de la API.
 *
 * En desarrollo todo pasa por el proxy de Vite (`/api` → `http://localhost:3000`),
 * así que las cookies httpOnly de sesión viajan como same-origin.
 */

export const PROD_API_URL = "https://pmo-api-mlpuuasqka-uc.a.run.app";

export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API_URL : "/api");

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
    throw new ApiError(response.status, `${init?.method ?? "GET"} ${path} → ${response.status}`);
  }

  // 204 y similares no traen cuerpo.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** URL de inicio del login con Google (navegación completa, no fetch). */
export const GOOGLE_LOGIN_URL = `${API_BASE}/auth/google`;
