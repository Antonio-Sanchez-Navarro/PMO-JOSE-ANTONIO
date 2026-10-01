import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, TimeEntry } from '@pmo/shared';
import { conCronometroEnMarcha, conCronometroParado } from '../utils/cronometro';

// ALANA §88.3: quien pulsa el cronómetro no veía el cambio hasta recargar. El
// servidor no le manda el evento (lo excluye con `X-Socket-Id`) y el tablero no
// usaba la respuesta del POST. Aquí no hay socket: si el cronómetro aparece, es
// porque el tablero aplicó lo que devolvió la API.

const api = vi.hoisted(() => ({
  fetchTasks: vi.fn(),
  getActiveTimeEntry: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  socket: {} as Record<string, ((p: unknown) => void) | undefined>,
}));

vi.mock('../api/tasks.api', () => ({
  fetchTasks: api.fetchTasks,
  moveTask: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateEmailStatus: vi.fn(),
  toggleSubtask: vi.fn(),
}));
vi.mock('../api/obras.api', () => ({ fetchObras: vi.fn().mockResolvedValue([]) }));
vi.mock('../api/time.api', () => ({
  getActiveTimeEntry: api.getActiveTimeEntry,
  startTimer: api.startTimer,
  stopTimer: api.stopTimer,
}));
vi.mock('../hooks/useSocket', () => ({
  useSocket: (handlers: Record<string, (p: unknown) => void>) => {
    api.socket = handlers;
  },
}));
vi.mock('../hooks/useTags', () => ({ useTags: () => ({ tags: [], refreshTags: vi.fn() }) }));
vi.mock('./TaskModal', () => ({ TaskModal: () => null }));
vi.mock('./TagManagerModal', () => ({ TagManagerModal: () => null }));
vi.mock('./TimeEntriesModal', () => ({ TimeEntriesModal: () => null }));
vi.mock('./TimeReportModal', () => ({ TimeReportModal: () => null }));
vi.mock('../../inbox/components/EmailDetailModal', () => ({ EmailDetailModal: () => null }));

// La columna de verdad trae dnd-kit y la tarjeta; aquí solo hace falta ver el
// estado del cronómetro de cada tarea y poder pulsarlo.
vi.mock('./KanbanColumn', () => ({
  KanbanColumn: ({
    tasks,
    onStartTimer,
    onStopTimer,
  }: {
    tasks: Task[];
    onStartTimer: (id: string) => void;
    onStopTimer: (id: string) => void;
  }) => (
    <div>
      {tasks.map((t) => (
        <div key={t.id} data-testid={`tarea-${t.id}`}>
          <span data-testid={`reloj-${t.id}`}>
            {t.activeTimeStartedAt ? 'en marcha' : 'parado'} · {t.totalTimeSec ?? 0}s
          </span>
          <button onClick={() => onStartTimer(t.id)}>arrancar {t.id}</button>
          <button onClick={() => onStopTimer(t.id)}>parar {t.id}</button>
        </div>
      ))}
    </div>
  ),
}));

import { KanbanBoard } from './KanbanBoard';

function tarea(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: `Tarea ${id}`, status: 'TODO', priority: 'MEDIUM', totalTimeSec: 0, ...extra } as Task;
}

function fichaje(taskId: string, extra: Partial<TimeEntry> = {}): TimeEntry {
  return { id: `f-${taskId}`, taskId, startedAt: '2026-10-01T18:00:00.000Z', ...extra } as TimeEntry;
}

const reloj = (id: string) => screen.getByTestId(`reloj-${id}`).textContent;

describe('KanbanBoard · cronómetro en la pestaña que pulsa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getActiveTimeEntry.mockResolvedValue(null);
  });

  it('al arrancar, el cronómetro aparece sin recargar', async () => {
    api.fetchTasks.mockResolvedValue([tarea('a')]);
    api.startTimer.mockResolvedValue(fichaje('a'));
    render(<KanbanBoard />);
    await screen.findByTestId('tarea-a');

    fireEvent.click(screen.getByText('arrancar a'));

    await waitFor(() => expect(reloj('a')).toContain('en marcha'));
    expect(api.fetchTasks).toHaveBeenCalledTimes(1);
  });

  it('al parar, el cronómetro desaparece y suma lo fichado', async () => {
    api.fetchTasks.mockResolvedValue([tarea('a', { totalTimeSec: 10 })]);
    api.getActiveTimeEntry.mockResolvedValue(fichaje('a'));
    api.stopTimer.mockResolvedValue(fichaje('a', { endedAt: '2026-10-01T18:01:00.000Z', durationSec: 60 }));
    render(<KanbanBoard />);
    await waitFor(() => expect(reloj('a')).toContain('en marcha'));

    fireEvent.click(screen.getByText('parar a'));

    await waitFor(() => expect(reloj('a')).toBe('parado · 70s'));
  });

  it('si el POST falla, la pantalla no cambia', async () => {
    api.fetchTasks.mockResolvedValue([tarea('a')]);
    api.startTimer.mockRejectedValue(new Error('Ya tienes un cronómetro en marcha.'));
    render(<KanbanBoard />);
    await screen.findByTestId('tarea-a');

    fireEvent.click(screen.getByText('arrancar a'));

    await waitFor(() => expect(api.startTimer).toHaveBeenCalled());
    expect(reloj('a')).toContain('parado');
  });

  it('arrancar en otra tarea para en pantalla la que corría, como hace el servidor', async () => {
    api.fetchTasks.mockResolvedValue([tarea('a'), tarea('b')]);
    api.getActiveTimeEntry.mockResolvedValue(fichaje('a'));
    api.startTimer.mockResolvedValue(fichaje('b', { startedAt: '2026-10-01T18:02:00.000Z' }));
    render(<KanbanBoard />);
    await waitFor(() => expect(reloj('a')).toContain('en marcha'));

    fireEvent.click(screen.getByText('arrancar b'));

    await waitFor(() => expect(reloj('b')).toContain('en marcha'));
    expect(reloj('a')).toBe('parado · 120s');
  });

  it('si además llega el eco por el socket, no se pinta ni se suma dos veces', async () => {
    api.fetchTasks.mockResolvedValue([tarea('a')]);
    api.getActiveTimeEntry.mockResolvedValue(fichaje('a'));
    const parado = fichaje('a', { endedAt: '2026-10-01T18:01:00.000Z', durationSec: 60 });
    api.stopTimer.mockResolvedValue(parado);
    render(<KanbanBoard />);
    await waitFor(() => expect(reloj('a')).toContain('en marcha'));

    fireEvent.click(screen.getByText('parar a'));
    await waitFor(() => expect(reloj('a')).toBe('parado · 60s'));
    act(() => api.socket.onTimeStopped?.(parado));

    expect(reloj('a')).toBe('parado · 60s');
  });

  it('otra pestaña se entera por el socket', async () => {
    api.fetchTasks.mockResolvedValue([tarea('a')]);
    render(<KanbanBoard />);
    await screen.findByTestId('tarea-a');

    act(() => api.socket.onTimeStarted?.(fichaje('a')));
    expect(reloj('a')).toContain('en marcha');

    act(() => api.socket.onTimeStopped?.(fichaje('a', { durationSec: 30 })));
    expect(reloj('a')).toBe('parado · 30s');
  });
});

describe('cronometro · funciones puras', () => {
  it('parar una tarea que no corría no suma nada', () => {
    const tareas = [tarea('a', { totalTimeSec: 5 })];
    expect(conCronometroParado(tareas, fichaje('a', { durationSec: 60 }))).toEqual(tareas);
  });

  it('un time:started por el socket no cierra los demás (su cierre llega aparte)', () => {
    const tareas = [tarea('a', { activeTimeStartedAt: '2026-10-01T18:00:00.000Z', activeTimeEntryId: 'f-a' }), tarea('b')];
    const r = conCronometroEnMarcha(tareas, fichaje('b', { startedAt: '2026-10-01T18:05:00.000Z' }));
    expect(r[0].activeTimeStartedAt).toBe('2026-10-01T18:00:00.000Z');
    expect(r[1].activeTimeStartedAt).toBe('2026-10-01T18:05:00.000Z');
  });
});
