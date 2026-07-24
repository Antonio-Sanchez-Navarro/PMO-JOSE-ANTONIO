import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  hasGoogleTokens: boolean;
}

export type SessionStatus = "loading" | "authenticated" | "anonymous";

/**
 * Estado de sesión de la app: consulta `/auth/me` al montar y expone `logout`.
 * La sesión vive en cookies httpOnly, así que no hay token que guardar aquí.
 */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      setUser(await apiFetch<SessionUser>("/auth/me"));
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  return { user, status, logout, refresh };
}
