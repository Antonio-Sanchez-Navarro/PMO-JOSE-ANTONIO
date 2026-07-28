import React, { useState, useEffect } from 'react';
import { EmailClassification, EmailCategory, ProposedTask } from '@pmo/shared';

interface AiValidationModalProps {
  isOpen: boolean;
  proposal: EmailClassification | null;
  onConfirm: (finalData: EmailClassification) => void;
  onCancel: () => void;
}

export const AiValidationModal: React.FC<AiValidationModalProps> = ({
  isOpen,
  proposal,
  onConfirm,
  onCancel,
}) => {
  const [category, setCategory] = useState<EmailCategory>(EmailCategory.OTHER);
  const [isCategoryModified, setIsCategoryModified] = useState(false);
  const [tasks, setTasks] = useState<ProposedTask[]>([]);

  // Sincronizar el estado interno con la propuesta que llega
  useEffect(() => {
    if (proposal && isOpen) {
      setCategory(proposal.category);
      setIsCategoryModified(false);
      setTasks(proposal.tasks.map(t => ({ ...t })));
    }
  }, [proposal, isOpen]);

  if (!isOpen || !proposal) return null;

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTaskTitle = (index: number, newTitle: string) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, title: newTitle } : t))
    );
  };

  const handleSubmit = () => {
    if (!proposal) return;

    if (tasks.length === 0) {
      onCancel();
      return;
    }

    const finalPayload: any = {
      ...proposal,
      tasks,
    };

    if (isCategoryModified) {
      finalPayload.category = category;
    } else {
      delete finalPayload.category;
    }

    onConfirm(finalPayload as EmailClassification);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="w-full max-w-2xl overflow-hidden bg-white shadow-2xl rounded-2xl dark:bg-slate-800 ring-1 ring-slate-900/5 transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">IA ha extraído una tarea</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Revisa la propuesta antes de enviarla al tablero.</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Categoría del Correo
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as EmailCategory);
                  setIsCategoryModified(true);
                }}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:bg-slate-900 dark:border-slate-700 dark:text-white transition-all"
              >
                <option value={EmailCategory.INFORMATIONAL}>Informacional</option>
                <option value={EmailCategory.PROJECT_MANAGEMENT}>Gestión de Proyectos</option>
                <option value={EmailCategory.INVOICING}>Facturación</option>
                <option value={EmailCategory.MEETING}>Reunión</option>
                <option value={EmailCategory.OTHER}>Otro</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <label className="block mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Tareas Propuestas ({tasks.length})
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {tasks.length === 0 && (
                <div className="p-4 text-center text-slate-500 border border-dashed rounded-lg border-slate-300 dark:border-slate-700">
                  No hay tareas propuestas
                </div>
              )}
              {tasks.map((t, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-white border rounded-lg shadow-sm group border-slate-200 hover:border-indigo-300 hover:shadow-md dark:bg-slate-800 dark:border-slate-700 dark:hover:border-indigo-500 transition-all">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-xs font-bold text-indigo-600 bg-indigo-100 rounded-full dark:bg-indigo-500/20 dark:text-indigo-400">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={t.title}
                    onChange={(e) => handleUpdateTaskTitle(index, e.target.value)}
                    className="flex-grow px-2 py-1 text-sm bg-transparent border-b border-transparent outline-none focus:border-indigo-400 dark:text-slate-200 transition-colors"
                  />
                  <button
                    onClick={() => handleRemoveTask(index)}
                    className="p-1.5 text-slate-400 rounded-md opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                    title="Descartar tarea"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 dark:bg-slate-800/50 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700 transition-all"
          >
            Descartar
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 hover:shadow-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all"
          >
            Aprobar e Insertar
          </button>
        </div>
      </div>
    </div>
  );
};
