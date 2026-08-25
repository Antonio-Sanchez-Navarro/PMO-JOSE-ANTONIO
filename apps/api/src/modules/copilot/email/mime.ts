import { SendEmailDto } from '../dto/send-email.dto';

/**
 * Arma el mensaje RFC 2822 que espera la API de Gmail.
 *
 * Es una función pura y vive aparte del emisor para poder probarla sin cliente
 * de Google: el correo mal formado no se nota hasta que llega al destinatario
 * con el asunto ilegible, y para entonces ya se envió.
 */

/**
 * Los caracteres de control ASCII, que dentro de una cabecera no significan
 * «un carácter raro» sino **estructura**.
 *
 * Se sustituyen por un espacio en vez de borrarse para que
 * «linea1\r\nlinea2» no acabe como «linea1linea2»: el texto se sigue leyendo y
 * deja de ser peligroso.
 */
// eslint-disable-next-line no-control-regex
const CONTROLES = /[\x00-\x1F\x7F]+/g;

/**
 * Deja un texto en condiciones de ocupar **una sola** línea de cabecera.
 *
 * ⚠️ **Es una frontera de seguridad, no una limpieza cosmética.** Las cabeceras
 * se separan entre sí con `\r\n`, así que un salto de línea dentro del valor
 * **no es un carácter: es el final de esta cabecera y el principio de otra**.
 * Un asunto como
 *
 *     Hola\r\nBcc: alguien@ejemplo.com
 *
 * se convierte en un `Bcc:` de verdad, con copia oculta para quien lo pusiera
 * ahí. Y el asunto de un borrador **lo redacta el modelo**: basta con que el
 * copiloto lea un correo que lleve dentro esa instrucción para que llegue hasta
 * aquí sin que ninguna persona la haya tecleado.
 */
function unaSolaLinea(texto: string): string {
  return texto.replace(CONTROLES, ' ').trim();
}

/**
 * Codifica un texto para una **cabecera** según RFC 2047.
 *
 * Las cabeceras son ASCII de siete bits. Un asunto como "Actualización" metido
 * en crudo llega al destinatario como "ActualizaciÃ³n" —o lo rechaza el
 * servidor—, así que si trae algo fuera de ASCII se envuelve en un
 * *encoded-word* en base64. Si es ASCII puro se deja tal cual: envolverlo sería
 * ruido ilegible en cualquier cliente que no lo decodifique.
 *
 * ⚠️ **Se sanea antes de decidir la rama, y ahí estaba el agujero.** La
 * comprobación de «¿es ASCII puro?» daba **true** para un asunto con `\r\n`
 * dentro —los saltos de línea son ASCII: 0x0D y 0x0A—, y entonces el texto
 * salía **intacto** hacia `buildRawMessage`. La condición tenía cara de
 * comprobación de seguridad y era justo lo contrario: era la puerta.
 *
 * **Sanea y no lanza, a propósito.** Ésta es la última capa antes de armar el
 * mensaje y la única que ninguna ruta puede saltarse: si mañana otra
 * herramienta del copiloto arma un correo sin pasar por `SendEmailDto`, sigue
 * pasando por aquí. Quien rechaza con un motivo legible es el DTO, en la
 * frontera; ésta **garantiza** — y una garantía que lanza deja de garantizar el
 * día que alguien la envuelve en un `try`.
 */
export function encodeHeader(texto: string): string {
  const limpio = unaSolaLinea(texto);

  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(limpio)) return limpio;

  return `=?UTF-8?B?${Buffer.from(limpio, 'utf8').toString('base64')}?=`;
}

/**
 * El mensaje completo, ya en el base64url que pide `users.messages.send`.
 *
 * El cuerpo va en base64 y declarando `charset="UTF-8"`: con acentos, eñes o un
 * salto de línea largo, mandarlo en crudo deja el correo troceado o con
 * caracteres rotos según el cliente que lo abra.
 */
export function buildRawMessage(dto: SendEmailDto): string {
  const cabeceras = [
    `To: ${dto.to.join(', ')}`,
    ...(dto.cc?.length ? [`Cc: ${dto.cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(dto.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];

  const mensaje =
    // La línea en blanco separa cabeceras de cuerpo; sin ella el correo entero
    // se interpreta como cabeceras y Gmail lo rechaza.
    `${cabeceras.join('\r\n')}\r\n\r\n${Buffer.from(dto.body, 'utf8').toString('base64')}`;

  // base64**url**: el base64 normal lleva `+` y `/`, que viajan mal en el JSON
  // de la petición y Gmail rechaza con un error que no dice por qué.
  return Buffer.from(mensaje, 'utf8').toString('base64url');
}
