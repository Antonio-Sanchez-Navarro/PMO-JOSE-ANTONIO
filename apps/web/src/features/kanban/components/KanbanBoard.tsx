import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { Task, TaskStatus } from '../types';
import { MOCK_TASKS } from './mockTasks';
import { fetchTasks, updateTaskStatus } from '../api/tasks.api';

export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskOrigStatus, setActiveTaskOrigStatus] = useState<TaskStatus | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await fetchTasks();
        if (data && data.length > 0) {
          setTasks(data);
        } else {
          // Fallback a mock data si viene vacío
          setTasks(MOCK_TASKS);
        }
      } catch (error) {
        console.error("Error al cargar tareas, usando mock de respaldo:", error);
        setTasks(MOCK_TASKS);
      } finally {
        setLoading(false);
      }
    };
    loadTasks();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const task = tasks.find((t) => t.id === activeId);
    if (task) {
      setActiveTaskOrigStatus(task.status);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    setTasks((prev) => {
      const activeIndex = prev.findIndex((t) => t.id === activeId);
      const overIndex = prev.findIndex((t) => t.id === overId);
      const isOverColumn = ['TODO', 'IN_PROGRESS', 'DONE'].includes(overId);

      if (activeIndex === -1) return prev;
      const activeTask = prev[activeIndex];
      
      const newStatus = isOverColumn ? (overId as TaskStatus) : (overIndex !== -1 ? prev[overIndex].status : activeTask.status);

      if (activeTask.status !== newStatus) {
        const newTasks = [...prev];
        newTasks[activeIndex] = { ...activeTask, status: newStatus };
        return newTasks;
      }
      return prev;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over) {
      const activeId = String(active.id);
      const overId = String(over.id);
      const isOverColumn = ['TODO', 'IN_PROGRESS', 'DONE'].includes(overId);

      setTasks((prev) => {
        const activeIndex = prev.findIndex((t) => t.id === activeId);
        const overIndex = prev.findIndex((t) => t.id === overId);
        
        let newTasks = [...prev];
        
        // Reordenamiento visual (si arrastramos dentro de otra tarea, ordenamos)
        if (activeIndex !== overIndex && overIndex !== -1 && !isOverColumn) {
          newTasks = arrayMove(newTasks, activeIndex, overIndex);
        }

        const finalTask = newTasks[activeIndex];
        
        // Si la columna cambió desde que empezamos el drag, hacemos el PATCH
        if (finalTask && activeTaskOrigStatus && finalTask.status !== activeTaskOrigStatus) {
          updateTaskStatus(activeId, finalTask.status).catch((err) =>
            console.error("Error guardando el cambio de estado en BD:", err)
          );
        }
        
        return newTasks;
      });
    }
    
    setActiveTaskOrigStatus(null);
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando tablero...</div>;
  }

  const tasksByStatus = {
    TODO: tasks.filter((t) => t.status === 'TODO'),
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
    DONE: tasks.filter((t) => t.status === 'DONE'),
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 p-6 h-full overflow-x-auto">
        <KanbanColumn id="TODO" title="Por Hacer" tasks={tasksByStatus.TODO} />
        <KanbanColumn id="IN_PROGRESS" title="En Progreso" tasks={tasksByStatus.IN_PROGRESS} />
        <KanbanColumn id="DONE" title="Completado" tasks={tasksByStatus.DONE} />
      </div>
    </DndContext>
  );
};
