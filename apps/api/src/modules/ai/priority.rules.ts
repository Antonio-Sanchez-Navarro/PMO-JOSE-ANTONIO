import { TaskPriority } from '@prisma/client';

/**
 * Capa determinista de ajuste de prioridad (Sprint 3).
 *
 * El modelo decide la prioridad leyendo el tono del correo, y el tono engaña:
 * un "cuando puedas" con fecha para mañana es más urgente que un "URGENTE" sin
 * fecha. Esta capa corrige eso con una sola señal dura —la fecha de
 * vencimiento— y no toca nada más.
 *
 * Es una función pura y sin dependencias a propósito: la decisión tiene que
 * poder explicarse y probarse sin llamar a Anthropic ni a la base de datos.
 */

/** Orden de las prioridades. Vive aquí porque el enum de Prisma no lo expone. */
const RANK: Record<TaskPriority, number> = {
  [TaskPriority.LOW]: 0,
  [TaskPriority.MEDIUM]: 1,
  [TaskPriority.HIGH]: 2,
  [TaskPriority.URGENT]: 3,
};

/** Menos de 24 h para vencer (o ya vencida) ⇒ al menos URGENT. */
export const URGENT_WINDOW_HOURS = 24;

/** Menos de 72 h ⇒ al menos HIGH. */
export const HIGH_WINDOW_HOURS = 72;

/**
 * Por debajo de esta confianza no se escala sin una fecha que lo justifique.
 * En la práctica no cambia el resultado —la fecha es el único disparador— pero
 * deja el criterio explícito por si algún día se escala por otra señal.
 */
export const MIN_CONFIDENCE_FOR_ESCALATION = 0.5;

export interface PriorityInput {
  /** Lo que dijo el modelo. */
  priority: TaskPriority;
  dueDate: Date | null | undefined;
  aiConfidence: number | null | undefined;
}

export interface PriorityDecision {
  priority: TaskPriority;
  /** `true` si la capa cambió lo que dijo el modelo. */
  adjusted: boolean;
  /** Explicación en una línea, para el log y para el futuro panel de auditoría. */
  reason: string;
}

/**
 * Sube la prioridad si la fecha de vencimiento aprieta. **Nunca la baja**: el
 * modelo ve el contenido del correo y esta capa solo mira el calendario, así
 * que puede añadir urgencia pero no quitársela.
 *
 * @param now instante de referencia; inyectable para las pruebas.
 */
export function adjustPriority(input: PriorityInput, now: Date = new Date()): PriorityDecision {
  const { priority, dueDate, aiConfidence } = input;
  const keep = (reason: string): PriorityDecision => ({ priority, adjusted: false, reason });

  // Una fecha inválida (`new Date('vaya')`) llegaría hasta aquí como Date y
  // envenenaría la resta: se trata como si no hubiera fecha.
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return keep(`sin fecha de vencimiento: se respeta ${priority}`);
  }

  const hours = (dueDate.getTime() - now.getTime()) / 3_600_000;

  const floor =
    hours < URGENT_WINDOW_HOURS
      ? TaskPriority.URGENT
      : hours < HIGH_WINDOW_HOURS
        ? TaskPriority.HIGH
        : null;

  if (!floor) {
    return keep(`vence en ${format(hours)} (fuera de ventana): se respeta ${priority}`);
  }

  // Confianza baja: solo se escala porque hay fecha, que es un dato del
  // calendario y no una interpretación del modelo.
  const lowConfidence =
    typeof aiConfidence === 'number' && aiConfidence < MIN_CONFIDENCE_FOR_ESCALATION;

  if (RANK[priority] >= RANK[floor]) {
    return keep(`vence en ${format(hours)} pero ${priority} ya lo cubre`);
  }

  const window = floor === TaskPriority.URGENT ? URGENT_WINDOW_HOURS : HIGH_WINDOW_HOURS;
  const confidenceNote = lowConfidence ? ` (aiConfidence ${aiConfidence}, escalado por la fecha)` : '';

  return {
    priority: floor,
    adjusted: true,
    reason:
      hours < 0
        ? `venció hace ${format(-hours)}: ${priority} → ${floor}${confidenceNote}`
        : `vence en ${format(hours)} (<${window} h): ${priority} → ${floor}${confidenceNote}`,
  };
}

function format(hours: number): string {
  return `${Math.round(hours * 10) / 10} h`;
}
