import React, { useState } from 'react';
import { useTags } from '../hooks/useTags';

interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PREDEFINED_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export const TagManagerModal: React.FC<TagManagerModalProps> = ({ isOpen, onClose }) => {
  const { tags, isLoading, createTag } = useTags();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PREDEFINED_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createTag(name.trim(), color);
      setName('');
    } catch (error) {
      console.error('Error creating tag', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white shadow-2xl rounded-2xl dark:bg-slate-800 ring-1 ring-slate-900/5 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Gestionar Etiquetas</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Create Form */}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Nueva Etiqueta
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de la etiqueta..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:bg-slate-900 dark:border-slate-700 dark:text-white transition-all"
                required
              />
            </div>
            
            <div>
              <label className="block mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Color
              </label>
              <div className="flex gap-2">
                {PREDEFINED_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent hover:scale-110'}`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? 'Creando...' : 'Crear Etiqueta'}
            </button>
          </form>

          {/* List */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Etiquetas Existentes
            </h3>
            {isLoading ? (
              <div className="text-sm text-slate-500 text-center py-4">Cargando...</div>
            ) : tags.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4 border border-dashed rounded-lg border-slate-300 dark:border-slate-700">
                No hay etiquetas creadas
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {tags.map(tag => (
                  <span
                    key={tag.id}
                    style={{
                      backgroundColor: tag.color + '20',
                      color: tag.color,
                      borderColor: tag.color,
                    }}
                    className="text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
