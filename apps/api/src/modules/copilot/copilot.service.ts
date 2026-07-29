import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { LlmFactory } from './llm/llm.factory';
import { LlmChunk, LlmMessage } from './llm/llm.types';
import { StartChatDto } from './dto/start-chat.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { EMAIL_SENDER, EmailSender, SendResult } from './email/email-sender';

/**
 * Instrucciones de sistema del copiloto.
 *
 * Constante y al principio del prompt a propósito: es el prefijo estable que
 * permite que la caché del proveedor sirva de algo. Interpolar aquí la fecha o
 * el nombre del usuario invalidaría la caché en cada petición — el contexto
 * variable va en los mensajes, que llegan después.
 */
const SYSTEM_PROMPT = [
  'Eres el copiloto de un PMO inmobiliario. Trabajas sobre correos y tareas reales.',
  'Respondes en español, breve y al grano: quien pregunta está gestionando su día, no leyendo un informe.',
  'Si no tienes un dato, dices que no lo tienes en vez de suponerlo.',
  // Sin esta línea el modelo escribe el correo en la respuesta y la herramienta
  // no se llama nunca: el frontend recibiría texto donde espera un borrador
  // editable. Comprobado con los dos proveedores.
  'Cuando te pidan redactar o responder un correo, usa la herramienta draft_email en vez de escribirlo en la respuesta.',
].join(' ');

/**
 * Orquesta un turno del copiloto: arma el prompt, elige el proveedor y devuelve
 * la respuesta en trozos.
 *
 * No conoce a Claude ni a Gemini: pide a la fábrica la estrategia del payload y
 * habla con ella por el contrato. Añadir un proveedor no toca este archivo.
 */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly factory: LlmFactory,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  /**
   * Un turno de conversación.
   *
   * La estrategia se resuelve **antes** de devolver el iterable, de modo que un
   * proveedor no configurado lanza su 503 en la propia llamada y el controlador
   * puede convertirlo en una respuesta de error normal. Si se resolviera dentro
   * del generador, el fallo no aparecería hasta el primer `next()`, con las
   * cabeceras SSE ya enviadas.
   */
  chat(userId: string, dto: StartChatDto, signal?: AbortSignal): AsyncIterable<LlmChunk> {
    const strategy = this.factory.get(dto.provider);

    this.logger.log(
      `Copiloto: ${dto.provider}/${dto.tier} → ${strategy.modelFor(dto.tier)}` +
        (dto.threadId ? ` (hilo ${dto.threadId})` : ''),
    );

    // Un turno suelto mientras no exista la persistencia de hilos. Cuando
    // llegue, aquí se leerá el historial de `threadId` y se antepondrá.
    const messages: LlmMessage[] = [{ role: 'user', content: dto.message }];

    return strategy.stream({
      system: SYSTEM_PROMPT,
      messages,
      tier: dto.tier,
      signal,
    });
  }

  /** Qué proveedores puede ofrecer esta instalación. */
  providers() {
    return this.factory.available();
  }

  /**
   * Envía el borrador ya aprobado por la persona.
   *
   * Un fallo de Gmail sale como **502** y no como 500: el problema no es de esta
   * API sino del servicio de arriba —token caducado, cuota, dirección
   * rechazada— y quien lo lea en la interfaz necesita saber que reintentar
   * puede tener sentido. El motivo real se registra en el log; hacia fuera va
   * un mensaje que se puede enseñar.
   */
  async sendEmail(userId: string, dto: SendEmailDto): Promise<SendResult> {
    try {
      return await this.emailSender.send(userId, dto);
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo a ${dto.to.join(', ')}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new BadGatewayException(
        'No se pudo enviar el correo. Revisa la sesión de Google y vuelve a intentarlo.',
      );
    }
  }
}
