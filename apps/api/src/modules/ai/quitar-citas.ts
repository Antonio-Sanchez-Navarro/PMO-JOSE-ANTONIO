/**
 * Lo nuevo de un correo, sin lo que cita de los anteriores.
 *
 * Cada respuesta de un hilo trae debajo el hilo entero. Mandárselo así al
 * modelo es pagar la misma conversación una vez por mensaje, y además le llena
 * el tope de contexto de repeticiones hasta perder lo más antiguo (F.1: el hilo
 * de seis mensajes del 30-09 llegó recortado a 3 de 5).
 *
 * **Ante la duda, el texto entero.** Quitar de más es perder lo único nuevo del
 * mensaje; quitar de menos es pagar unos tokens de más. Por eso:
 *
 * - Solo se corta en cabeceras de respuesta reconocibles: «El … escribió:»,
 *   «On … wrote:», «-----Mensaje original-----» y los bloques
 *   «De:/Para:/Fecha:/Asunto:» o «From:/Sent:/To:/Subject:» (con al menos tres
 *   de sus cuatro campos seguidos, no un «De:» suelto en una frase).
 * - Las líneas que empiezan por `>` se quitan, estén donde estén.
 * - **Un reenvío no se corta**: lo reenviado es justo lo que el remitente quiere
 *   que se lea, aunque venga con su propio bloque «De:/Fecha:».
 * - Si al cortar no queda texto, se devuelve el original: un correo que es solo
 *   cita no es un correo vacío.
 */

/** «El vie, 25 sept 2026 a la(s) 4:14 p.m., Nombre (correo) escribió:», que Gmail parte en varias líneas. */
const RESPUESTA_ES = /^\s*El\s.{0,300}?escribi[óo]:\s*$/is;
const RESPUESTA_EN = /^\s*On\s.{0,300}?wrote:\s*$/is;
const SEPARADOR_ORIGINAL = /^\s*-{2,}\s*(mensaje original|original message)\s*-{2,}\s*$/i;
const MARCA_REENVIO = /^\s*-{2,}\s*(mensaje reenviado|forwarded message)\s*-{2,}\s*$/i;

/** Campos de un bloque de cabecera de Outlook, en español y en inglés. */
const CAMPO_CABECERA = /^\s*\*?(de|para|cc|fecha|enviado|asunto|from|to|sent|date|subject)\s*:\*?\s*/i;
const CAMPOS_ES = new Set(['de', 'para', 'fecha', 'enviado', 'asunto', 'cc']);
const CAMPOS_EN = new Set(['from', 'to', 'sent', 'date', 'subject', 'cc']);

/** Cuántas líneas se miran hacia delante para reconocer una cabecera partida. */
const VENTANA = 6;

function campoDe(linea: string): string | null {
  const m = CAMPO_CABECERA.exec(linea);
  return m ? m[1].toLowerCase() : null;
}

/**
 * ¿Empieza en `i` un bloque «De:/Para:/Fecha:/Asunto:»? Hace falta que la
 * primera línea sea `De:`/`From:` y que en las siguientes aparezcan al menos
 * otros dos campos del mismo idioma, incluida la fecha o el asunto.
 */
function esBloqueDeCabecera(lineas: string[], i: number): boolean {
  const primero = campoDe(lineas[i]);
  if (primero !== 'de' && primero !== 'from') return false;
  const campos = primero === 'de' ? CAMPOS_ES : CAMPOS_EN;

  const vistos = new Set<string>([primero]);
  for (let j = i + 1; j < Math.min(lineas.length, i + VENTANA); j++) {
    const campo = campoDe(lineas[j]);
    if (campo && campos.has(campo)) vistos.add(campo);
  }
  const tieneFechaOAsunto = ['fecha', 'enviado', 'asunto', 'sent', 'date', 'subject'].some((c) => vistos.has(c));
  return vistos.size >= 3 && tieneFechaOAsunto;
}

/** ¿Empieza en `i` una línea «El … escribió:» / «On … wrote:», aunque venga partida? */
function esLineaDeRespuesta(lineas: string[], i: number): boolean {
  if (!/^\s*(El|On)\s/.test(lineas[i])) return false;
  let junta = '';
  for (let j = i; j < Math.min(lineas.length, i + 3); j++) {
    junta += (j === i ? '' : ' ') + lineas[j].trim();
    if (RESPUESTA_ES.test(junta) || RESPUESTA_EN.test(junta)) return true;
  }
  return false;
}

export function quitarCitas(texto: string): string {
  if (!texto) return texto;

  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');

  let corte = lineas.length;
  for (let i = 0; i < lineas.length; i++) {
    // Lo que va detrás de un reenvío se queda entero.
    if (MARCA_REENVIO.test(lineas[i])) break;
    if (SEPARADOR_ORIGINAL.test(lineas[i]) || esLineaDeRespuesta(lineas, i) || esBloqueDeCabecera(lineas, i)) {
      corte = i;
      break;
    }
  }

  const nuevo = lineas
    .slice(0, corte)
    .filter((l) => !/^\s*>/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return nuevo ? nuevo : texto.trim();
}
