import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../types';
import { AiAuditBadge } from './AiAuditBadge';

interface TaskCardProps {
  task: Task;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
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
        {task.aiConfidence && <AiAuditBadge confidence={task.aiConfidence} />}
      </div>
      <div className="flex gap-2 text-xs text-gray-500">
        <span>{task.priority}</span>
        {task.dueDate && <span>Due: {task.dueDate}</span>}
      </div>
    </div>
  );
};
