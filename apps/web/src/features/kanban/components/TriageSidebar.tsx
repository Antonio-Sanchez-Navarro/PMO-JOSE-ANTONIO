import React from 'react';
import { useTriageEmails } from '../hooks/useTriageEmails';

interface TriageSidebarProps {
  onAnalyze: (emailId: string, isConverted: boolean) => void;
}

export const TriageSidebar: React.FC<TriageSidebarProps> = ({ onAnalyze }) => {
  const { emails, loading, error, refetch } = useTriageEmails();

  return (
    <div className="w-80 border-r border-slate-200 bg-slate-50 flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
        <h2 className="font-semibold text-slate-800">Triage de IA</h2>
        <button onClick={refetch} className="text-slate-400 hover:text-slate-600 transition" title="Actualizar">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-sm text-slate-500 text-center py-4">Cargando correos...</p>}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
            {error}
          </div>
        )}
        
        {!loading && !error && emails.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">No hay correos accionables pendientes.</p>
        )}

        {!loading && !error && emails.map((email) => (
          <div key={email.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:border-indigo-300 transition group">
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-medium text-slate-500 truncate pr-2">{email.from}</span>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                {new Date(email.date).toLocaleDateString()}
              </span>
            </div>
            <h3 className="text-sm font-medium text-slate-900 mb-3 line-clamp-2" title={email.subject}>
              {email.subject}
            </h3>
            <div className="flex items-center justify-between">
              {email.isConverted ? (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  Ya convertido
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                  Nuevo
                </span>
              )}
              
              <button
                onClick={() => onAnalyze(email.id, email.isConverted)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                  email.isConverted 
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                }`}
              >
                {email.isConverted ? "🔄 Reprocesar" : "✨ Analizar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
