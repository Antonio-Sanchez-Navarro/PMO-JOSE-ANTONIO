import { Injectable, Logger } from '@nestjs/common';
import { LlmFactory } from './llm/llm.factory';
import { LlmChunk, LlmMessage } from './llm/llm.types';
import { StartChatDto } from './dto/start-chat.dto';

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

  constructor(private readonly factory: LlmFactory) {}

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
}
