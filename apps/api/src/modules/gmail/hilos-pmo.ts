/**
 * Qué mensajes de un hilo etiquetado PMO entran en una sincronización completa (I.2).
 *
 * La etiqueta de Gmail va **por mensaje**: las respuestas que llegan o salen
 * después de etiquetar un hilo no la llevan. La vía incremental las trae igual
 * (`history.list` con `labelId` avisa de lo que se añade a un hilo etiquetado),
 * pero `backfill` y `getInbox` pedían `messages.list` con la etiqueta, que filtra
 * por mensaje: una resincronización perdía las respuestas del Jefe y del equipo.
 *
 * Ahora se piden los **hilos** con la etiqueta y, de cada uno, entra:
 *
 * - **desde el mensaje etiquetado más antiguo** del hilo, incluido. Lo anterior a
 *   la etiqueta es la historia previa a que el hilo importara; si hace falta,
 *   ya viaja citado dentro del primer mensaje que sí entra;
 * - y **nunca un mensaje de más de 90 días**, aunque cumpla lo anterior: es el
 *   tope que impide que etiquetar hoy un hilo de hace un año resucite la bandeja.
 */

/** Ningún mensaje más antiguo que esto entra por un backfill, cumpla lo que cumpla. */
export const TOPE_DIAS_HILO = 90;

/** Lo que devuelve `threads.get` con `format: 'minimal'` de cada mensaje. */
export interface MensajeDeHilo {
  id?: string | null;
  labelIds?: string[] | null;
  /** Milisegundos desde 1970, como cadena: así lo da la API de Gmail. */
  internalDate?: string | null;
}

export function mensajesQueEntran(
  mensajes: MensajeDeHilo[],
  labelId: string,
  ahora: Date = new Date(),
): string[] {
  const conFecha = mensajes
    .filter((m): m is MensajeDeHilo & { id: string } => typeof m.id === 'string' && m.id.length > 0)
    .map((m) => ({ ...m, fecha: Number(m.internalDate) }))
    .filter((m) => Number.isFinite(m.fecha));

  const etiquetados = conFecha.filter((m) => (m.labelIds ?? []).includes(labelId));
  if (etiquetados.length === 0) return [];

  const desde = Math.max(
    Math.min(...etiquetados.map((m) => m.fecha)),
    ahora.getTime() - TOPE_DIAS_HILO * 24 * 3_600_000,
  );

  return conFecha
    .filter((m) => m.fecha >= desde)
    .sort((a, b) => a.fecha - b.fecha)
    .map((m) => m.id);
}
