import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { visibleLabels } from "./format";
import type { EmailSnippet, EmailThread } from "./types";

export type InboxStatus = "loading" | "ready" | "error";

/** Etiqueta presente en los resultados, con cuántos correos la llevan. */
export interface LabelFacet {
  id: string;
  name: string;
  count: number;
}

/** Agrupa los mensajes por `threadId`, ordenando hilos y mensajes por fecha descendente. */
function groupByThread(emails: EmailSnippet[]): EmailThread[] {
  const byThread = new Map<string, EmailSnippet[]>();
  for (const email of emails) {
    const group = byThread.get(email.threadId);
    if (group) group.push(email);
    else byThread.set(email.threadId, [email]);
  }

  const timeOf = (email: EmailSnippet) => {
    const parsed = new Date(email.date).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return [...byThread.entries()]
    .map(([threadId, messages]) => {
      const sorted = [...messages].sort((a, b) => timeOf(b) - timeOf(a));
      return { threadId, messages: sorted, latest: sorted[0] };
    })
    .sort((a, b) => timeOf(b.latest) - timeOf(a.latest));
}

/**
 * Carga la bandeja de entrada desde `GET /gmail/inbox`.
 *
 * La sesión viaja en cookies httpOnly: `apiFetch` ya usa `credentials: "include"`
 * y renueva el token una vez si la API responde 401.
 */
export function useInbox(initialMaxResults = 20) {
  const [emails, setEmails] = useState<EmailSnippet[]>([]);
  const [status, setStatus] = useState<InboxStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [maxResults, setMaxResults] = useState(initialMaxResults);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

  const load = useCallback(async (limit: number, { silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setStatus("loading");
    setError(null);

    try {
      const data = await apiFetch<EmailSnippet[]>(`/gmail/inbox?maxResults=${limit}`);
      setEmails(data);
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("401")
          ? "Tu sesión con Google expiró. Vuelve a iniciar sesión."
          : "No se pudo cargar la bandeja de entrada.",
      );
      setStatus("error");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(maxResults, { silent: emails.length > 0 });
    // `emails.length` solo decide si el refresco es silencioso; no debe re-disparar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, maxResults]);

  /** Etiquetas presentes en los resultados, ordenadas por frecuencia. */
  const labels = useMemo<LabelFacet[]>(() => {
    const counts = new Map<string, LabelFacet>();
    for (const email of emails) {
      for (const label of visibleLabels(email.labels ?? [])) {
        const existing = counts.get(label.id);
        if (existing) existing.count++;
        else counts.set(label.id, { ...label, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [emails]);

  const visible = useMemo(
    () => (labelFilter ? emails.filter((e) => (e.labels ?? []).includes(labelFilter)) : emails),
    [emails, labelFilter],
  );

  const threads = useMemo(() => groupByThread(visible), [visible]);

  return {
    emails: visible,
    totalEmails: emails.length,
    threads,
    labels,
    labelFilter,
    setLabelFilter,
    status,
    error,
    isRefreshing,
    maxResults,
    refresh: () => load(maxResults, { silent: true }),
    loadMore: () => setMaxResults((current) => current + 20),
  };
}
