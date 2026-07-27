import { TaskPriority } from '@prisma/client';
import { adjustPriority, HIGH_WINDOW_HOURS, URGENT_WINDOW_HOURS } from './priority.rules';

const NOW = new Date('2026-07-27T12:00:00.000Z');

/** Fecha a `h` horas de `NOW` (negativa = ya vencida). */
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

const decide = (priority: TaskPriority, dueDate: Date | null, aiConfidence: number | null = 0.9) =>
  adjustPriority({ priority, dueDate, aiConfidence }, NOW);

describe('adjustPriority — capa determinista de prioridad', () => {
  describe('sin señal de fecha', () => {
    it('respeta al modelo si no hay dueDate', () => {
      const d = decide(TaskPriority.LOW, null);

      expect(d.priority).toBe(TaskPriority.LOW);
      expect(d.adjusted).toBe(false);
    });

    it('trata una fecha inválida como ausencia de fecha', () => {
      const d = decide(TaskPriority.MEDIUM, new Date('no es una fecha'));

      expect(d.priority).toBe(TaskPriority.MEDIUM);
      expect(d.adjusted).toBe(false);
    });

    it('no escala si vence más allá de la ventana de 72 h', () => {
      const d = decide(TaskPriority.LOW, inHours(HIGH_WINDOW_HOURS + 1));

      expect(d.priority).toBe(TaskPriority.LOW);
      expect(d.adjusted).toBe(false);
    });
  });

  describe('escalado por cercanía del vencimiento', () => {
    it('sube a URGENT si vence en menos de 24 h', () => {
      const d = decide(TaskPriority.MEDIUM, inHours(5));

      expect(d.priority).toBe(TaskPriority.URGENT);
      expect(d.adjusted).toBe(true);
      expect(d.reason).toContain('MEDIUM → URGENT');
    });

    it('sube a HIGH si vence entre 24 h y 72 h', () => {
      const d = decide(TaskPriority.LOW, inHours(48));

      expect(d.priority).toBe(TaskPriority.HIGH);
      expect(d.adjusted).toBe(true);
    });

    it('trata una tarea ya vencida como urgente', () => {
      const d = decide(TaskPriority.LOW, inHours(-10));

      expect(d.priority).toBe(TaskPriority.URGENT);
      expect(d.reason).toContain('venció hace');
    });
  });

  describe('fronteras exactas de las ventanas', () => {
    it('a exactamente 24 h no es URGENT, sino HIGH', () => {
      const d = decide(TaskPriority.LOW, inHours(URGENT_WINDOW_HOURS));

      expect(d.priority).toBe(TaskPriority.HIGH);
    });

    it('a exactamente 72 h no escala', () => {
      const d = decide(TaskPriority.LOW, inHours(HIGH_WINDOW_HOURS));

      expect(d.priority).toBe(TaskPriority.LOW);
      expect(d.adjusted).toBe(false);
    });

    it('justo por debajo de 24 h sí es URGENT', () => {
      const d = decide(TaskPriority.LOW, inHours(URGENT_WINDOW_HOURS - 0.1));

      expect(d.priority).toBe(TaskPriority.URGENT);
    });
  });

  describe('la capa nunca baja la prioridad', () => {
    it('mantiene URGENT aunque la fecha esté lejos', () => {
      const d = decide(TaskPriority.URGENT, inHours(500));

      expect(d.priority).toBe(TaskPriority.URGENT);
      expect(d.adjusted).toBe(false);
    });

    it('mantiene URGENT en la ventana de HIGH', () => {
      const d = decide(TaskPriority.URGENT, inHours(48));

      expect(d.priority).toBe(TaskPriority.URGENT);
      expect(d.adjusted).toBe(false);
      expect(d.reason).toContain('ya lo cubre');
    });

    it('no marca ajuste cuando el modelo ya había puesto el mismo valor', () => {
      const d = decide(TaskPriority.URGENT, inHours(2));

      expect(d.priority).toBe(TaskPriority.URGENT);
      expect(d.adjusted).toBe(false);
    });
  });

  describe('confianza baja del modelo', () => {
    it('escala igualmente con aiConfidence < 0.5, porque el disparador es la fecha', () => {
      const d = decide(TaskPriority.LOW, inHours(3), 0.2);

      expect(d.priority).toBe(TaskPriority.URGENT);
      expect(d.adjusted).toBe(true);
      expect(d.reason).toContain('escalado por la fecha');
    });

    it('sigue sin escalar con confianza baja y sin fecha', () => {
      const d = decide(TaskPriority.LOW, null, 0.2);

      expect(d.priority).toBe(TaskPriority.LOW);
      expect(d.adjusted).toBe(false);
    });

    it('tolera aiConfidence nulo', () => {
      const d = decide(TaskPriority.MEDIUM, inHours(3), null);

      expect(d.priority).toBe(TaskPriority.URGENT);
    });
  });
});
