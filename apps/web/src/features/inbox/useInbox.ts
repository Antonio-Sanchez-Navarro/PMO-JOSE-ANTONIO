import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { fetchEmailThreads } from "./api/emails.api";
import { visibleLabels } from "./format";
import { useGmailLabels } from "./useGmailLabels";
import type { EmailSnippet, InboxThread } from "./types";
import type { Ambito } from "./components/ScopeTabs";

export type InboxStatus = "loading" | "ready" | "error";

/** Etiqueta presente en los resultados, con cuántos hilos la llevan. */
export interface LabelFacet {
  id: string;
  name: string;
  count: number;
}

/**
 * Carga la bandeja desde `GET /emails/threads`, ya agrupada por el servidor.
 *
 * **Agrupaba aquí hasta la Fase 7, y era una agrupación que mentía a escala.**
 * Se pedían 20 correos y se juntaban por `threadId` en el cliente: con 728
 * correos repartidos en 401 hilos, agrupar los 20 de la página no daba hilos,
 * daba 20 filas con un contador puesto. Dos mensajes de la misma conversación
 * solo caían juntos si la casualidad los ponía en la misma página.
 *
 * Ahora el servidor agrupa sobre la tabla entera y **pagina por hilo**: `take`
 * cuenta hilos, no correos, y la respuesta trae los dos totales para que la
 * cabecera pueda decir «401 hilos · 728 correos» sin inventarse ninguno.
 *
 * La sesión viaja en cookies httpOnly: `apiFetch` ya usa `credentials: "include"`
 * y renueva el token una vez si la API responde 401.
 */
export function useInbox(
  activeStatus: string = "PENDING",
  ambito: Ambito = { tipo: "general" },
  initialMaxResults = 20,
) {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [total, setTotal] = useState(0);
  const [totalEmails, setTotalEmails] = useState(0);
  const [status, setStatus] = useState<InboxStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [maxResults, setMaxResults] = useState(initialMaxResults);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  // El diccionario de nombres de Gmail. Se pide una vez y lo comparten las
  // facetas de aqui y las pildoras de cada fila, que tienen que decir lo mismo.
  const labelNames = useGmailLabels();
  const reqIdRef = useRef(0);

  // El ámbito se desmenuza aquí y no en el `useCallback` para que la
  // dependencia sea el valor y no el objeto: `{ tipo: "general" }` es uno nuevo
  // en cada render y recargaría la bandeja en bucle.
  const company = ambito.tipo === "empresa" ? ambito.valor : undefined;
  const bank = ambito.tipo === "banco" ? ambito.valor : undefined;

  const load = useCallback(
    async (limit: number, { silent = false } = {}) => {
      const currentReqId = ++reqIdRef.current;
      if (silent) setIsRefreshing(true);
      else setStatus("loading");
      setError(null);

      try {
        const page = await fetchEmailThreads({
          status: activeStatus,
          take: limit,
          company,
          bank,
        });
        if (currentReqId !== reqIdRef.current) return;
        setThreads(page.items);
        setTotal(page.total);
        setTotalEmails(page.totalEmails);
        setStatus("ready");
      } catch (err) {
        if (currentReqId !== reqIdRef.current) return;
        setError(
          err instanceof ApiError && err.status === 401
            ? "Tu sesión con Google expiró. Vuelve a iniciar sesión."
            : "No se pudo cargar la bandeja de entrada.",
        );
        setStatus("error");
      } finally {
        if (currentReqId === reqIdRef.current) {
          setIsRefreshing(false);
        }
      }
    },
    [activeStatus, company, bank],
  );

  useEffect(() => {
    void load(maxResults, { silent: false });
  }, [load, maxResults]);

  /**
   * Etiquetas presentes en los resultados, ordenadas por frecuencia.
   *
   * Se cuentan sobre **el correo más reciente de cada hilo**, que es el único
   * que viaja: el servidor manda los ids del resto, no sus etiquetas. Antes se
   * contaban sobre todos los correos cargados, así que un número que baje aquí
   * no es una regresión — es que ahora cuenta hilos.
   */
  const labels = useMemo<LabelFacet[]>(() => {
    const counts = new Map<string, LabelFacet>();
    for (const thread of threads) {
      for (const label of visibleLabels(thread.latest.labels ?? [], labelNames)) {
        const existing = counts.get(label.id);
        if (existing) existing.count++;
        else counts.set(label.id, { ...label, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [threads, labelNames]);

  const visible = useMemo(
    () =>
      labelFilter
        ? threads.filter((t) => (t.latest.labels ?? []).includes(labelFilter))
        : threads,
    [threads, labelFilter],
  );

  /**
   * Quita correos de la bandeja sin volver a pedirla, y descuenta los totales.
   *
   * Un hilo que se queda sin correos desaparece: `messageCount` cuenta lo que
   * deja el filtro, así que un hilo vacío ya no pertenece a esta pestaña.
   *
   * Los totales se ajustan a mano **porque son los que pinta la cabecera**. Si
   * no se tocaran, descartar 318 correos dejaría el rótulo diciendo «401 hilos ·
   * 728 correos» sobre una bandeja recién vaciada, y el siguiente en leerlo
   * pensaría que el lote no hizo nada.
   */
  const removeEmails = useCallback((ids: string[]) => {
    const fuera = new Set(ids);
    if (fuera.size === 0) return;

    setThreads((prev) => {
      let correosFuera = 0;
      let hilosFuera = 0;

      const siguiente = prev.flatMap((thread) => {
        const quedan = thread.emailIds.filter((id) => !fuera.has(id));
        if (quedan.length === thread.emailIds.length) return [thread];

        correosFuera += thread.emailIds.length - quedan.length;
        if (quedan.length === 0) {
          hilosFuera++;
          return [];
        }
        return [{ ...thread, emailIds: quedan, messageCount: quedan.length }];
      });

      setTotal((t) => Math.max(0, t - hilosFuera));
      setTotalEmails((t) => Math.max(0, t - correosFuera));
      return siguiente;
    });
  }, []);

  /**
   * Aplica el cambio de estado de un correo suelto (botones de fila y socket).
   *
   * Si el correo sale de la pestaña activa se quita; si sigue en ella, se
   * refresca la cabecera del hilo cuando el que cambió era el más reciente.
   */
  const applyEmailUpdate = useCallback(
    (email: EmailSnippet) => {
      if (email.status !== activeStatus) {
        removeEmails([email.id]);
        return;
      }
      setThreads((prev) =>
        prev.map((thread) =>
          thread.latest.id === email.id ? { ...thread, latest: email } : thread,
        ),
      );
    },
    [activeStatus, removeEmails],
  );

  return {
    threads: visible,
    /** Hilos que deja el filtro en la tabla entera, no los cargados. */
    total,
    totalEmails,
    /** Cuántos hilos quedan sin traer. Es lo que decide si «cargar más» sirve. */
    porCargar: Math.max(0, total - threads.length),
    labels,
    labelNames,
    labelFilter,
    setLabelFilter,
    status,
    error,
    isRefreshing,
    refresh: () => load(maxResults, { silent: true }),
    loadMore: () => setMaxResults((current) => current + 20),
    applyEmailUpdate,
    removeEmails,
  };
}
