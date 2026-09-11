/**
 * Cabeceras con las que un adjunto sale hacia el navegador.
 *
 * Vive en su propio archivo porque es la parte que tiene que ser **correcta
 * contra un valor que no controlamos**: el nombre del archivo lo escribió quien
 * mandó el correo, y va a parar dentro de una cabecera HTTP.
 */

/**
 * Tipos que el navegador puede enseñar sin descargar y sin poder ejecutar nada.
 *
 * ⚠️ **`inline` sobre un tipo cualquiera es una vulnerabilidad, no una
 * comodidad.** Un adjunto `text/html` servido `inline` se ejecuta en **nuestro**
 * origen —con la cookie de sesión a mano— así que bastaría mandarle un correo
 * al Jefe para robarle la sesión en cuanto abriera el adjunto. Por eso la lista
 * es de permitidos y no de prohibidos: lo que no esté aquí se descarga, que es
 * inerte.
 *
 * `application/pdf` entra porque los visores de PDF de los navegadores están
 * aislados y es justo lo que se quiere mirar sin bajar.
 */
const VISIBLES_EN_LINEA = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/**
 * Quita de un nombre de archivo todo lo que pueda romper la cabecera.
 *
 * Un `filename` con un salto de línea dentro parte la cabecera en dos y deja
 * inyectar las que quiera quien mandó el correo (*response splitting*). Las
 * comillas cierran el valor antes de tiempo, y las barras convertirían el
 * nombre en una ruta al guardarlo.
 *
 * Se hace a mano y no con una expresión «de sanear» genérica porque aquí el
 * criterio es el contrario del habitual: no interesa conservar el nombre lo
 * máximo posible, interesa que lo que salga sea **seguro aunque quede feo**.
 */
export function nombreSeguro(filename: string): string {
  const limpio = filename
    // Cualquier control (CR, LF, tab, nulos) fuera: son los que parten cabeceras.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["\\]/g, '')
    .replace(/[/\\]+/g, '_')
    .trim();

  // Un nombre vacío deja `filename=""`, que algunos navegadores guardan como
  // "download" sin extensión y otros directamente ignoran.
  return limpio === '' ? 'adjunto' : limpio.slice(0, 200);
}

/**
 * El `Content-Disposition` completo, con el nombre en las dos formas.
 *
 * Se escriben las dos a propósito: `filename=` en ASCII para los clientes
 * viejos y `filename*=UTF-8''…` (RFC 5987) para que un adjunto que se llame
 * «Cotización obra.pdf» no llegue como «Cotizaci?n obra.pdf». Un navegador que
 * entienda la segunda ignora la primera.
 */
export function contentDisposition(filename: string, mimeType: string): string {
  const seguro = nombreSeguro(filename);
  const disposicion = VISIBLES_EN_LINEA.has(mimeType.toLowerCase()) ? 'inline' : 'attachment';

  // `ascii` deja los acentos como bytes raros, así que se sustituyen por `_`:
  // esta copia es solo el respaldo, el nombre bueno va en la de UTF-8.
  const enAscii = seguro.replace(/[^\x20-\x7e]/g, '_');

  return `${disposicion}; filename="${enAscii}"; filename*=UTF-8''${encodeURIComponent(seguro)}`;
}

/**
 * El `Content-Type` con el que se sirve, **sin fiarse del que venga**.
 *
 * Lo declara quien mandó el correo, así que puede ser cualquier cosa: un
 * `mimeType` con `;` dentro añade parámetros a la cabecera, y uno con controles
 * la parte. Si no tiene la forma de un tipo MIME, se degrada al genérico, que
 * el navegador siempre descarga.
 */
export function contentTypeSeguro(mimeType: string): string {
  return /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? mimeType : 'application/octet-stream';
}
