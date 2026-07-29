import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, TaskPriority, TaskSource } from '../types';
import { AiAuditBadge } from './AiAuditBadge';

interface TaskCardProps {
  task: Task;
  onDelete?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onReturnToInbox?: (emailId: string) => void;
  onStartTimer?: (id: string) => void;
  onStopTimer?: (id: string) => void;
  onManageTime?: (id: string) => void;
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

const TaskTimer: React.FC<{
  totalTimeSec?: number;
  activeTimeStartedAt?: string | null;
  onStart?: () => void;
  onStop?: () => void;
}> = ({ totalTimeSec = 0, activeTimeStartedAt, onStart, onStop }) => {
  const [elapsed, setElapsed] = React.useState(totalTimeSec);

  React.useEffect(() => {
    if (!activeTimeStartedAt) {
      setElapsed(totalTimeSec);
      return;
    }

    const start = new Date(activeTimeStartedAt).getTime();
    
    const update = () => {
      const now = new Date().getTime();
      const currentElapsed = Math.floor((now - start) / 1000);
      setElapsed(totalTimeSec + currentElapsed);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeTimeStartedAt, totalTimeSec]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const isRunning = !!activeTimeStartedAt;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-xs font-mono font-medium ${isRunning ? 'text-green-600 animate-pulse' : 'text-gray-500'}`}>
        ⏱ {formatTime(elapsed)}
      </span>
      {isRunning ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStop?.();
          }}
          className="text-[10px] uppercase font-bold tracking-wide bg-red-100 text-red-700 px-2 py-0.5 rounded hover:bg-red-200 transition"
        >
          ⏹ Stop
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStart?.();
          }}
          className="text-[10px] uppercase font-bold tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded hover:bg-green-200 transition"
        >
          ▶ Start
        </button>
      )}
    </div>
  );
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onDelete, onViewEmail, onReturnToInbox, onStartTimer, onStopTimer, onManageTime }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const titleMatch = task.title.match(/^\[(.*?)\]\s*(.*)$/);
  const prefix = titleMatch ? titleMatch[1] : null;
  const cleanTitle = titleMatch ? titleMatch[2] : task.title;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white p-4 rounded-md shadow-sm border border-gray-200 mb-2 cursor-grab flex flex-col group"
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="flex flex-col min-w-0">
          {prefix && (
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 truncate">
              {prefix}
            </span>
          )}
          <h4 className="text-sm font-medium text-gray-900 line-clamp-2" title={cleanTitle}>
            {cleanTitle}
          </h4>
        </div>
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

      {/* Etiquetas curadas del usuario */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map(label => (
            <span
              key={label.id}
              style={{
                backgroundColor: label.color + '20',
                color: label.color,
                borderColor: label.color,
              }}
              className="text-[10px] px-1.5 py-0.5 rounded-sm border font-medium truncate max-w-[120px]"
              title={label.name}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Etiquetas automáticas del modelo AI */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map((t, idx) => (
            <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-sm">
              {t}
            </span>
          ))}
        </div>
      )}
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
          {/* Return to Inbox Button */}
          {task.sourceEmailId && onReturnToInbox && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReturnToInbox(task.sourceEmailId!);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 transition"
              title="Devolver a la bandeja"
            >
              <span>↩️</span>
              <span>Bandeja</span>
            </button>
          )}
        </div>
        {task.dueDate && (
          <span className="text-gray-500 font-medium whitespace-nowrap">
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
        <div className="flex-1">
          <TaskTimer
            totalTimeSec={task.totalTimeSec}
            activeTimeStartedAt={task.activeTimeStartedAt}
            onStart={() => onStartTimer?.(task.id)}
            onStop={() => onStopTimer?.(task.id)}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManageTime?.(task.id);
          }}
          className="text-slate-400 hover:text-indigo-600 transition p-1"
          title="Historial de tiempos"
        >
          🕒
        </button>
      </div>
    </div>
  );
};
