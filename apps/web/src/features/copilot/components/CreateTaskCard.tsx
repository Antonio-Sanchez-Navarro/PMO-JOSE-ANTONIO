import React, { useState } from 'react';
import { TaskPriority } from '../../kanban/types';
import { getSocketId } from '../../kanban/hooks/useSocket';
import { apiFetch } from '../../../lib/api';

export interface CreateTaskData {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  sourceEmailId?: string | null;
}

interface CreateTaskCardProps {
  task: CreateTaskData;
}

export const CreateTaskCard: React.FC<CreateTaskCardProps> = ({ task }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [taskData, setTaskData] = useState<CreateTaskData>(task);
  const [status, setStatus] = useState<'idle' | 'creating' | 'created' | 'discarded'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async () => {
    setStatus('creating');
    setErrorMsg(null);
    try {
      const socketId = getSocketId();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (socketId) {
        headers['x-socket-id'] = socketId;
      }

      await apiFetch('/copilot/tasks/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(taskData)
      });

      setStatus('created');
    } catch (err) {
      const error = err as Error;
      setErrorMsg(error.message);
      setStatus('idle');
    }
  };

  const handleDiscard = () => {
    setStatus('discarded');
  };

  if (status === 'discarded') {
    return (
      <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-md border border-red-100 flex items-center gap-2">
        <span>❌</span> Tarea descartada
      </div>
    );
  }

  if (status === 'created') {
    return (
      <div className="bg-green-50 text-green-700 text-xs px-3 py-2 rounded-md border border-green-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>✅</span> Tarea creada exitosamente
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl shadow-sm overflow-hidden flex flex-col w-full max-w-sm">
      <div className="bg-indigo-50 px-3 py-2 border-b border-indigo-100 flex justify-between items-center">
        <span className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
          <span>📋</span> Borrador de Tarea
        </span>
      </div>
      
      <div className="p-3 flex flex-col gap-2 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Título</label>
          {isEditing ? (
            <input 
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-indigo-500" 
              value={taskData.title}
              onChange={(e) => setTaskData({...taskData, title: e.target.value})}
            />
          ) : (
            <div className="text-xs text-gray-800 font-medium">
              {taskData.title}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Descripción</label>
          {isEditing ? (
            <textarea 
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full resize-none focus:outline-none focus:border-indigo-500" 
              rows={4}
              value={taskData.description}
              onChange={(e) => setTaskData({...taskData, description: e.target.value})}
            />
          ) : (
            <div className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 p-2 rounded">
              {taskData.description}
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Prioridad</label>
            {isEditing ? (
              <select
                className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-indigo-500"
                value={taskData.priority}
                onChange={(e) => setTaskData({...taskData, priority: e.target.value as TaskPriority})}
              >
                <option value={TaskPriority.LOW}>Low</option>
                <option value={TaskPriority.MEDIUM}>Medium</option>
                <option value={TaskPriority.HIGH}>High</option>
                <option value={TaskPriority.URGENT}>Urgent</option>
              </select>
            ) : (
              <div className="text-xs text-gray-800 font-medium">
                {taskData.priority}
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Vencimiento</label>
            {isEditing ? (
              <input
                type="date"
                className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-indigo-500"
                value={taskData.dueDate ? taskData.dueDate.split('T')[0] : ''}
                onChange={(e) => setTaskData({...taskData, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null})}
              />
            ) : (
              <div className="text-xs text-gray-800 font-medium">
                {taskData.dueDate ? new Date(taskData.dueDate).toLocaleDateString() : 'Sin fecha'}
              </div>
            )}
          </div>
        </div>

        {taskData.sourceEmailId && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Correo de origen</label>
            <div className="text-[10px] text-gray-600 font-mono truncate">
              {taskData.sourceEmailId}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded mt-1">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="bg-gray-50 p-2 flex justify-between items-center border-t border-gray-200">
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          disabled={status === 'creating'}
        >
          {isEditing ? 'Guardar' : 'Editar'}
        </button>
        <div className="flex gap-2">
          <button 
            onClick={handleDiscard}
            className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
            disabled={status === 'creating'}
          >
            Descartar
          </button>
          <button 
            onClick={handleCreate}
            disabled={status === 'creating' || isEditing}
            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {status === 'creating' ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Creando...</span>
              </>
            ) : (
              <span>Crear Tarea</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
