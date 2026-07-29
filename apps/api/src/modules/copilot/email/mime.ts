import { SendEmailDto } from '../dto/send-email.dto';

/**
 * Arma el mensaje RFC 2822 que espera la API de Gmail.
 *
 * Es una función pura y vive aparte del emisor para poder probarla sin cliente
 * de Google: el correo mal formado no se nota hasta que llega al destinatario
 * con el asunto ilegible, y para entonces ya se envió.
 */

/**
 * Codifica un texto para una **cabecera** según RFC 2047.
 *
 * Las cabeceras son ASCII de siete bits. Un asunto como "Actualización" metido
 * en crudo llega al destinatario como "ActualizaciÃ³n" —o lo rechaza el
 * servidor—, así que si trae algo fuera de ASCII se envuelve en un
 * *encoded-word* en base64. Si es ASCII puro se deja tal cual: envolverlo sería
 * ruido ilegible en cualquier cliente que no lo decodifique.
 */
export function encodeHeader(texto: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(texto)) return texto;

  return `=?UTF-8?B?${Buffer.from(texto, 'utf8').toString('base64')}?=`;
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
