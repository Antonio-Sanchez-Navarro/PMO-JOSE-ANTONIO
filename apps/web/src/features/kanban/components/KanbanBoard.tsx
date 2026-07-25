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
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { Task, TaskStatus } from '../types';
import { MOCK_TASKS } from './mockTasks';
import { fetchTasks, updateTaskStatus } from '../api/tasks.api';

export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    setTasks((prev) => {
      const activeIndex = prev.findIndex((t) => t.id === activeId);
      const overIndex = prev.findIndex((t) => t.id === overId);
      
      const isOverColumn = ['TODO', 'IN_PROGRESS', 'DONE'].includes(overId);
      
      if (isOverColumn) {
        // Soltado sobre una columna vacía o el área de la columna
        const newTasks = [...prev];
        newTasks[activeIndex] = {
          ...newTasks[activeIndex],
          status: overId as TaskStatus,
        };
        // Persistencia optimista
        updateTaskStatus(activeId, overId as TaskStatus).catch(err => 
          console.error("Error guardando el cambio de columna:", err)
        );
        return newTasks;
      }

      if (activeIndex !== -1 && overIndex !== -1) {
        // Soltado sobre otra tarea
        const activeTask = prev[activeIndex];
        const overTask = prev[overIndex];
        
        let newTasks = [...prev];
        if (activeTask.status !== overTask.status) {
          // Cambiar de columna
          newTasks[activeIndex] = { ...activeTask, status: overTask.status };
          // Persistencia optimista
          updateTaskStatus(activeId, overTask.status as TaskStatus).catch(err => 
            console.error("Error guardando el cambio de estado:", err)
          );
        }
        
        return arrayMove(newTasks, activeIndex, overIndex);
      }
      
      return prev;
    });
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-6 p-6 h-full overflow-x-auto">
        <KanbanColumn id="TODO" title="Por Hacer" tasks={tasksByStatus.TODO} />
        <KanbanColumn id="IN_PROGRESS" title="En Progreso" tasks={tasksByStatus.IN_PROGRESS} />
        <KanbanColumn id="DONE" title="Completado" tasks={tasksByStatus.DONE} />
      </div>
    </DndContext>
  );
};
