import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { fetchTasks, moveTask, createTask, deleteTask, FetchTasksFilters, updateEmailStatus } from '../api/tasks.api';
import { startTimer, stopTimer, getActiveTimeEntry } from '../api/time.api';
import { TaskModal } from './TaskModal';
import { TagManagerModal } from './TagManagerModal';
import { TimeEntriesModal } from './TimeEntriesModal';
import { TimeReportModal } from './TimeReportModal';
import { EmailDetailModal } from '../../inbox/components/EmailDetailModal';
import { useSocket } from '../hooks/useSocket';
import { TaskPriority } from '@pmo/shared';

export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskOrigStatus, setActiveTaskOrigStatus] = useState<TaskStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [managingTimeTaskId, setManagingTimeTaskId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  
  const [searchInput, setSearchInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const hasLoadedRef = useRef(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchFilter(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadTasks = useCallback(async () => {
    const currentReqId = ++reqIdRef.current;
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const filters: FetchTasksFilters = {};
      if (searchFilter) filters.search = searchFilter;
      if (statusFilter) filters.status = statusFilter;
      if (priorityFilter) filters.priority = priorityFilter;

      const data = await fetchTasks(filters);
      if (currentReqId !== reqIdRef.current) return;
      
      // Hydrate active timer
      let fetchedTasks = data || [];
      try {
        const activeEntry = await getActiveTimeEntry();
        if (currentReqId !== reqIdRef.current) return;
        if (activeEntry && activeEntry.taskId) {
          fetchedTasks = fetchedTasks.map(t => 
            t.id === activeEntry.taskId 
              ? { ...t, activeTimeStartedAt: activeEntry.startedAt, activeTimeEntryId: activeEntry.id }
              : t
          );
        }
      } catch (err) {
        console.error("No se pudo obtener el timer activo", err);
      }

      if (currentReqId !== reqIdRef.current) return;
      setTasks(fetchedTasks);
      hasLoadedRef.current = true;
    } catch (error) {
      if (currentReqId !== reqIdRef.current) return;
      console.error("Error al cargar tareas:", error);
      setError('Error al cargar las tareas. Por favor, reintente.');
      toast.error('Error de conexión con el servidor');
      setTasks([]);
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
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
          const mappedTasks = tasksInCol.map((t) => ({ ...t, status: col.status as TaskStatus }));
          updatedTasks.push(...mappedTasks);
        }
        return updatedTasks;
      });
    },
    onTimeStarted: (timer) => {
      setTasks((prev) => prev.map((t) => {
        if (t.id === timer.taskId) {
          return { ...t, activeTimeStartedAt: timer.startedAt, activeTimeEntryId: timer.id };
        }
        return t;
      }));
    },
    onTimeStopped: (timer) => {
      setTasks((prev) => prev.map((t) => {
        if (t.id === timer.taskId) {
          return {
            ...t,
            activeTimeEntryId: null,
            activeTimeStartedAt: null,
            totalTimeSec: (t.totalTimeSec || 0) + (timer.durationSec || 0)
          };
        }
        return t;
      }));
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
      
      const previousTasks = tasks;
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
                const mappedTasks = tasksInCol.map((t) => ({ ...t, status: col.status as TaskStatus }));
                
                updatedTasks.push(...mappedTasks);
              }
              return updatedTasks;
            });
          })
          .catch((err) => {
            console.error("Error guardando el movimiento de tarea en BD:", err);
            toast.error("Error al mover la tarea. Revirtiendo cambio...");
            setTasks(previousTasks);
          });
      }
    } else {
      setTasks(newTasks);
    }
    
    setActiveTaskOrigStatus(null);
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando tablero...</div>;
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <div className="text-red-500 mb-4 bg-red-50 p-4 rounded-md border border-red-200">
          <p className="font-medium text-lg">{error}</p>
        </div>
        <button 
          onClick={loadTasks} 
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const tasksByStatus = {
    TODO: tasks.filter((t) => t.status === TaskStatus.TODO),
    IN_PROGRESS: tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS),
    POSTPONED: tasks.filter((t) => t.status === TaskStatus.POSTPONED),
    DONE: tasks.filter((t) => t.status === TaskStatus.DONE),
    OVERDUE: tasks.filter((t) => t.status === TaskStatus.OVERDUE),
  };

  const handleCreateTask = async (data: { title: string; status: string; priority: string; dueDate?: string }) => {
    try {
      const newTask = await createTask(data as Partial<Task>);
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

  const handleStartTimer = async (id: string) => {
    try {
      await startTimer(id);
      toast.success('Cronómetro iniciado');
    } catch (error) {
      const err = error as Error;
      toast.error(err.message || 'Error al iniciar cronómetro');
    }
  };

  const handleStopTimer = async (id: string) => {
    try {
      await stopTimer(id);
      toast.success('Cronómetro detenido');
    } catch (error) {
      const err = error as Error;
      toast.error(err.message || 'Error al detener cronómetro');
    }
  };

  const handleReturnToInbox = async (emailId: string) => {
    try {
      await updateEmailStatus(emailId, 'PENDING', true);
      toast.success('Correo devuelto a la bandeja');
    } catch (error) {
      const err = error as Error;
      toast.error(err.message || 'Error al regresar correo');
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 transition-colors rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 whitespace-nowrap"
            >
              <span>📊</span> Reporte
            </button>
            <button 
              onClick={() => setIsTagModalOpen(true)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 dark:bg-slate-700 dark:text-slate-200 transition-colors rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 whitespace-nowrap"
            >
              <span>🏷️</span> Etiquetas
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 whitespace-nowrap"
            >
              + Nueva Tarea
            </button>
          </div>
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
          <KanbanColumn id={TaskStatus.TODO} title="Por Hacer" tasks={tasksByStatus.TODO} onDeleteTask={handleDeleteTask} onViewEmail={setSelectedEmailId} onReturnToInbox={handleReturnToInbox} onStartTimer={handleStartTimer} onStopTimer={handleStopTimer} onManageTime={setManagingTimeTaskId} />
          <KanbanColumn id={TaskStatus.IN_PROGRESS} title="En Progreso" tasks={tasksByStatus.IN_PROGRESS} onDeleteTask={handleDeleteTask} onViewEmail={setSelectedEmailId} onReturnToInbox={handleReturnToInbox} onStartTimer={handleStartTimer} onStopTimer={handleStopTimer} onManageTime={setManagingTimeTaskId} />
          <KanbanColumn id={TaskStatus.POSTPONED} title="Pospuestas" tasks={tasksByStatus.POSTPONED} onDeleteTask={handleDeleteTask} onViewEmail={setSelectedEmailId} onReturnToInbox={handleReturnToInbox} onStartTimer={handleStartTimer} onStopTimer={handleStopTimer} onManageTime={setManagingTimeTaskId} />
          <KanbanColumn id={TaskStatus.DONE} title="Cumplidas" tasks={tasksByStatus.DONE} onDeleteTask={handleDeleteTask} onViewEmail={setSelectedEmailId} onReturnToInbox={handleReturnToInbox} onStartTimer={handleStartTimer} onStopTimer={handleStopTimer} onManageTime={setManagingTimeTaskId} />
          <KanbanColumn id={TaskStatus.OVERDUE} title="Atrasadas" tasks={tasksByStatus.OVERDUE} onDeleteTask={handleDeleteTask} onViewEmail={setSelectedEmailId} onReturnToInbox={handleReturnToInbox} onStartTimer={handleStartTimer} onStopTimer={handleStopTimer} onManageTime={setManagingTimeTaskId} />
        </div>
      </DndContext>

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateTask} 
      />

      <TagManagerModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
      />

      <TimeEntriesModal
        isOpen={managingTimeTaskId !== null}
        onClose={() => setManagingTimeTaskId(null)}
        taskId={managingTimeTaskId || ''}
      />

      <TimeReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />

      <EmailDetailModal
        isOpen={selectedEmailId !== null}
        onClose={() => setSelectedEmailId(null)}
        emailId={selectedEmailId}
        readOnly={true}
      />
    </div>
  );
};
