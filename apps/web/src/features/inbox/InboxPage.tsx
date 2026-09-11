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
import type { EmailSnippet, InboxThread } from "./types";
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
    total,
    totalEmails,
    porCargar,
    labels,
    labelNames,
    labelFilter,
    setLabelFilter,
    status,
    error,
    isRefreshing,
    refresh,
    loadMore,
    applyEmailUpdate,
    removeEmails,
  } = useInbox(activeTab);

  useSocket({
    onEmailUpdated: (email) => {
      applyEmailUpdate(email as unknown as EmailSnippet);
    },
    // Un lote entero en un solo evento. Llega cuando el descarte masivo lo hizo
    // *otra* pestaña: la que pulsó el botón manda su `x-socket-id` y el backend
    // la excluye, así que no se repinta a sí misma.
    onEmailsBulkUpdated: ({ ids, status: nuevoEstado }) => {
      if (nuevoEstado !== activeTab) removeEmails(ids);
    },
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

  const seleccion = useEmailSelection(threads);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  /**
   * En «Descartados» no se ofrece descartar: sería un lote de no-operaciones
   * que además pediría confirmación. Las casillas tampoco se pintan ahí.
   */
  const seleccionDisponible = activeTab !== "DISMISSED";

  /**
   * Los correos de los hilos que se pueden barrer a ciegas.
   *
   * **Se construye sobre `allNonActionable` y nunca sobre `isActionable`.** La
   * columna nace en `false` y se queda ahí hasta que alguien clasifique el
   * correo, así que preguntándole a la fila, «es un boletín» y «nadie lo ha
   * mirado todavía» contestan lo mismo — y los segundos son justo los que no se
   * pueden descartar en bloque, porque puede haber trabajo dentro. El hilo ya
   * trae esa distinción hecha: exige que el worker lo despachara, que la IA
   * llegara a opinar y que el veredicto fuera que no.
   */
  const noAccionables = useMemo(
    () => threads.filter((t) => t.allNonActionable).flatMap((t) => t.emailIds),
    [threads],
  );

  /** Cuántos hilos toca la selección actual. Es el número que va al diálogo. */
  const hilosSeleccionados = useMemo(() => {
    const marcados = new Set(seleccion.seleccionados);
    return threads.filter((hilo) => hilo.emailIds.some((id) => marcados.has(id))).length;
  }, [threads, seleccion.seleccionados]);

  /** Todos los correos a la vista: es el techo de «seleccionar los cargados». */
  const correosVisibles = useMemo(
    () => threads.flatMap((t) => t.emailIds),
    [threads],
  );

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
            /* Los dos totales salen de la respuesta y son de la tabla entera, no
               de la página. Hasta la Fase 7 aquí ponía «N correos cargados»
               porque no había forma de saber cuántos había detrás: con 20 de 728
               a la vista, el rótulo era verdad y aun así engañaba. */
            <p className="text-xs text-slate-400">
              {total} {total === 1 ? "conversación" : "conversaciones"} ·{" "}
              {totalEmails} {totalEmails === 1 ? "correo" : "correos"}
              {porCargar > 0 && ` · mostrando ${threads.length}`}
              {labelFilter && " · filtrado por etiqueta"}
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
                onSeleccionar={seleccion.alternar}

                onRead={(id) => setSelectedEmailId(id)}
                onUpdateStatus={async (id, newStatus, force) => {
                  try {
                    const updated = await updateEmailStatus(id, newStatus, force);
                    applyEmailUpdate(updated as unknown as EmailSnippet);
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
          {porCargar > 0 && (
            <div className="border-t border-slate-200 px-6 py-4 text-center">
              <button
                onClick={loadMore}
                disabled={isRefreshing}
                className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700 disabled:opacity-50"
              >
                {/* Dice cuántas quedan porque ahora se sabe. Un «cargar más» que
                    sigue ahí con la lista completa hace dudar de si falta algo. */}
                Cargar más conversaciones ({porCargar} por ver)
              </button>
            </div>
          )}

          {seleccionDisponible && (
            <BulkActionBar
              correos={seleccion.total}
              hilos={hilosSeleccionados}
              visibles={correosVisibles.length}
              noAccionables={noAccionables.length}
              ocupado={descartando}
              progreso={progreso}
              onSeleccionarTodo={() => seleccion.reemplazar(correosVisibles)}
              onSeleccionarNoAccionables={() => seleccion.reemplazar(noAccionables)}
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
  onSeleccionar,
}: {
  thread: InboxThread;
  labelNames: LabelsById;
  onAnalyze: (id: string, hasAttachments?: boolean) => Promise<void> | void;
  onRead: (id: string) => void;
  onUpdateStatus: (id: string, status: string, force?: boolean) => void;
  seleccionable: boolean;
  estadoSeleccion: EstadoDeSeleccion;
  onSeleccionar: (ids: string[], seleccionar: boolean) => void;
}) {
  /**
   * El hilo se pliega y se despliega desde la Fase 7 **sin lista dentro**.
   *
   * `GET /emails/threads` manda el correo más reciente y los ids del resto, no
   * los mensajes: pintar las respuestas exigiría un `GET /emails/:id` por cada
   * una, y son 728 en producción. La fila es la unidad de decisión, y para leer
   * la conversación se abre el correo.
   *
   * La casilla marca **todo el hilo**: son exactamente los ids que el lote va a
   * mover, que es lo que permite despachar 401 conversaciones sin abrir 728
   * correos.
   */
  const alternarHilo = (marcar: boolean) => onSeleccionar(thread.emailIds, marcar);

  return (
    <li>
      <EmailRow
        email={thread.latest}
        labelNames={labelNames}
        threadCount={thread.messageCount}
        allNonActionable={thread.allNonActionable}
        proposalCountHilo={thread.proposedTaskCount}
        hasAttachmentsHilo={thread.hasAttachments}
        seleccionable={seleccionable}
        estadoCasilla={estadoSeleccion}
        onMarcar={alternarHilo}
        etiquetaCasilla={
          thread.messageCount > 1
            ? `Seleccionar la conversación completa (${thread.messageCount} correos)`
            : "Seleccionar este correo"
        }
        onAnalyze={() => onAnalyze(thread.latest.id, thread.hasAttachments)}
        onRead={() => onRead(thread.latest.id)}
        onUpdateStatus={(status, force) => onUpdateStatus(thread.latest.id, status, force)}
      />
    </li>
  );
}

function EmailRow({
  email,
  labelNames,
  threadCount,
  allNonActionable = false,
  proposalCountHilo,
  hasAttachmentsHilo,
  onAnalyze,
  onRead,
  onUpdateStatus,
  seleccionable = false,
  estadoCasilla,
  onMarcar,
  etiquetaCasilla,
}: {
  email: EmailSnippet;
  labelNames: LabelsById;
  /** Correos del hilo **que deja el filtro**, no mensajes de la conversación. */
  threadCount?: number;
  /** Veredicto del hilo, no de la fila. Ver `InboxThread.allNonActionable`. */
  allNonActionable?: boolean;
  /** Propuestas de todo el hilo: las respuestas también esperan decisión. */
  proposalCountHilo?: number;
  hasAttachmentsHilo?: boolean;
  onAnalyze?: () => Promise<void> | void;
  onRead?: () => void;
  onUpdateStatus?: (status: string, force?: boolean) => void;
  seleccionable?: boolean;
  /** `"parcial"` pinta la casilla indeterminada. */
  estadoCasilla?: EstadoDeSeleccion;
  onMarcar?: (marcar: boolean) => void;
  etiquetaCasilla?: string;
}) {
  const sender = parseSender(email.from);
  const labels = visibleLabels(email.labels ?? [], labelNames);
  const unread = isUnread(email.labels ?? []);

  // Según HANDOFF: isConverted indica si el correo ya fue convertido a tareas
  const isProcessed = Boolean(email.isConverted);

  // La cuarentena, vista desde la lista. `taskCount` no sirve para esto: desde
  // la Fase 6 sigue en 0 mientras las propuestas esperan, porque la IA ya no
  // escribe en el tablero.
  // Del hilo entero, no del correo de cabecera: una respuesta también puede
  // tener propuestas esperando, y el badge cuenta lo que hay que decidir aquí.
  const proposalCount = proposalCountHilo ?? email.proposedTaskCount ?? 0;
  const hasProposals = proposalCount > 0;

  // **Del hilo, nunca de `email.isActionable`.** La columna nace en `false`, así
  // que preguntándole a la fila un correo sin analizar se pinta como boletín.
  const noAccionable = allNonActionable;

  const traeAdjuntos = hasAttachmentsHilo ?? email.hasAttachments;

  const { openCopilotWithContext } = useCopilot();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50 transition"
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
            checked={estadoCasilla === "lleno"}
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

      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
      >
        {initialOf(sender.name)}
      </span>

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
          {traeAdjuntos && (
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
        {onUpdateStatus && (
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
