import { render, screen, fireEvent } from '@testing-library/react';
import { TaskModal } from './TaskModal';
import { describe, it, expect, vi } from 'vitest';
import { TaskSource, TaskStatus, TaskPriority } from '../types';

describe('TaskModal', () => {
  const mockTask = {
    id: '1',
    title: 'Test Task',
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    source: TaskSource.MANUAL,
    tags: [],
    labels: [],
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtasks: [
      { id: 's1', taskId: '1', title: 'Sub 1', isCompleted: false, order: 0 },
    ],
  };

  it('debería cerrar el modal al pulsar la X', () => {
    const onClose = vi.fn();
    render(<TaskModal isOpen={true} onClose={onClose} task={mockTask} />);
    const closeBtn = screen.getByTitle('Cerrar modal');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('debería cerrar el modal al pulsar el botón Cerrar del pie', () => {
    const onClose = vi.fn();
    render(<TaskModal isOpen={true} onClose={onClose} task={mockTask} />);
    const closeBtn = screen.getByText('Cerrar');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('debería cerrar el modal al pulsar la tecla Escape', () => {
    const onClose = vi.fn();
    render(<TaskModal isOpen={true} onClose={onClose} task={mockTask} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('debería cerrar el modal al pulsar el fondo oscuro', () => {
    const onClose = vi.fn();
    render(<TaskModal isOpen={true} onClose={onClose} task={mockTask} />);
    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('no debería cerrar el modal al pulsar dentro del contenido', () => {
    const onClose = vi.fn();
    render(<TaskModal isOpen={true} onClose={onClose} task={mockTask} />);
    const content = screen.getByTestId('modal-content');
    fireEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marcar una subtarea no debería propagar el click ni cerrar el modal', () => {
    const onClose = vi.fn();
    const onToggle = vi.fn();
    render(<TaskModal isOpen={true} onClose={onClose} task={mockTask} onToggleSubtask={onToggle} />);
    
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    
    expect(onToggle).toHaveBeenCalledWith('1', 's1', true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('debería mostrar todas las etiquetas de la tarea en el modal', () => {
    const taskWithLabels = {
      ...mockTask,
      labels: [
        { id: '1', name: 'Label 1', color: '#f00' },
        { id: '2', name: 'Label 2', color: '#0f0' },
        { id: '3', name: 'Label 3', color: '#00f' },
        { id: '4', name: 'Label 4', color: '#ff0' },
      ],
    };
    render(<TaskModal isOpen={true} onClose={vi.fn()} task={taskWithLabels} />);
    expect(screen.getByText('Label 1')).toBeInTheDocument();
    expect(screen.getByText('Label 2')).toBeInTheDocument();
    expect(screen.getByText('Label 3')).toBeInTheDocument();
    expect(screen.getByText('Label 4')).toBeInTheDocument();
  });
});
