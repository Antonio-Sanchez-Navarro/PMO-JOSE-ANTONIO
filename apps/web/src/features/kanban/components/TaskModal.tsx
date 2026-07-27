import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TaskStatus, TaskPriority } from '../types';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'POSTPONED', 'DONE', 'OVERDUE'] as const),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH'] as const),
  dueDate: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  });

  if (!isOpen) return null;

  const handleFormSubmit = (data: TaskFormData) => {
    onSubmit(data);
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl dark:bg-slate-800">
        <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">Nueva Tarea</h2>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Título
            </label>
            <input
              type="text"
              {...register('title')}
              className="w-full px-3 py-2 border rounded-md outline-none bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
                {...register('status')}
                className="w-full px-3 py-2 border rounded-md outline-none bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
                {...register('priority')}
                className="w-full px-3 py-2 border rounded-md outline-none bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              >
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4 space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium transition-colors rounded-md text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Crear Tarea
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
