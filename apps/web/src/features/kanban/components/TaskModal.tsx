import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Task } from '../types';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'POSTPONED', 'DONE', 'OVERDUE'] as const),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
  dueDate: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: TaskFormData) => void;
  task?: Task;
  onToggleSubtask?: (taskId: string, subtaskId: string, isCompleted: boolean) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSubmit, task, onToggleSubtask }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title || '',
      status: task?.status || 'TODO',
      priority: task?.priority || 'MEDIUM',
    },
  });

  if (!isOpen) return null;

  const handleFormSubmit = (data: TaskFormData) => {
    if (onSubmit) onSubmit(data);
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`w-full p-6 bg-white rounded-lg shadow-xl dark:bg-slate-800 max-h-[90vh] overflow-y-auto ${task ? 'max-w-2xl' : 'max-w-md'}`}>
        <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
          {task ? 'Detalle de Tarea' : 'Nueva Tarea'}
        </h2>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Título
            </label>
            <input
              type="text"
              readOnly={!!task}
              {...register('title')}
              className={`w-full px-3 py-2 border rounded-md outline-none border-slate-300 dark:border-slate-600 dark:text-white ${task ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-700'}`}
              placeholder="Ej: Implementar login"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Estado
              </label>
              <select
                disabled={!!task}
                {...register('status')}
                className={`w-full px-3 py-2 border rounded-md outline-none border-slate-300 dark:border-slate-600 dark:text-white ${task ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-700'}`}
              >
                <option value="TODO">Por Hacer</option>
                <option value="IN_PROGRESS">En Progreso</option>
                <option value="POSTPONED">Pospuesta</option>
                <option value="DONE">Cumplida</option>
                <option value="OVERDUE">Atrasada</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Prioridad
              </label>
              <select
                disabled={!!task}
                {...register('priority')}
                className={`w-full px-3 py-2 border rounded-md outline-none border-slate-300 dark:border-slate-600 dark:text-white ${task ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-700'}`}
              >
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
          </div>

          {task && task.subtasks && task.subtasks.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Subtareas</h3>
              <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                {task.subtasks.map((sub) => (
                  <label 
                    key={sub.id} 
                    className={`flex items-start gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer border border-slate-100 dark:border-slate-700 transition-colors ${
                      sub.isCompleted ? 'opacity-60 bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-800'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={sub.isCompleted}
                      onChange={(e) => {
                        onToggleSubtask?.(task.id, sub.id, e.target.checked);
                      }}
                    />
                    <span className={`text-sm leading-tight flex-1 ${
                      sub.isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                    }`}>
                      {sub.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium transition-colors rounded-md text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              {task ? 'Cerrar' : 'Cancelar'}
            </button>
            {!task && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Crear Tarea
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
