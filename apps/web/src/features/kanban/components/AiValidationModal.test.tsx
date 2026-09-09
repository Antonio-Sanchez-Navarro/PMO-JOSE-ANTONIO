import { fireEvent, render, screen } from '@testing-library/react';
import { EmailCategory, TaskPriority, type EmailClassification } from '@pmo/shared';
import { describe, expect, it, vi } from 'vitest';
import { AiValidationModal } from './AiValidationModal';

// El modal pide las etiquetas al montar. Aquí no hay API, y tampoco hace falta:
// lo que se comprueba es cómo se sale de la pantalla, no cómo se etiqueta.
vi.mock('../hooks/useTags', () => ({
  useTags: () => ({ tags: [], refreshTags: vi.fn() }),
}));

const propuesta: EmailClassification = {
  emailId: 'email-1',
  category: EmailCategory.PROJECT_MANAGEMENT,
  isActionable: true,
  aiConfidence: 0.9,
  tasks: [
    {
      title: 'Enviar el presupuesto revisado',
      description: 'Antes del viernes.',
      priority: TaskPriority.HIGH,
      tags: [],
      tagIds: [],
      dueDate: null,
    },
  ],
};

function pintar(props: Partial<React.ComponentProps<typeof AiValidationModal>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(
    <AiValidationModal
      isOpen
      proposal={propuesta}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { ...utils, onCancel, onConfirm };
}

describe('AiValidationModal', () => {
  it('no pinta nada mientras está cerrado', () => {
    render(
      <AiValidationModal
        isOpen={false}
        proposal={propuesta}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText('Enviar el presupuesto revisado')).not.toBeInTheDocument();
  });

  it('enseña las tareas propuestas y cuántas son', () => {
    pintar();
    expect(screen.getByDisplayValue('Enviar el presupuesto revisado')).toBeInTheDocument();
    expect(screen.getByText('Tareas Propuestas (1)')).toBeInTheDocument();
  });

  it('avisa de los adjuntos que el modelo no ha leído', () => {
    pintar({ hasAttachments: true });
    expect(screen.getByText(/no ha leído su contenido/i)).toBeInTheDocument();
  });

  it('no inventa el aviso cuando el correo no trae adjuntos', () => {
    pintar();
    expect(screen.queryByText(/no ha leído su contenido/i)).not.toBeInTheDocument();
  });

  // ── Salida no destructiva (hallazgo C7) ────────────────────────────────
  //
  // Las tres vías que la auditoría comprobó que no existían. Si alguna vuelve a
  // caerse, el usuario queda otra vez obligado a decidir para poder salir.

  it('cierra con Escape', () => {
    const { onCancel } = pintar();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cierra con la X de la cabecera', () => {
    const { onCancel } = pintar();
    // Por el `title` y no por la etiqueta: el botón del pie lleva ese mismo
    // texto, así que `getByLabelText` encuentra dos y no sabe cuál quieres.
    fireEvent.click(screen.getByTitle(/^Cerrar sin cambios \(Esc\)/));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cierra al pulsar fuera del diálogo', () => {
    const { container, onCancel } = pintar();
    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('no cierra al pulsar dentro del diálogo', () => {
    const { container, onCancel } = pintar();
    const dialogo = (container.firstChild as HTMLElement).firstChild as HTMLElement;
    fireEvent.mouseDown(dialogo);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ninguna de las salidas crea tareas', () => {
    const { onCancel, onConfirm } = pintar();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('el botón de reanalizar solo aparece si hay a quién pedírselo', () => {
    const { rerender } = render(
      <AiValidationModal isOpen proposal={propuesta} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.queryByText(/Reanalizar/i)).not.toBeInTheDocument();

    const onReanalyze = vi.fn();
    rerender(
      <AiValidationModal
        isOpen
        proposal={propuesta}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onReanalyze={onReanalyze}
      />,
    );
    fireEvent.click(screen.getByText(/Reanalizar/i));
    expect(onReanalyze).toHaveBeenCalledTimes(1);
  });
});
