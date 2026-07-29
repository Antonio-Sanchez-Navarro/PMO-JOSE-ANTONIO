import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '../types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  onDeleteTask?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onReturnToInbox?: (emailId: string) => void;
  onStartTimer?: (id: string) => void;
  onStopTimer?: (id: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  id, 
  title, 
  tasks, 
  onDeleteTask,
  onViewEmail,
  onReturnToInbox,
  onStartTimer,
  onStopTimer
}) => {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div className="flex flex-col w-80 bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-gray-700 mb-4">{title}</h3>
      <div ref={setNodeRef} className="flex-1 min-h-[200px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onDelete={onDeleteTask}
              onViewEmail={onViewEmail}
              onReturnToInbox={onReturnToInbox}
              onStartTimer={onStartTimer}
              onStopTimer={onStopTimer}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};
