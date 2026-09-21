/**
 * Cliente HTTP de la API.
 *
 * En desarrollo todo pasa por el proxy de Vite (`/api` → `http://localhost:3000`),
 * así que las cookies httpOnly de sesión viajan como same-origin.
 */

/**
 * Cliente HTTP de la API.
 *
 * Tanto en desarrollo (gracias al proxy de Vite) como en producción (gracias al rewrite
 * de Firebase Hosting), la API y el frontend comparten el mismo origen. 
 * Todas las llamadas se hacen a la ruta relativa `/api`, lo que simplifica CORS
 * y asegura que las cookies de sesión (httpOnly) funcionen correctamente.
 */

export const API_BASE = import.meta.env.VITE_API_URL || "/api";
export const HOST_BASE = API_BASE.replace(/\/api$/, "");

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

/**
 * Descarga un binario de la API (adjuntos) como `Blob`.
 *
 * **No vale un `<a href>` ni un `<a download>` a pelo.** La ruta va autenticada
 * por cookie y en producción la API vive en otro origen —Cloud Run, no Vercel—,
 * así que una navegación normal sale sin credenciales y la respuesta es un 401
 * que el navegador enseña como una pestaña en blanco. Aquí se pide con
 * `credentials: "include"`, como todo lo demás, y se entrega ya en memoria.
 *
 * Comparte el reintento con refresco de `apiFetch`: una sesión que caduca justo
 * al pulsar «descargar» se renueva sola en vez de mandar a nadie a iniciar
 * sesión otra vez.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  let response = await request(path);

  if (response.status === 401) {
    const ok = await doRefresh();
    if (ok) response = await request(path);
  }

  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} → ${response.status}`);
  }

  return response.blob();
}

/** URL de inicio del login con Google (navegación completa, no fetch). */
export const GOOGLE_LOGIN_URL = `${API_BASE}/auth/google`;
