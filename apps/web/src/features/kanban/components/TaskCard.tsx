import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, TaskPriority, TaskSource } from '../types';
import { AiAuditBadge } from './AiAuditBadge';

interface TaskCardProps {
  task: Task;
  onDelete?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'bg-slate-100 text-slate-700',
  [TaskPriority.MEDIUM]: 'bg-blue-100 text-blue-700',
  [TaskPriority.HIGH]: 'bg-orange-100 text-orange-700',
  [TaskPriority.URGENT]: 'bg-red-100 text-red-700',
};

const SOURCE_LABELS: Record<TaskSource, { icon: string; label: string; style: string }> = {
  [TaskSource.MANUAL]: { icon: '👤', label: 'Manual', style: 'bg-gray-100 text-gray-600' },
  [TaskSource.EMAIL]: { icon: '🤖', label: 'Email', style: 'bg-purple-100 text-purple-700' },
  [TaskSource.WHATSAPP]: { icon: '🤖', label: 'WhatsApp', style: 'bg-emerald-100 text-emerald-700' },
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onDelete, onViewEmail }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white p-4 rounded-md shadow-sm border border-gray-200 mb-2 cursor-grab"
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="text-sm font-medium text-gray-900">{task.title}</h4>
        <div className="flex items-center gap-2">
          {task.aiConfidence && <AiAuditBadge confidence={task.aiConfidence} />}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className="text-red-400 hover:text-red-600 p-1"
              title="Eliminar tarea"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs">
        <div className="flex flex-wrap gap-2">
          {/* Priority Badge */}
          <span className={`px-2 py-0.5 rounded font-semibold tracking-wide text-[10px] uppercase ${PRIORITY_COLORS[task.priority]}`}>
            {task.priority}
          </span>
          {/* Source Badge */}
          {task.source && SOURCE_LABELS[task.source] && (
            <span 
              className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium ${SOURCE_LABELS[task.source].style}`} 
              title={`Origen: ${SOURCE_LABELS[task.source].label}`}
            >
              <span>{SOURCE_LABELS[task.source].icon}</span>
              <span>{SOURCE_LABELS[task.source].label}</span>
            </span>
          )}
          {/* View Email Button */}
          {task.sourceEmailId && onViewEmail && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewEmail(task.sourceEmailId!);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              title="Ver correo original"
            >
              <span>✉️</span>
              <span>Leer</span>
            </button>
          )}
        </div>
        {task.dueDate && (
          <span className="text-gray-500 font-medium whitespace-nowrap">
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
};
