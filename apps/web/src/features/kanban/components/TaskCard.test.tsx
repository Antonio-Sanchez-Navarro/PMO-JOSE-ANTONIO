import { render, screen } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import { describe, it, expect, vi } from 'vitest';
import { TaskPriority, TaskSource, TaskStatus } from '../types';

vi.mock('../../copilot/CopilotContext', () => ({
  useCopilot: () => ({ openCopilotWithContext: vi.fn() }),
}));

describe('TaskCard', () => {
  const baseTask = {
    id: '1',
    title: 'Test Task',
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    source: TaskSource.MANUAL,
    tags: [],
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtasks: [],
    labels: [],
  };

  it('debería truncar a 3 chips y mostrar +N sumando labels y tags (ej: 10 tags)', () => {
    const taskWith10Tags = {
      ...baseTask,
      labels: [],
      tags: Array.from({ length: 10 }).map((_, i) => `Tag ${i + 1}`),
    };

    render(<TaskCard task={taskWith10Tags} />);
    
    // Deberían estar las 3 primeras etiquetas
    expect(screen.getByText('Tag 1')).toBeInTheDocument();
    expect(screen.getByText('Tag 2')).toBeInTheDocument();
    expect(screen.getByText('Tag 3')).toBeInTheDocument();
    
    // No debería estar la etiqueta 4
    expect(screen.queryByText('Tag 4')).not.toBeInTheDocument();
    
    // Debería estar el chip +7
    const plusChip = screen.getByText('+7');
    expect(plusChip).toBeInTheDocument();
    expect(plusChip).toHaveAttribute('title', 'Tag 1, Tag 2, Tag 3, Tag 4, Tag 5, Tag 6, Tag 7, Tag 8, Tag 9, Tag 10');
  });

  it('no debería mostrar chip +N si la suma de labels y tags es 3 o menos', () => {
    const taskWith3Tags = {
      ...baseTask,
      labels: [{ id: 'lbl-1', name: 'Label 1', color: '#ff0000' }],
      tags: ['Tag 1', 'Tag 2'],
    };

    render(<TaskCard task={taskWith3Tags} />);
    
    expect(screen.getByText('Label 1')).toBeInTheDocument();
    expect(screen.getByText('Tag 1')).toBeInTheDocument();
    expect(screen.getByText('Tag 2')).toBeInTheDocument();
    
    expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
  });
});
