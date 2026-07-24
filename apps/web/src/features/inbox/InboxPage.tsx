import { useState } from "react";
import { useInbox } from "./useInbox";
import { formatEmailDate, formatFullDate, initialOf, parseSender } from "./format";
import type { EmailSnippet, EmailThread } from "./types";

export function InboxPage() {
  const { threads, emails, status, error, isRefreshing, refresh, loadMore } = useInbox();

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-slate-800">Bandeja de entrada</h2>
          {status === "ready" && (
            <p className="text-xs text-slate-400">
              {emails.length} {emails.length === 1 ? "correo" : "correos"} ·{" "}
              {threads.length} {threads.length === 1 ? "conversación" : "conversaciones"}
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
          No hay correos en la bandeja de entrada.
        </p>
      )}

      {status === "ready" && threads.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100">
            {threads.map((thread) => (
              <ThreadRow key={thread.threadId} thread={thread} />
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
    </section>
  );
}

function ThreadRow({ thread }: { thread: EmailThread }) {
  const [expanded, setExpanded] = useState(false);
  const hasReplies = thread.messages.length > 1;

  return (
    <li>
      <EmailRow
        email={thread.latest}
        threadCount={thread.messages.length}
        expanded={expanded}
        onToggle={hasReplies ? () => setExpanded((open) => !open) : undefined}
      />

      {expanded && (
        <ul className="border-t border-slate-100 bg-slate-50/60">
          {thread.messages.slice(1).map((message) => (
            <li key={message.id} className="border-t border-slate-100 first:border-t-0">
              <EmailRow email={message} nested />
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
}: {
  email: EmailSnippet;
  threadCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  nested?: boolean;
}) {
  const sender = parseSender(email.from);
  const interactive = Boolean(onToggle);

  const content = (
    <div className={`flex items-start gap-4 px-6 py-4 ${nested ? "pl-16" : ""}`}>
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
          <span className="truncate font-medium text-slate-800" title={sender.email}>
            {sender.name}
          </span>
          {threadCount && threadCount > 1 && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {threadCount}
            </span>
          )}
        </div>
        <p className="truncate text-sm font-medium text-slate-700">{email.subject}</p>
        <p className="truncate text-sm text-slate-500">{email.snippet}</p>
      </div>

      <time
        dateTime={email.date}
        title={formatFullDate(email.date)}
        className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-slate-400"
      >
        {formatEmailDate(email.date)}
      </time>
    </div>
  );

  if (!interactive) return content;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="block w-full text-left transition hover:bg-slate-50"
    >
      {content}
    </button>
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
