import { useMemo, useState } from "react";
import { useInbox, type LabelFacet } from "./useInbox";
import type { LabelsById } from "./useGmailLabels";
import {
  formatEmailDate,
  formatFullDate,
  initialOf,
  isUnread,
  parseSender,
  visibleLabels,
} from "./format";
import type { EmailSnippet, EmailThread } from "./types";
import { AiValidationModal } from "../kanban/components/AiValidationModal";
import { classifyEmail, createTasksFromEmail } from "../kanban/api/tasks.api";
import { EmailClassification } from "@pmo/shared";
import { Toaster, toast } from 'sonner';
import { EmailDetailModal } from "./components/EmailDetailModal";
import { updateEmailStatus } from "../kanban/api/tasks.api";
import { useSocket } from "../kanban/hooks/useSocket";
import { useCopilot } from "../copilot/CopilotContext";
import { useDashboardMetrics } from "../dashboard/hooks/useDashboardMetrics";
import { useEmailSelection, type EstadoDeSeleccion } from "./useEmailSelection";
import { BulkActionBar } from "./components/BulkActionBar";
import { ConfirmDismissDialog } from "./components/ConfirmDismissDialog";
import { bulkDismissEmails } from "./api/emails.api";
import { ApiError } from "../../lib/api";

export function InboxPage() {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED'>('PENDING');

  /**
   * Los contadores de las pestañas salen de `/dashboard/metrics`, no de la
   * lista cargada.
   *
   * La lista pide `take=20`: contar sus filas daba "20 correos" con 143 en la
   * bandeja, y era exactamente el desfase entre la bandeja y el dashboard.
   * `inbox.byStatus` cuenta los cuatro estados sobre la tabla entera, así que
   * los dos sitios enseñan por fin el mismo número.
   */
  const { data: metrics, refresh: refreshMetrics } = useDashboardMetrics();

  const {
    threads,
    emails,
    totalEmails,
    labels,
    labelNames,
    labelFilter,
    setLabelFilter,
    status,
    error,
    isRefreshing,
    refresh,
    loadMore,
    updateEmail,
    removeEmails,
  } = useInbox(activeTab);

  useSocket({
    onEmailUpdated: (email) => {
      updateEmail(email as unknown as EmailSnippet);
    }
  });

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiProposal, setAiProposal] = useState<EmailClassification | null>(null);
  const [aiHasAttachments, setAiHasAttachments] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  /**
   * Abre la cuarentena de un correo.
   *
   * Sin `force` no cuesta tokens si el correo ya se analizó: la API sirve la
   * propuesta que tiene guardada. Con `force` se paga un análisis nuevo, y solo
   * se llega ahí desde el botón que lo dice.
   */
  const handleAnalyzeEmail = async (emailId: string, hasAttachments = false, force = false) => {
    try {
      const toastId = toast.loading(force ? 'Reanalizando el correo con IA…' : 'Analizando correo con IA...');
      const result = await classifyEmail(emailId, force);
      toast.dismiss(toastId);
      setAiProposal(result);
      setAiHasAttachments(hasAttachments);
      setIsAiModalOpen(true);
    } catch (e) {
      const error = e as Error & { response?: { status: number } };
      if (error.response?.status === 409) {
        toast.error('Este correo ya fue convertido a tareas.');
      } else {
        toast.error(error.message || 'Error al analizar el correo');
      }
    }
  };

  const seleccion = useEmailSelection(emails);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  /**
   * En «Descartados» no se ofrece descartar: sería un lote de no-operaciones
   * que además pediría confirmación. Las casillas tampoco se pintan ahí.
   */
  const seleccionDisponible = activeTab !== "DISMISSED";

  /**
   * Los no accionables de entre lo cargado, o `null` si la API no manda el
   * campo. Las tres formas de "no" no son la misma —`false` es un boletín,
   * `undefined` es un correo del que no sabemos nada— y contarlas juntas
   * ofrecería descartar lo que nadie ha mirado.
   */
  const noAccionables = useMemo(() => {
    const campoDisponible = emails.some((e) => typeof e.isActionable === "boolean");
    if (!campoDisponible) return null;
    return emails.filter((e) => e.isActionable === false).map((e) => e.id);
  }, [emails]);

  /** Cuántos hilos toca la selección actual. Es el número que va al diálogo. */
  const hilosSeleccionados = useMemo(() => {
    const marcados = new Set(seleccion.seleccionados);
    return threads.filter((hilo) => hilo.messages.some((m) => marcados.has(m.id))).length;
  }, [threads, seleccion.seleccionados]);

  const ejecutarDescarteMasivo = async () => {
    const ids = seleccion.seleccionados;
    setConfirmandoDescarte(false);
    setDescartando(true);
    setProgreso({ hechos: 0, total: ids.length });

    try {
      const resultado = await bulkDismissEmails(ids, (hechos, total) =>
        setProgreso({ hechos, total }),
      );

      // Los tres motivos de omisión no significan lo mismo, y meterlos en un
      // solo "N sin mover" haría sonar a fallo lo que no lo es.
      const porMotivo = (motivo: string) =>
        resultado.skipped.filter((s) => s.reason === motivo).length;
      const yaEstaban = porMotivo("ALREADY_DISMISSED");
      const protegidos = porMotivo("NOT_PENDING");
      const perdidos = porMotivo("NOT_FOUND");

      // `ALREADY_DISMISSED` sale de la lista igual que los movidos: el correo
      // está en Descartados, que es donde se le quería. Dejarlo en pantalla
      // como pendiente sería enseñar algo que ya no lo está.
      const siguenPendientes = new Set(
        resultado.skipped
          .filter((s) => s.reason !== "ALREADY_DISMISSED")
          .map((s) => s.id),
      );
      removeEmails(ids.filter((id) => !siguenPendientes.has(id)));
      seleccion.limpiar();
      void refreshMetrics();

      const despachados = resultado.updated + yaEstaban;

      if (protegidos === 0 && perdidos === 0) {
        toast.success(`${despachados} ${despachados === 1 ? "correo" : "correos"} en Descartados`);
      } else if (protegidos > 0) {
        // El único caso con remedio, así que se dice cuál es.
        toast.warning(
          `${despachados} descartados. ${protegidos} se quedaron fuera porque ya estaban en proceso o completados: ` +
            "el lote no los toca. Para descartarlos, ábrelos en su pestaña y usa el botón «Descartar» de cada fila.",
          { duration: 10000 },
        );
      } else {
        toast.warning(`${despachados} descartados · ${perdidos} ya no existían`);
      }
    } catch (e) {
      // El lote va troceado: si revienta el segundo envío, el primero ya se
      // escribió. Por eso aquí se recarga en vez de suponer que no pasó nada —
      // dejar la lista como estaba enseñaría como pendientes correos que la API
      // ya movió.
      if (e instanceof ApiError && e.status === 404) {
        toast.error(
          "El descarte masivo todavía no está desplegado en la API (POST /emails/bulk-dismiss).",
        );
      } else {
        toast.error(e instanceof Error ? e.message : "No se pudo descartar la selección.");
        refresh();
        void refreshMetrics();
      }
    } finally {
      setDescartando(false);
      setProgreso(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm relative">
      <Toaster position="top-right" />
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-slate-800">Bandeja de entrada</h2>
          {status === "ready" && (
            <p className="text-xs text-slate-400">
              {emails.length} {emails.length === 1 ? "correo cargado" : "correos cargados"} ·{" "}
              {threads.length} {threads.length === 1 ? "conversación" : "conversaciones"}
              {labelFilter && ` · filtrado de ${totalEmails}`}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing || status === "loading"}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {isRefreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {/* Tabs de Inbox Zero */}
      <div className="flex items-center gap-6 px-6 border-b border-slate-200 bg-slate-50/50">
        {[
          { id: 'PENDING', label: 'Pendientes' },
          { id: 'IN_PROGRESS', label: 'En Proceso' },
          { id: 'COMPLETED', label: 'Completados' },
          { id: 'DISMISSED', label: 'Descartados' }
        ].map(tab => {
          const count = metrics?.inbox.byStatus[tab.id as keyof typeof metrics.inbox.byStatus];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED')}
              className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
              {/* Sin métricas no se pinta nada: un cero inventado mientras carga
                  se lee como "no tienes correos", que es peor que no decir nada. */}
              {typeof count === "number" && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {status === "ready" && labels.length > 0 && (
        <LabelFilterBar labels={labels} active={labelFilter} onChange={setLabelFilter} />
      )}

      {status === "loading" && <InboxSkeleton />}

      {status === "error" && (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {status === "ready" && threads.length === 0 && (
        <p className="px-6 py-12 text-center text-sm text-slate-400">
          {labelFilter
            ? "Ningún correo con esta etiqueta."
            : "No hay correos en la bandeja de entrada."}
        </p>
      )}

      {status === "ready" && threads.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100">
            {threads.map((thread) => (
              <ThreadRow 
                key={thread.threadId} 
                thread={thread}
                labelNames={labelNames}
                onAnalyze={handleAnalyzeEmail}
                seleccionable={seleccionDisponible}
                estadoSeleccion={seleccion.estadoDelHilo(thread)}
                estaSeleccionado={seleccion.estaSeleccionado}
                onSeleccionar={seleccion.alternar}

                onRead={(id) => setSelectedEmailId(id)}
                onUpdateStatus={async (id, newStatus, force) => {
                  try {
                    const updated = await updateEmailStatus(id, newStatus, force);
                    updateEmail(updated as unknown as EmailSnippet);
                    // El correo cambió de estado: los contadores de las
                    // pestañas acaban de quedarse viejos.
                    void refreshMetrics();
                  } catch (e) {
                    const error = e as Error;
                    toast.error(error.message || 'Error al cambiar estado');
                  }
                }}
              />
            ))}
          </ul>
          <div className="border-t border-slate-200 px-6 py-4 text-center">
            <button
              onClick={loadMore}
              disabled={isRefreshing}
              className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700 disabled:opacity-50"
            >
              Cargar más correos
            </button>
          </div>

          {seleccionDisponible && (
            <BulkActionBar
              correos={seleccion.total}
              hilos={hilosSeleccionados}
              visibles={emails.length}
              noAccionables={noAccionables === null ? null : noAccionables.length}
              ocupado={descartando}
              progreso={progreso}
              onSeleccionarTodo={() => seleccion.reemplazar(emails.map((e) => e.id))}
              onSeleccionarNoAccionables={() => seleccion.reemplazar(noAccionables ?? [])}
              onLimpiar={seleccion.limpiar}
              onDescartar={() => setConfirmandoDescarte(true)}
            />
          )}
        </>
      )}

      <ConfirmDismissDialog
        abierto={confirmandoDescarte}
        correos={seleccion.total}
        hilos={hilosSeleccionados}
        onCancelar={() => setConfirmandoDescarte(false)}
        onConfirmar={ejecutarDescarteMasivo}
      />

      <AiValidationModal
        isOpen={isAiModalOpen}
        onCancel={() => {
          setIsAiModalOpen(false);
          setAiProposal(null);
        }}
        proposal={aiProposal}
        hasAttachments={aiHasAttachments}
        onReanalyze={
          aiProposal
            ? () => handleAnalyzeEmail(aiProposal.emailId, aiHasAttachments, true)
            : undefined
        }
        onConfirm={async (data) => {
          try {
            const { category, tasks } = data;
            const payload = category ? { category, tasks } : { tasks };
            // Sin force: true, porque es la primera vez que se procesa en este flujo
            await createTasksFromEmail(data.emailId, payload);
            
            toast.success("✅ Convertido a Tareas");
            setIsAiModalOpen(false);
            setAiProposal(null);
            // Refrescar bandeja para actualizar el estado visual de los correos
            refresh();
            // Y los contadores: aprobar vacía la cuarentena de ese correo.
            void refreshMetrics();
          } catch (e) {
            const error = e as Error;
            toast.error(error?.message || "Error al crear las tareas propuestas.");
            console.error(error);
          }
        }}
      />

      <EmailDetailModal
        isOpen={selectedEmailId !== null}
        onClose={() => setSelectedEmailId(null)}
        emailId={selectedEmailId}
        onAnalyze={handleAnalyzeEmail}
      />
    </section>
  );
}

function ThreadRow({
  thread,
  labelNames,
  onAnalyze,
  onRead,
  onUpdateStatus,
  seleccionable,
  estadoSeleccion,
  estaSeleccionado,
  onSeleccionar,
}: {
  thread: EmailThread;
  labelNames: LabelsById;
  onAnalyze: (id: string, hasAttachments?: boolean) => Promise<void> | void;
  onRead: (id: string) => void;
  onUpdateStatus: (id: string, status: string, force?: boolean) => void;
  seleccionable: boolean;
  estadoSeleccion: EstadoDeSeleccion;
  estaSeleccionado: (id: string) => boolean;
  onSeleccionar: (ids: string[], seleccionar: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasReplies = thread.messages.length > 1;

  /**
   * La casilla del hilo manda sobre **todos** sus mensajes, incluidos los que
   * están plegados. Es lo que hace que despachar 401 hilos no obligue a abrir
   * los 728 correos, y por eso el diálogo de confirmación cuenta las dos cosas.
   */
  const alternarHilo = (marcar: boolean) =>
    onSeleccionar(thread.messages.map((m) => m.id), marcar);

  return (
    <li>
      <EmailRow
        email={thread.latest}
        labelNames={labelNames}
        threadCount={thread.messages.length}
        expanded={expanded}
        seleccionable={seleccionable}
        estadoCasilla={hasReplies ? estadoSeleccion : undefined}
        marcada={estaSeleccionado(thread.latest.id)}
        onMarcar={alternarHilo}
        etiquetaCasilla={
          hasReplies
            ? `Seleccionar la conversación completa (${thread.messages.length} correos)`
            : "Seleccionar este correo"
        }
        onToggle={hasReplies ? () => setExpanded((open) => !open) : undefined}
        onAnalyze={() => onAnalyze(thread.latest.id, thread.latest.hasAttachments)}
        onRead={() => onRead(thread.latest.id)}
        onUpdateStatus={(status, force) => onUpdateStatus(thread.latest.id, status, force)}
      />

      {expanded && (
        <ul className="border-t border-slate-100 bg-slate-50/60">
          {thread.messages.slice(1).map((message) => (
            <li key={message.id} className="border-t border-slate-100 first:border-t-0">
              <EmailRow
                email={message}
                labelNames={labelNames}
                nested
                seleccionable={seleccionable}
                marcada={estaSeleccionado(message.id)}
                onMarcar={(marcar) => onSeleccionar([message.id], marcar)}
                etiquetaCasilla="Seleccionar este correo del hilo"

                onAnalyze={() => onAnalyze(message.id, message.hasAttachments)} 
                onRead={() => onRead(message.id)}
                onUpdateStatus={(status, force) => onUpdateStatus(message.id, status, force)}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function EmailRow({
  email,
  labelNames,
  threadCount,
  expanded,
  onToggle,
  nested = false,
  onAnalyze,
  onRead,
  onUpdateStatus,
  seleccionable = false,
  estadoCasilla,
  marcada = false,
  onMarcar,
  etiquetaCasilla,
}: {
  email: EmailSnippet;
  labelNames: LabelsById;
  threadCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  nested?: boolean;
  onAnalyze?: () => Promise<void> | void;
  onRead?: () => void;
  onUpdateStatus?: (status: string, force?: boolean) => void;
  seleccionable?: boolean;
  /**
   * Solo para la fila que representa un hilo con respuestas: es el estado de
   * los mensajes de dentro, y `"parcial"` pinta la casilla indeterminada.
   */
  estadoCasilla?: EstadoDeSeleccion;
  marcada?: boolean;
  onMarcar?: (marcar: boolean) => void;
  etiquetaCasilla?: string;
}) {
  const sender = parseSender(email.from);
  const interactive = Boolean(onToggle);
  const labels = visibleLabels(email.labels ?? [], labelNames);
  const unread = isUnread(email.labels ?? []);

  // Según HANDOFF: isConverted indica si el correo ya fue convertido a tareas
  const isProcessed = Boolean(email.isConverted);

  // La cuarentena, vista desde la lista. `taskCount` no sirve para esto: desde
  // la Fase 6 sigue en 0 mientras las propuestas esperan, porque la IA ya no
  // escribe en el tablero.
  const proposalCount = email.proposedTaskCount ?? 0;
  const hasProposals = proposalCount > 0;

  // Estrictamente `=== false`. `undefined` no es "accionable": es que la API
  // no manda el campo todavía, y pintar esa fila como boletín sería inventar
  // una clasificación que nadie hizo.
  const noAccionable = email.isActionable === false;

  const { openCopilotWithContext } = useCopilot();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const content = (
    <div 
      {...(!interactive ? { role: "button", tabIndex: 0 } : {})}
      className={`flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50 transition ${nested ? "pl-16" : ""}`}
      onClick={(e) => {
        // Evitar que el clic en botones propague el evento al div padre.
        // La casilla entra en la misma guarda: marcar un correo no es pedir
        // que se abra, y sin esto cada clic de selección abriría el modal.
        const target = e.target as HTMLElement;
        if (target.closest('button, input, label')) return;
        onRead?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement;
          // El espacio sobre una casilla es su forma de marcarse: si aquí se
          // hace `preventDefault()` antes de comprobarlo, la casilla deja de
          // funcionar con el teclado.
          if (target.closest('button, input, label')) return;
          e.preventDefault();
          onRead?.();
        }
      }}
    >
      {seleccionable && onMarcar && (
        <label
          className="flex shrink-0 cursor-pointer items-center self-center py-1 pr-1"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="sr-only">{etiquetaCasilla ?? "Seleccionar correo"}</span>
          <input
            type="checkbox"
            checked={estadoCasilla ? estadoCasilla === "lleno" : marcada}
            ref={(el) => {
              // `indeterminate` no es un atributo: solo existe como propiedad
              // del nodo, así que en JSX hay que ponerlo a mano.
              if (el) el.indeterminate = estadoCasilla === "parcial";
            }}
            onChange={(e) => onMarcar(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>
      )}

      {!nested && (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
        >
          {initialOf(sender.name)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {unread && (
            <span
              aria-label="No leído"
              className="h-2 w-2 shrink-0 self-center rounded-full bg-indigo-500"
            />
          )}
          <span
            className={`truncate text-slate-800 ${unread ? "font-semibold" : "font-medium"}`}
            title={sender.email}
          >
            {sender.name}
          </span>
          {threadCount && threadCount > 1 && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {threadCount}
            </span>
          )}
        </div>
        <p className={`truncate text-sm text-slate-700 ${unread ? "font-semibold" : "font-medium"}`}>
          {email.hasAttachments && (
            <span
              className="mr-1 text-slate-400"
              title="Trae adjuntos. La IA no lee su contenido."
              aria-label="Con adjuntos"
            >
              📎
            </span>
          )}
          {email.subject}
        </p>
        <p className="truncate text-sm text-slate-500">{email.snippet}</p>

        {(hasProposals || noAccionable || labels.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {noAccionable && (
              <span
                className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                title="La IA no vio nada que hacer aquí: boletín, notificación o informativo."
              >
                No accionable
              </span>
            )}
            {hasProposals && (
              <span
                className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                title="La IA dejó tareas esperando tu decisión. No están en el tablero hasta que las apruebes."
              >
                🕒 {proposalCount} {proposalCount === 1 ? "propuesta" : "propuestas"}
              </span>
            )}
            {labels.map((label) => (
              <span
                key={label.id}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-2">
        <time
          dateTime={email.date}
          title={formatFullDate(email.date)}
          className="whitespace-nowrap pt-0.5 text-xs text-slate-400 mb-1"
        >
          {formatEmailDate(email.date)}
        </time>

        {/* Botones de Inbox Zero (Activos) */}
        {!nested && onUpdateStatus && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus('PENDING', true); }}
              className="px-2 py-1 text-[11px] font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded transition"
              title="Devolver a Pendientes"
            >
              A Pendientes
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus('DISMISSED'); }}
              className="px-2 py-1 text-[11px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded transition"
              title="Descartar"
            >
              Descartar
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus('IN_PROGRESS'); }}
              className="px-2 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition"
              title="Marcar en proceso"
            >
              En Proceso
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus('COMPLETED'); }}
              className="px-2 py-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded transition"
              title="Marcar como completado"
            >
              Completado
            </button>
          </div>
        )}

        {onAnalyze && (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCopilotWithContext({ emailId: email.id });
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className="px-3 py-1.5 text-xs font-medium transition-colors rounded-md shadow-sm whitespace-nowrap border bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1"
              title="Preguntar al copiloto"
            >
              <span>✨</span>
              <span>Copiloto</span>
            </button>
            {!isProcessed && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsAnalyzing(true);
                  try {
                    await onAnalyze();
                  } finally {
                    setIsAnalyzing(false);
                  }
                }}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 text-xs font-medium transition-colors rounded-md shadow-sm whitespace-nowrap border
                  ${isAnalyzing
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-200 cursor-default'
                    : hasProposals
                      // Ámbar y "revisar": abrir una propuesta guardada no
                      // vuelve a llamar al modelo, y el botón no debe sugerir
                      // que se paga otra vez por lo mismo.
                      ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                      : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  }
                `}
              >
                {isAnalyzing
                  ? "⏳ Analizando..."
                  : hasProposals
                    ? `🕒 Revisar ${proposalCount}`
                    : "🪄 Generar Tareas (IA)"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!interactive) return content;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle?.();
        }
      }}
      aria-expanded={expanded}
      className="block w-full text-left transition hover:bg-slate-50 cursor-pointer"
    >
      {content}
    </div>
  );
}

function LabelFilterBar({
  labels,
  active,
  onChange,
}: {
  labels: LabelFacet[];
  active: string | null;
  onChange: (label: string | null) => void;
}) {
  const chip = (selected: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      selected
        ? "bg-indigo-600 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-3">
      <span className="mr-1 text-xs uppercase tracking-wide text-slate-400">Etiqueta</span>
      <button onClick={() => onChange(null)} className={chip(active === null)}>
        Todas
      </button>
      {labels.map((label) => (
        <button
          key={label.id}
          onClick={() => onChange(active === label.id ? null : label.id)}
          className={chip(active === label.id)}
        >
          {label.name} <span className="opacity-60">{label.count}</span>
        </button>
      ))}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <ul className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={index} className="flex items-start gap-4 px-6 py-4">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-32 animate-pulse rounded bg-slate-200" />
            <span className="block h-3 w-3/5 animate-pulse rounded bg-slate-200" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-slate-100" />
          </div>
          <span className="h-3 w-10 shrink-0 animate-pulse rounded bg-slate-200" />
        </li>
      ))}
    </ul>
  );
}
