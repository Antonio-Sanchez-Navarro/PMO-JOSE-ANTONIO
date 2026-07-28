/**
 * Prefijo de contexto en el título de la tarea (Sprint 4).
 *
 * Encargo de Doc: que cada tarea nacida de un correo diga de quién y de qué
 * proyecto viene, con la forma `[Astrid R. - Citrotarte 1/3] Solicitar…`, para
 * que el tablero no se vuelva una lista de frases sueltas sin contexto.
 *
 * **El modelo extrae, el código compone.** La instrucción original pedía que la
 * IA escribiera el prefijo entero, contador incluido. Se hace en dos pasos por
 * dos motivos concretos:
 *
 * 1. **El contador tiene que cuadrar siempre.** Un modelo que numera a mano se
 *    equivoca, y además nosotros descartamos tareas después de que él responda
 *    (el filtro de accionables, el respaldo desde el asunto): un `2/4` escrito
 *    por el modelo se quedaría mintiendo en cuanto la lista cambiara de tamaño.
 * 2. **El formato no se negocia.** Compuesto aquí, los corchetes, el guion y la
 *    abreviatura salen idénticos en las miles de tareas siguientes; pedido en
 *    prosa, deriva.
 *
 * Es una función pura, como `priority.rules.ts`, para poder probarla sin llamar
 * a Anthropic.
 */

/** Lo que el modelo extrae del correo para construir el prefijo. */
export interface TaskContext {
  /** Remitente abreviado tal y como lo devuelve el modelo: "Astrid R.". */
  senderName?: string | null;
  /** Proyecto, obra o asunto al que pertenece el correo: "Citrotarte". */
  project?: string | null;
}

/** Tope de `title` en la base y en los DTOs. */
export const MAX_TITLE_LENGTH = 300;

/** Un título que ya empieza por `[...]` se considera prefijado. */
const YA_PREFIJADO = /^\s*\[[^\]]+\]/;

const limpiar = (valor: string | null | undefined): string =>
  (valor ?? '').replace(/\s+/g, ' ').trim();

/**
 * Devuelve los títulos con su prefijo de contexto.
 *
 * - Sin remitente ni proyecto no hay prefijo posible: los títulos salen intactos
 *   en vez de inventarse un `[Desconocido]` que ensuciaría el tablero.
 * - El contador solo aparece cuando el correo detona **más de una** tarea. En
 *   una tarea suelta, `1/1` no informa de nada.
 * - **Es idempotente**: un título ya prefijado se deja como está, para que
 *   reprocesar un correo no acabe en `[A. - X 1/2] [A. - X 1/2] …`.
 * - Si el resultado se pasa del tope, se recorta **el cuerpo y nunca el
 *   prefijo**: el contexto es justo lo que no se puede perder.
 */
export function withContextPrefix(titles: string[], context: TaskContext): string[] {
  const sender = limpiar(context.senderName);
  const project = limpiar(context.project);

  const partes = [sender, project].filter(Boolean);
  if (partes.length === 0) return titles.map((t) => t.trim());

  const total = titles.length;

  return titles.map((title, index) => {
    const limpio = title.trim();
    if (YA_PREFIJADO.test(limpio)) return limpio;

    const contador = total > 1 ? ` ${index + 1}/${total}` : '';
    const prefijo = `[${partes.join(' - ')}${contador}] `;

    if (prefijo.length + limpio.length <= MAX_TITLE_LENGTH) return prefijo + limpio;

    // El recorte deja el prefijo entero y corta el cuerpo, con puntos
    // suspensivos para que se vea que hay más texto detrás.
    const espacio = MAX_TITLE_LENGTH - prefijo.length;
    if (espacio <= 1) return prefijo.slice(0, MAX_TITLE_LENGTH).trimEnd();
    return prefijo + limpio.slice(0, espacio - 1).trimEnd() + '…';
  });
}
