import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendEmailDto } from './send-email.dto';

/**
 * `SendEmailDto` — el asunto que colaba cabeceras (§45.1).
 *
 * **Por qué existe esta prueba.** El asunto acaba dentro de un mensaje RFC 2822,
 * donde las cabeceras se separan con `\r\n`. Un salto de línea ahí dentro **no
 * es un carácter: parte la cabecera en dos**, y lo que va detrás entra como una
 * cabecera más — `Bcc:`, por ejemplo, que manda copia oculta sin aparecer en
 * ninguna pantalla.
 *
 * Y quien redacta el asunto de un borrador es **el modelo**, así que la
 * instrucción puede venir dentro de un correo que el copiloto lea. No hace
 * falta que nadie la teclee.
 *
 * Se prueban las **dos** capas por separado y a propósito: aquí que la frontera
 * rechaza con un motivo legible, y en `copilot.spec.ts` que el mensaje armado no
 * lleva la cabecera aunque el texto llegue por otra puerta. Una garantía que
 * solo vive en la frontera se pierde el día que alguien entra por otro sitio.
 */
describe('SendEmailDto · el asunto va en una sola línea', () => {
  /** Los controles se escriben así y no con escapes: un `\0` literal en el
   * fuente es un byte NUL de verdad dentro del archivo, y eso convierte el
   * `.ts` en binario para media herramienta del repositorio. */
  const control = (codigo: number) => String.fromCharCode(codigo);

  const valida = (subject: unknown) =>
    validateSync(
      plainToInstance(SendEmailDto, {
        to: ['cliente@ejemplo.com'],
        subject,
        body: 'Buenos días.',
      }),
      { whitelist: true },
    ).map((e) => e.property);

  it('rechaza el asunto que intenta colar un Bcc', () => {
    const veneno = `Hola${control(13)}${control(10)}Bcc: colado@ejemplo.com`;

    expect(valida(veneno)).toContain('subject');
  });

  it('rechaza el salto y el retorno por separado', () => {
    // `\n` a secas basta en muchos parsers, así que no vale con cubrir el par.
    expect(valida(`Hola${control(10)}Bcc: x@y.com`)).toContain('subject');
    expect(valida(`Hola${control(13)}Bcc: x@y.com`)).toContain('subject');
  });

  it('rechaza también el NUL, que trunca en cuanto lo toca algo escrito en C', () => {
    expect(valida(`Hola${control(0)}resto`)).toContain('subject');
  });

  it('deja pasar un asunto normal, con acentos incluidos', () => {
    // La validación no puede cobrarse el caso corriente: el asunto con tilde es
    // lo habitual aquí, y se codifica después en RFC 2047, que es otra cosa.
    expect(valida('Actualización del lote 36')).not.toContain('subject');
  });
});
