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

/**
 * Abrevia el remitente a partir de la cabecera `From` del correo.
 *
 * Decisión de Doc el 2026-07-28: el remitente sale de la cabecera y no del
 * modelo. Pedírselo al modelo daba resultados razonables pero no fiables —en un
 * correo de Josmat Narváez eligió "Dinorah L.", la persona de la que hablaba el
 * cuerpo— y aquí lo que se quiere es consistencia: quién lo mandó es un dato
 * duro, no una interpretación. El contexto del cliente ya lo aporta `project`.
 *
 * Acepta las formas habituales: `Astrid Robles <a@x.mx>`, `"Robles, Astrid"
 * <a@x.mx>` o un correo pelado. Devuelve `null` si no hay nada aprovechable,
 * porque un prefijo inventado es peor que ninguno.
 */
export function senderFromHeader(from: string | null | undefined): string | null {
  const crudo = limpiar(from);
  if (!crudo) return null;

  const conAngulos = crudo.match(/^(.*?)<([^>]+)>\s*$/);
  // Sin ángulos hay dos formas posibles: un nombre suelto ("Josmat Narvaez") o
  // un correo pelado. Lo que no lleva arroba se trata como nombre.
  const visible = conAngulos ? conAngulos[1] : crudo.includes('@') ? '' : crudo;
  const display = limpiar(visible).replace(/^["']|["']$/g, '').trim();
  const direccion = limpiar(conAngulos?.[2]) || (crudo.includes('@') ? crudo : '');

  // Sin nombre visible se recurre a la parte local del correo: "josmat.narvaez"
  // da "Josmat N.", que sigue siendo más útil que no poner nada.
  const base = display || direccion.split('@')[0].replace(/[._-]+/g, ' ');
  if (!base) return null;

  // "Robles, Astrid" viene del formato apellido-primero de algunos clientes.
  const normalizado = base.includes(',')
    ? base.split(',').map((p) => p.trim()).reverse().join(' ')
    : base;

  const todas = normalizado.split(/\s+/).filter((p) => /\p{L}/u.test(p));
  // Los tratamientos van delante del nombre y no identifican a nadie: sin esto,
  // "Arq. Elena Ruiz" salía como "Arq. R." en vez de "Elena R.".
  const palabras = quitarTratamientos(todas);
  if (palabras.length === 0) return null;

  const capitalizar = (p: string) =>
    p.length <= 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1).toLowerCase();

  const nombre = capitalizar(palabras[0]);
  if (palabras.length === 1) return nombre;

  const apellido = palabras[palabras.length - 1];
  // Un apellido ya abreviado ("R." o "R") no se vuelve a abreviar.
  const inicial = apellido.replace('.', '')[0]?.toUpperCase();
  return inicial ? `${nombre} ${inicial}.` : nombre;
}

/** Un título que ya empieza por `[...]` se considera prefijado. */
const YA_PREFIJADO = /^\s*\[[^\]]+\]/;

const limpiar = (valor: string | null | undefined): string =>
  (valor ?? '').replace(/\s+/g, ' ').trim();

/**
 * Tratamientos que preceden al nombre en la firma de un correo. Se descartan
 * porque no identifican a nadie: en un despacho, media bandeja empezaría por
 * "Lic.".
 */
const TRATAMIENTOS = new Set([
  'arq',
  'ing',
  'lic',
  'dr',
  'dra',
  'sr',
  'sra',
  'srta',
  'mtro',
  'mtra',
  'cp',
  'cpa',
  'abg',
  'prof',
  'don',
  // Sin tilde ni eñe: la comparación normaliza los acentos antes de buscar.
  'dona',
]);

/** Quita los tratamientos del principio, salvo que no quede nada detrás. */
function quitarTratamientos(palabras: string[]): string[] {
  let i = 0;
  while (i < palabras.length - 1) {
    const normalizada = palabras[i]
      .toLowerCase()
      .replace(/\./g, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    if (!TRATAMIENTOS.has(normalizada)) break;
    i += 1;
  }
  return palabras.slice(i);
}

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
