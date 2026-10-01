import type { TimeEntry } from '@pmo/shared';
import type { Task } from '../types';

/**
 * Cómo cambia el tablero cuando arranca o para un cronómetro.
 *
 * Lo usan las dos vías por las que se entera la pantalla: la respuesta del
 * `POST` en la pestaña que pulsa, y el socket en las demás. La pestaña que
 * pulsa no recibe el evento —el servidor la excluye con `X-Socket-Id`—, así que
 * si no aplicara la respuesta no vería nada hasta recargar (ALANA §88.3).
 *
 * Las dos funciones son **idempotentes**: si el eco llega de todas formas (sin
 * socket conectado no hay `X-Socket-Id` que excluir), aplicarlo otra vez no
 * suma el tiempo dos veces.
 */

function segundos(desde: string, hasta: string): number {
  return Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000));
}

/**
 * La tarea de `entry` pasa a tener el cronómetro en marcha.
 *
 * Con `cerrarOtros`, además se paran en pantalla los demás que corrieran: el
 * servidor solo admite uno por persona y, al arrancar sobre otra tarea, cierra
 * el anterior en el mismo instante (`time.service.ts`, `start`). Ese cierre le
 * llega a las demás pestañas como su propio `time:stopped`, pero no a la que
 * pulsa, que lo deduce aquí: mismo instante, misma duración.
 */
export function conCronometroEnMarcha(tasks: Task[], entry: TimeEntry, cerrarOtros = false): Task[] {
  return tasks.map((t) => {
    if (t.id === entry.taskId) {
      return { ...t, activeTimeStartedAt: entry.startedAt, activeTimeEntryId: entry.id };
    }
    if (cerrarOtros && t.activeTimeStartedAt) {
      return {
        ...t,
        activeTimeStartedAt: null,
        activeTimeEntryId: null,
        totalTimeSec: (t.totalTimeSec || 0) + segundos(t.activeTimeStartedAt, entry.startedAt),
      };
    }
    return t;
  });
}

/**
 * La tarea de `entry` deja de tener el cronómetro en marcha y suma lo fichado.
 *
 * Solo si en pantalla seguía corriendo: un segundo aviso del mismo cierre no
 * vuelve a sumar.
 */
export function conCronometroParado(tasks: Task[], entry: TimeEntry): Task[] {
  return tasks.map((t) => {
    if (t.id !== entry.taskId || !t.activeTimeStartedAt) return t;
    if (t.activeTimeEntryId && t.activeTimeEntryId !== entry.id) return t;
    return {
      ...t,
      activeTimeStartedAt: null,
      activeTimeEntryId: null,
      totalTimeSec: (t.totalTimeSec || 0) + (entry.durationSec || 0),
    };
  });
}
