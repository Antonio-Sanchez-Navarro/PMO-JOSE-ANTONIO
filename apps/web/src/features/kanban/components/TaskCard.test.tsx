import React from 'react';
import { render, screen } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import { describe, it, expect, vi } from 'vitest';
import { TaskPriority, TaskSource } from '../types';

vi.mock('../../copilot/CopilotContext', () => ({
  useCopilot: () => ({ openCopilotWithContext: vi.fn() }),
}));

describe('TaskCard', () => {
  const baseTask = {
    id: '1',
    title: 'Test Task',
    status: 'TODO' as const,
    priority: TaskPriority.MEDIUM,
    source: TaskSource.MANUAL,
    subtasks: [],
    labels: [],
  };

  it('debería mostrar 3 etiquetas y un chip +N cuando tiene 10 etiquetas', () => {
    const taskWith10Labels = {
      ...baseTask,
      labels: Array.from({ length: 10 }).map((_, i) => ({
        id: `lbl-${i}`,
        name: `Label ${i + 1}`,
        color: '#ff0000',
      })),
    };

    render(<TaskCard task={taskWith10Labels} />);
    
    // Deberían estar las 3 primeras etiquetas
    expect(screen.getByText('Label 1')).toBeInTheDocument();
    expect(screen.getByText('Label 2')).toBeInTheDocument();
    expect(screen.getByText('Label 3')).toBeInTheDocument();
    
    // No debería estar la etiqueta 4
    expect(screen.queryByText('Label 4')).not.toBeInTheDocument();
    
    // Debería estar el chip +7
    const plusChip = screen.getByText('+7');
    expect(plusChip).toBeInTheDocument();
    expect(plusChip).toHaveAttribute('title', 'Label 1, Label 2, Label 3, Label 4, Label 5, Label 6, Label 7, Label 8, Label 9, Label 10');
  });

  it('no debería mostrar chip +N si tiene 3 etiquetas o menos', () => {
    const taskWith3Labels = {
      ...baseTask,
      labels: Array.from({ length: 3 }).map((_, i) => ({
        id: `lbl-${i}`,
        name: `Label ${i + 1}`,
        color: '#ff0000',
      })),
    };

    render(<TaskCard task={taskWith3Labels} />);
    
    expect(screen.getByText('Label 1')).toBeInTheDocument();
    expect(screen.getByText('Label 2')).toBeInTheDocument();
    expect(screen.getByText('Label 3')).toBeInTheDocument();
    
    expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
  });
});
