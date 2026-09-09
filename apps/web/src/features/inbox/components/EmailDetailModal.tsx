import { useEffect, useState } from "react";
import { EmailDetail, fetchEmail } from "../api/emails.api";
import { formatFullDate, initialOf, parseSender, visibleLabels } from "../format";
import { useGmailLabels } from "../useGmailLabels";


export interface EmailDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailId: string | null;
  onAnalyze?: (emailId: string, hasAttachments?: boolean) => void;
  readOnly?: boolean;
}

export function EmailDetailModal({ isOpen, onClose, emailId, onAnalyze, readOnly }: EmailDetailModalProps) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mismo diccionario que la lista: el detalle no puede llamar "Clientes" a lo
  // que la fila de al lado llama de otra manera.
  const labelNames = useGmailLabels();

  useEffect(() => {
    if (isOpen && emailId) {
      setLoading(true);
      setError(null);
      fetchEmail(emailId)
        .then(setEmail)
        .catch((e) => {
          console.error('No se pudo cargar el detalle del correo:', e);
          setError("Error al cargar el detalle del correo.");
        })
        .finally(() => setLoading(false));
    } else {
      setEmail(null);
      setError(null);
    }
  }, [isOpen, emailId]);

  if (!isOpen) return null;

  const sender = email ? parseSender(email.from) : null;
  const labels = email ? visibleLabels(email.labels ?? [], labelNames) : [];
  const isProcessed = email ? Boolean(email.isConverted) : false;

  // La cuarentena. `undefined` es "la IA no lo ha mirado"; un arreglo vacío es
  // "lo miró y no vio nada que hacer", que no es lo mismo y merece decirse.
  const proposals = email?.proposedTasks ?? null;
  const pendingCount = proposals?.length ?? 0;
  const analyzedWithNothing = Array.isArray(proposals) && proposals.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <h3 className="text-lg font-semibold text-slate-800">Detalle del Correo</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-slate-200 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/4"></div>
              <div className="h-32 bg-slate-200 rounded w-full mt-6"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-12">{error}</div>
          ) : email && sender ? (
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{email.subject}</h2>
              
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
                  >
                    {initialOf(sender.name)}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{sender.name} <span className="text-slate-500 font-normal">&lt;{sender.email}&gt;</span></p>
                    <p className="text-sm text-slate-500">{formatFullDate(email.date)}</p>
                  </div>
                </div>
                
                {labels.length > 0 && (
                  <div className="flex gap-2">
                    {labels.map((label) => (
                      <span
                        key={label.id}
                        className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {email.hasAttachments && (
                <div className="mb-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span aria-hidden="true">📎</span>
                  <p>
                    Este correo trae adjuntos. No descargamos su contenido, así que lo que proponga
                    la IA sale solo del texto del mensaje.
                  </p>
                </div>
              )}

              {pendingCount > 0 && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <span aria-hidden="true">🕒</span>
                    En cuarentena: {pendingCount}{" "}
                    {pendingCount === 1 ? "tarea propuesta" : "tareas propuestas"}
                  </h3>
                  <p className="mt-1 text-xs text-amber-800">
                    La IA las dejó esperando tu decisión. No están en el tablero hasta que las apruebes.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {proposals?.map((task, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-amber-900">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                        />
                        <span className="min-w-0">
                          {task.title ? (
                            <span className="font-medium">{task.title}</span>
                          ) : (
                            <span className="font-medium italic text-amber-700">(sin título)</span>
                          )}
                          {task.dueDate && (
                            <span className="text-xs text-amber-700">
                              {" "}· vence {formatFullDate(task.dueDate)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analyzedWithNothing && !isProcessed && (
                <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  La IA ya revisó este correo y no encontró ninguna tarea que proponer.
                </div>
              )}

              <div className="prose prose-slate max-w-none whitespace-pre-wrap text-slate-700 font-sans">
                {email.bodyText || <span className="italic text-slate-400">Este correo no tiene cuerpo de texto.</span>}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cerrar
          </button>
          
          {!readOnly && email && onAnalyze && (
            <button
              disabled={isProcessed}
              onClick={() => {
                onClose();
                onAnalyze(email.id, Boolean(email.hasAttachments));
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                isProcessed
                  ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
                  : pendingCount > 0
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isProcessed
                ? "✅ Convertido a Tareas"
                : pendingCount > 0
                  // Revisar no vuelve a llamar al modelo: la propuesta ya está
                  // guardada y el botón no debería sugerir que se paga otra vez.
                  ? `🕒 Revisar ${pendingCount} ${pendingCount === 1 ? "propuesta" : "propuestas"}`
                  : "🪄 Generar Tareas (IA)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
