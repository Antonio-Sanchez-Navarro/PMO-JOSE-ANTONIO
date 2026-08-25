import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Cuerpo de `POST /copilot/emails/send`.
 *
 * Es el borrador que la persona **ya revisó** en la tarjeta del chat, no lo que
 * propuso el modelo: entre `draft_email` y esto hay un humano que leyó y pulsó
 * enviar. Por eso el endpoint recibe el correo entero en vez de un id de
 * borrador — lo que se manda es lo que había en pantalla, con las correcciones
 * que hiciera.
 *
 * La forma coincide a propósito con el `payload` del evento `tool_call`, así que
 * la tarjeta puede mandar de vuelta lo que recibió sin traducir nada.
 */
export class SendEmailDto {
  /**
   * Destinatarios. Al menos uno: un correo sin `to` no es un borrador a medias,
   * es una petición equivocada.
   *
   * `@IsEmail` por elemento porque el modelo redacta el borrador y puede
   * inventarse una dirección con un espacio o sin arroba; que lo rechace el
   * servidor evita una llamada perdida a Gmail y un error opaco de Google.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  cc?: string[];

  /**
   * Asunto, en **una sola línea**.
   *
   * ⚠️ **El salto de línea no se rechaza por estética: separa cabeceras.** Un
   * asunto con `\r\n` dentro se parte en dos al armar el mensaje, y lo que va
   * detrás entra como una cabecera más — `Bcc: alguien@ejemplo.com`, por
   * ejemplo, que manda copia oculta sin que se vea en ninguna pantalla.
   *
   * Se rechaza **aquí**, con un motivo que la persona puede leer, y además se
   * sanea en `encodeHeader`, que es la capa que ninguna ruta puede saltarse.
   * No es duplicar: una cosa es avisar en la frontera y otra garantizar al
   * final, y la segunda tiene que aguantar aunque mañana entre por otra puerta.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  // eslint-disable-next-line no-control-regex
  @Matches(/^[^\x00-\x1F\x7F]*$/, {
    message: 'El asunto no puede contener saltos de línea ni caracteres de control',
  })
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  body!: string;
}
