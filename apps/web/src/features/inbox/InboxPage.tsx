import { useState } from "react";
import { useInbox, type LabelFacet } from "./useInbox";
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

export function InboxPage() {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED'>('PENDING');

  const {
    threads,
    emails,
    totalEmails,
    labels,
    labelFilter,
    setLabelFilter,
    status,
    error,
    isRefreshing,
    refresh,
    loadMore,
    updateEmail,
  } = useInbox(activeTab);

  useSocket({
    onEmailUpdated: (email) => {
      updateEmail(email as unknown as EmailSnippet);
    }
  });

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiProposal, setAiProposal] = useState<EmailClassification | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const handleAnalyzeEmail = async (emailId: string) => {
    try {
      const toastId = toast.loading('Analizando correo con IA...');
      const result = await classifyEmail(emailId);
      toast.dismiss(toastId);
      setAiProposal(result);
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm relative">
      <Toaster position="top-right" />
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-slate-800">Bandeja de entrada</h2>
          {status === "ready" && (
            <p className="text-xs text-slate-400">
              {emails.length} {emails.length === 1 ? "correo" : "correos"} ·{" "}
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
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
                onAnalyze={handleAnalyzeEmail} 
                onRead={(id) => setSelectedEmailId(id)}
                onUpdateStatus={async (id, newStatus, force) => {
                  try {
                    const updated = await updateEmailStatus(id, newStatus, force);
                    updateEmail(updated as unknown as EmailSnippet);
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
        </>
      )}

      <AiValidationModal
        isOpen={isAiModalOpen}
        onCancel={() => {
          setIsAiModalOpen(false);
          setAiProposal(null);
        }}
        proposal={aiProposal}
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
  onAnalyze,
  onRead,
  onUpdateStatus,
}: { 
  thread: EmailThread; 
  onAnalyze: (id: string) => Promise<void> | void; 
  onRead: (id: string) => void;
  onUpdateStatus: (id: string, status: string, force?: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasReplies = thread.messages.length > 1;

  return (
    <li>
      <EmailRow
        email={thread.latest}
        threadCount={thread.messages.length}
        expanded={expanded}
        onToggle={hasReplies ? () => setExpanded((open) => !open) : undefined}
        onAnalyze={() => onAnalyze(thread.latest.id)}
        onRead={() => onRead(thread.latest.id)}
        onUpdateStatus={(status, force) => onUpdateStatus(thread.latest.id, status, force)}
      />

      {expanded && (
        <ul className="border-t border-slate-100 bg-slate-50/60">
          {thread.messages.slice(1).map((message) => (
            <li key={message.id} className="border-t border-slate-100 first:border-t-0">
              <EmailRow 
                email={message} 
                nested 
                onAnalyze={() => onAnalyze(message.id)} 
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
  threadCount,
  expanded,
  onToggle,
  nested = false,
  onAnalyze,
  onRead,
  onUpdateStatus,
}: {
  email: EmailSnippet;
  threadCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  nested?: boolean;
  onAnalyze?: () => Promise<void> | void;
  onRead?: () => void;
  onUpdateStatus?: (status: string, force?: boolean) => void;
}) {
  const sender = parseSender(email.from);
  const interactive = Boolean(onToggle);
  const labels = visibleLabels(email.labels ?? []);
  const unread = isUnread(email.labels ?? []);

  // Según HANDOFF: isConverted indica si el correo ya fue convertido a tareas
  const isProcessed = Boolean(email.isConverted);
  
  const { openCopilotWithContext } = useCopilot();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const content = (
    <div 
      {...(!interactive ? { role: "button", tabIndex: 0 } : {})}
      className={`flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50 transition ${nested ? "pl-16" : ""}`}
      onClick={(e) => {
        // Evitar que el clic en botones propague el evento al div padre
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        onRead?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          onRead?.();
        }
      }}
    >
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
          {email.subject}
        </p>
        <p className="truncate text-sm text-slate-500">{email.snippet}</p>

        {labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
                    : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  }
                `}
              >
                {isAnalyzing ? "⏳ Analizando..." : "🪄 Generar Tareas (IA)"}
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
