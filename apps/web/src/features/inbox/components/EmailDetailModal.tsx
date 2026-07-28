import { useEffect, useState } from "react";
import { EmailDetail, fetchEmail } from "../api/emails.api";
import { formatFullDate, initialOf, parseSender, visibleLabels } from "../format";


export interface EmailDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailId: string | null;
  onAnalyze?: (emailId: string) => void;
  readOnly?: boolean;
}

export function EmailDetailModal({ isOpen, onClose, emailId, onAnalyze, readOnly }: EmailDetailModalProps) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && emailId) {
      setLoading(true);
      setError(null);
      fetchEmail(emailId)
        .then(setEmail)
        .catch((e) => {
          console.error(e);
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
  const labels = email ? visibleLabels(email.labels ?? []) : [];
  const isProcessed = email ? Boolean(email.isConverted) : false;

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
                onAnalyze(email.id);
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                isProcessed 
                  ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isProcessed ? "✅ Convertido a Tareas" : "🪄 Generar Tareas (IA)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
