import React, { useState, useEffect } from 'react';
import { TimeEntry } from '@pmo/shared';
import { getTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry } from '../api/time.api';
import { toast } from 'sonner';

interface TimeEntriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
}

export const TimeEntriesModal: React.FC<TimeEntriesModalProps> = ({ isOpen, onClose, taskId }) => {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [note, setNote] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && taskId) {
      loadEntries();
      resetForm();
    }
  }, [isOpen, taskId]);

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const data = await getTimeEntries(taskId);
      setEntries(data);
    } catch {
      toast.error('Error al cargar historial de tiempos');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    const now = new Date();
    // Default form values: started 1h ago, ended now
    const oneHourAgo = new Date(now.getTime() - 3600000);
    setStartedAt(oneHourAgo.toISOString().slice(0, 16));
    setEndedAt(now.toISOString().slice(0, 16));
    setNote('');
    setEditingId(null);
  };

  const handleEditClick = (entry: TimeEntry) => {
    if (!entry.endedAt) {
      toast.error('No se puede editar un cronómetro en curso');
      return;
    }
    setEditingId(entry.id);
    setStartedAt(new Date(entry.startedAt).toISOString().slice(0, 16));
    setEndedAt(new Date(entry.endedAt).toISOString().slice(0, 16));
    setNote(entry.note || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startedAt || !endedAt) {
      toast.error('Las fechas son requeridas');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const startedAtIso = new Date(startedAt).toISOString();
      const endedAtIso = new Date(endedAt).toISOString();

      if (editingId) {
        await updateTimeEntry(editingId, { startedAt: startedAtIso, endedAt: endedAtIso, note });
        toast.success('Entrada actualizada');
      } else {
        await createTimeEntry({ taskId, startedAt: startedAtIso, endedAt: endedAtIso, note });
        toast.success('Entrada creada');
      }
      resetForm();
      loadEntries();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta entrada?')) return;
    try {
      await deleteTimeEntry(id);
      toast.success('Entrada eliminada');
      loadEntries();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    }
  };

  const formatDuration = (sec: number | null | undefined) => {
    if (sec == null) return 'En curso';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white shadow-2xl rounded-2xl dark:bg-slate-800 ring-1 ring-slate-900/5 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Tiempos Manuales</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
          
          {/* Formulario */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-sm mb-3 dark:text-slate-200">
              {editingId ? 'Editar Entrada' : 'Agregar Entrada Manual'}
            </h3>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Inicio</label>
                  <input
                    type="datetime-local"
                    value={startedAt}
                    onChange={(e) => setStartedAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fin</label>
                  <input
                    type="datetime-local"
                    value={endedAt}
                    onChange={(e) => setEndedAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nota (opcional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="¿En qué trabajaste?"
                  className="w-full px-3 py-1.5 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-1.5 text-sm text-slate-600 bg-slate-200 hover:bg-slate-300 rounded"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>

          {/* Historial */}
          <div>
            <h3 className="font-semibold text-sm mb-3 dark:text-slate-200">Historial de Tiempos</h3>
            {isLoading ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded text-center">
                No hay tiempos registrados para esta tarea.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium dark:text-slate-200">
                          {new Date(entry.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        <span className="text-slate-400 text-xs">→</span>
                        <span className="text-sm font-medium dark:text-slate-200">
                          {entry.endedAt ? new Date(entry.endedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'En curso'}
                        </span>
                      </div>
                      {entry.note && (
                        <p className="text-xs text-slate-500 mt-1">{entry.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
                        {formatDuration(entry.durationSec)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditClick(entry)}
                          disabled={!entry.endedAt}
                          className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
