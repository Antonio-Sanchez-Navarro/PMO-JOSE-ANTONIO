import React, { useState } from 'react';
import { updateEmailStatus } from '../../kanban/api/tasks.api';

export interface ChangeEmailStatusData {
  emailId: string;
  status: string | null;
}

interface ChangeEmailStatusCardProps {
  change: ChangeEmailStatusData;
}

const STATUS_LABELS: Record<string, { label: string; style: string; icon: string }> = {
  PENDING: { label: 'Pendiente', style: 'bg-amber-100 text-amber-800 border-amber-200', icon: '⏳' },
  IN_PROGRESS: { label: 'En Progreso', style: 'bg-blue-100 text-blue-800 border-blue-200', icon: '🔄' },
  COMPLETED: { label: 'Completado', style: 'bg-green-100 text-green-800 border-green-200', icon: '✅' },
  DISMISSED: { label: 'Descartado', style: 'bg-gray-100 text-gray-800 border-gray-200', icon: '🚫' },
};

export const ChangeEmailStatusCard: React.FC<ChangeEmailStatusCardProps> = ({ change }) => {
  const [statusState, setStatusState] = useState<'idle' | 'updating' | 'updated' | 'discarded'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsForce, setNeedsForce] = useState(false);

  const statusConfig = change.status ? STATUS_LABELS[change.status] : null;

  const handleApply = async (force = false) => {
    if (!change.status) return;
    setStatusState('updating');
    setErrorMsg(null);

    try {
      await updateEmailStatus(change.emailId, change.status, force);
      setStatusState('updated');
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('409') || error.message.toLowerCase().includes('despachado')) {
        setNeedsForce(true);
        setErrorMsg('El correo ya fue despachado previamente. ¿Deseas forzar el cambio?');
      } else {
        setErrorMsg(error.message);
      }
      setStatusState('idle');
    }
  };

  const handleDiscard = () => {
    setStatusState('discarded');
  };

  if (statusState === 'discarded') {
    return (
      <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-md border border-red-100 flex items-center gap-2">
        <span>❌</span> Propuesta de cambio de estado descartada
      </div>
    );
  }

  if (statusState === 'updated') {
    return (
      <div className="bg-green-50 text-green-700 text-xs px-3 py-2 rounded-md border border-green-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>✅</span> Estado del correo actualizado a {statusConfig?.label || change.status}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-purple-200 rounded-xl shadow-sm overflow-hidden flex flex-col w-full max-w-sm">
      <div className="bg-purple-50 px-3 py-2 border-b border-purple-100 flex justify-between items-center">
        <span className="text-xs font-semibold text-purple-800 flex items-center gap-1">
          <span>📬</span> Cambio de Estado de Correo
        </span>
      </div>

      <div className="p-3 flex flex-col gap-2 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">ID de Correo</label>
          <div className="text-xs text-gray-800 font-mono truncate">{change.emailId}</div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Estado Propuesto</label>
          {statusConfig ? (
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium border ${statusConfig.style}`}>
                <span>{statusConfig.icon}</span>
                <span>{statusConfig.label}</span>
              </span>
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">Sin estado específico propuesto</div>
          )}
        </div>

        {errorMsg && (
          <div className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded mt-1">
            {errorMsg}
          </div>
        )}
      </div>

      {change.status ? (
        <div className="bg-gray-50 p-2 flex justify-between items-center border-t border-gray-200">
          <button
            onClick={handleDiscard}
            className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
            disabled={statusState === 'updating'}
          >
            Descartar
          </button>
          <button
            onClick={() => handleApply(needsForce)}
            disabled={statusState === 'updating'}
            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {statusState === 'updating' ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Aplicando...</span>
              </>
            ) : needsForce ? (
              <span>Forzar Cambio</span>
            ) : (
              <span>Confirmar Cambio</span>
            )}
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 p-2 border-t border-gray-200 text-center">
          <span className="text-[10px] text-gray-400">No se requiere confirmación al no haber estado definido.</span>
        </div>
      )}
    </div>
  );
};
