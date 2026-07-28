import React, { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import {
  DndContext,
  closestCorners,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
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
import { fetchTasks, moveTask, createTask, deleteTask, FetchTasksFilters } from '../api/tasks.api';
import { TaskModal } from './TaskModal';
import { useSocket } from '../hooks/useSocket';
import { TaskPriority } from '@pmo/shared';

export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskOrigStatus, setActiveTaskOrigStatus] = useState<TaskStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const filters: FetchTasksFilters = {};
      if (searchFilter) filters.search = searchFilter;
      if (statusFilter) filters.status = statusFilter;
      if (priorityFilter) filters.priority = priorityFilter;

      const data = await fetchTasks(filters);
      setTasks(data || []);
    } catch (error) {
      console.error("Error al cargar tareas, usando mock de respaldo:", error);
      setTasks(MOCK_TASKS);
    } finally {
      setLoading(false);
    }
  }, [searchFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useSocket({
    onTaskCreated: (task) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        return [...prev, task];
      });
    },
    onTaskUpdated: (task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    },
    onTaskDeleted: (payload) => {
      setTasks((prev) => prev.filter((t) => t.id !== payload.id));
    },
    onTasksReordered: (payload) => {
      setTasks((currentTasks) => {
        let updatedTasks = [...currentTasks];
        for (const col of payload.columns) {
          const tasksInCol = updatedTasks.filter((t) => col.taskIds.includes(t.id));
          updatedTasks = updatedTasks.filter((t) => !col.taskIds.includes(t.id));
          tasksInCol.sort((a, b) => col.taskIds.indexOf(a.id) - col.taskIds.indexOf(b.id));
          tasksInCol.forEach((t) => (t.status = col.status));
          updatedTasks.push(...tasksInCol);
        }
        return updatedTasks;
      });
    }
  });

  /**
   * Dónde se suelta la tarjeta.
   *
   * Manda el puntero: es lo único que distingue "he soltado dentro de esta
   * columna" de "he soltado cerca de una tarjeta de otra". Las estrategias por
   * distancia no valen aquí porque las columnas son muy altas —el tablero real
   * mide más de 2000 px— y tanto su centro como sus esquinas quedan lejísimos
   * del punto donde se suelta: siempre ganaba alguna tarjeta de una columna
   * poblada, y en las vacías el drop no registraba nada.
   *
   * El resto son respaldos: `rectIntersection` cubre el arrastre por teclado y
   * el hueco entre columnas, donde no hay puntero dentro de ningún droppable, y
   * `closestCorners` evita quedarnos sin destino en el peor caso.
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const porPuntero = pointerWithin(args);
    if (porPuntero.length > 0) return porPuntero;

    const porInterseccion = rectIntersection(args);
    return porInterseccion.length > 0 ? porInterseccion : closestCorners(args);
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
      const isOverColumn = Object.values(TaskStatus).includes(overId as TaskStatus);

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
    
    if (!over) {
      setActiveTaskOrigStatus(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const isOverColumn = Object.values(TaskStatus).includes(overId as TaskStatus);

    const activeIndex = tasks.findIndex((t) => t.id === activeId);
    const overIndex = tasks.findIndex((t) => t.id === overId);
    
    if (activeIndex === -1) {
      setActiveTaskOrigStatus(null);
      return;
    }

    let newTasks = [...tasks];
    
    // Reordenamiento visual (si arrastramos dentro de otra tarea, ordenamos)
    if (activeIndex !== overIndex && overIndex !== -1 && !isOverColumn) {
      newTasks = arrayMove(newTasks, activeIndex, overIndex);
    }

    const finalTask = newTasks.find((t) => t.id === activeId);
    
    if (finalTask) {
      const tasksInFinalColumn = newTasks.filter(t => t.status === finalTask.status);
      const positionInColumn = tasksInFinalColumn.findIndex(t => t.id === activeId);

      const originalTasksInColumn = tasks.filter(t => t.status === (activeTaskOrigStatus || finalTask.status));
      const origPositionInColumn = originalTasksInColumn.findIndex(t => t.id === activeId);

      const hasChangedColumn = activeTaskOrigStatus && finalTask.status !== activeTaskOrigStatus;
      const hasChangedPosition = positionInColumn !== origPositionInColumn;
      
      setTasks(newTasks);

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
    } else {
      setTasks(newTasks);
    }
    
    setActiveTaskOrigStatus(null);
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando tablero...</div>;
  }

  const tasksByStatus = {
    TODO: tasks.filter((t) => t.status === TaskStatus.TODO),
    IN_PROGRESS: tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS),
    POSTPONED: tasks.filter((t) => t.status === TaskStatus.POSTPONED),
    DONE: tasks.filter((t) => t.status === TaskStatus.DONE),
    OVERDUE: tasks.filter((t) => t.status === TaskStatus.OVERDUE),
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
      <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 gap-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white whitespace-nowrap">Tablero Kanban</h2>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-end items-center">
          <input
            type="text"
            placeholder="Buscar tareas..."
            className="px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white w-full sm:w-64"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
          <select
            className="px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
          >
            <option value="">Todos los Estados</option>
            <option value={TaskStatus.TODO}>Por Hacer</option>
            <option value={TaskStatus.IN_PROGRESS}>En Progreso</option>
            <option value={TaskStatus.POSTPONED}>Pospuestas</option>
            <option value={TaskStatus.DONE}>Cumplidas</option>
            <option value={TaskStatus.OVERDUE}>Atrasadas</option>
          </select>
          <select
            className="px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}
          >
            <option value="">Todas las Prioridades</option>
            <option value={TaskPriority.LOW}>Baja</option>
            <option value={TaskPriority.MEDIUM}>Media</option>
            <option value={TaskPriority.HIGH}>Alta</option>
            <option value={TaskPriority.URGENT}>Urgente</option>
          </select>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 whitespace-nowrap"
          >
            + Nueva Tarea
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 p-6 overflow-x-auto grow">
          <KanbanColumn id={TaskStatus.TODO} title="Por Hacer" tasks={tasksByStatus.TODO} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id={TaskStatus.IN_PROGRESS} title="En Progreso" tasks={tasksByStatus.IN_PROGRESS} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id={TaskStatus.POSTPONED} title="Pospuestas" tasks={tasksByStatus.POSTPONED} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id={TaskStatus.DONE} title="Cumplidas" tasks={tasksByStatus.DONE} onDeleteTask={handleDeleteTask} />
          <KanbanColumn id={TaskStatus.OVERDUE} title="Atrasadas" tasks={tasksByStatus.OVERDUE} onDeleteTask={handleDeleteTask} />
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
