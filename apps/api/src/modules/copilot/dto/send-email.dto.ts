import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  body!: string;
}
