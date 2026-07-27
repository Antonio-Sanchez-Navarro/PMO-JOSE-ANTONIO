import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
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
import { fetchTasks, moveTask, createTask, deleteTask } from '../api/tasks.api';
import { TaskModal } from './TaskModal';

export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskOrigStatus, setActiveTaskOrigStatus] = useState<TaskStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      const isOverColumn = ['TODO', 'IN_PROGRESS', 'POSTPONED', 'DONE', 'OVERDUE'].includes(overId);

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
      const isOverColumn = ['TODO', 'IN_PROGRESS', 'POSTPONED', 'DONE', 'OVERDUE'].includes(overId);

      setTasks((prev) => {
        const activeIndex = prev.findIndex((t) => t.id === activeId);
        const overIndex = prev.findIndex((t) => t.id === overId);
        
        let newTasks = [...prev];
        
        // Reordenamiento visual (si arrastramos dentro de otra tarea, ordenamos)
        if (activeIndex !== overIndex && overIndex !== -1 && !isOverColumn) {
          newTasks = arrayMove(newTasks, activeIndex, overIndex);
        }

        const finalTask = newTasks.find((t) => t.id === activeId);
        
        if (finalTask) {
          const tasksInFinalColumn = newTasks.filter(t => t.status === finalTask.status);
          const positionInColumn = tasksInFinalColumn.findIndex(t => t.id === activeId);

          const originalTasksInColumn = prev.filter(t => t.status === (activeTaskOrigStatus || finalTask.status));
          const origPositionInColumn = originalTasksInColumn.findIndex(t => t.id === activeId);

          const hasChangedColumn = activeTaskOrigStatus && finalTask.status !== activeTaskOrigStatus;
          const hasChangedPosition = positionInColumn !== origPositionInColumn;
          
          if (hasChangedColumn || hasChangedPosition) {
            moveTask(activeId, finalTask.status, positionInColumn)
              .then((response) => {
                setTasks((currentTasks) => {
                  let updatedTasks = [...currentTasks];
                  for (const col of response.columns) {
                    const tasksInCol = updatedTasks.filter((t) => col.taskIds.includes(t.id));
                    updatedTasks = updatedTasks.filter((t) => !col.taskIds.includes(t.id));
                    
                    tasksInCol.sort((a, b) => col.taskIds.indexOf(a.id) - col.taskIds.indexOf(b.id));
                    tasksInCol.forEach((t) => (t.status = col.status));
                    
                    updatedTasks.push(...tasksInCol);
                  }
                  return updatedTasks;
                });
              })
              .catch((err) =>
                console.error("Error guardando el movimiento de tarea en BD:", err)
              );
          }
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
    POSTPONED: tasks.filter((t) => t.status === 'POSTPONED'),
    DONE: tasks.filter((t) => t.status === 'DONE'),
    OVERDUE: tasks.filter((t) => t.status === 'OVERDUE'),
  };

  const handleCreateTask = async (data: any) => {
    try {
      const newTask = await createTask(data);
      // Actualizamos usando el objeto que retorna el servidor (con reglas de negocio aplicadas)
      setTasks((prev) => [...prev, newTask]);
      setIsModalOpen(false);
      toast.success('Tarea creada exitosamente');
    } catch (error) {
      console.error('Error al crear tarea:', error);
      toast.error('No se pudo crear la tarea');
    }
  };

  const handleDeleteTask = async (id: string) => {
    const taskToRestore = tasks.find(t => t.id === id);
    if (!taskToRestore) return;

    // UI optimista: removemos localmente primero
    setTasks((prev) => prev.filter(t => t.id !== id));
    
    try {
      await deleteTask(id);
      toast.success('Tarea eliminada');
    } catch (error) {
      console.error('Error al eliminar tarea:', error);
      toast.error('Error al eliminar la tarea. Revirtiendo...');
      // Rollback: restauramos la tarea
      setTasks((prev) => [...prev, taskToRestore]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Toaster position="bottom-right" />
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Tablero Kanban</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700"
        >
          + Nueva Tarea
        </button>
      </div>

      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 p-6 overflow-x-auto grow">
          <KanbanColumn id="TODO" title="Por Hacer" tasks={tasksByStatus.TODO} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id="IN_PROGRESS" title="En Progreso" tasks={tasksByStatus.IN_PROGRESS} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id="POSTPONED" title="Pospuestas" tasks={tasksByStatus.POSTPONED} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id="DONE" title="Cumplidas" tasks={tasksByStatus.DONE} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id="OVERDUE" title="Atrasadas" tasks={tasksByStatus.OVERDUE} onDeleteTask={handleDeleteTask} />
        </div>
      </DndContext>

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateTask} 
      />
    </div>
  );
};
