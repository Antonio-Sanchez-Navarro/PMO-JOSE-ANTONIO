import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmChatRequest, LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm.types';
import { tierConfig } from './model-tiers';

/**
 * Tope de salida por respuesta.
 *
 * Alto a propósito: con streaming no hay riesgo de agotar el tiempo de espera
 * de HTTP, y quedarse corto trunca la respuesta a media frase y obliga a
 * repetir la llamada entera. Es un techo, no un objetivo: se paga lo que se
 * genera.
 */
const MAX_TOKENS = 64_000;

/**
 * El copiloto sobre Claude.
 *
 * El cliente se construye una vez y se reutiliza: abrir uno por petición
 * tiraría el pool de conexiones en cada mensaje del chat.
 */
@Injectable()
export class AnthropicStrategy implements LlmStrategy {
  readonly provider = LlmProvider.ANTHROPIC;

  private readonly logger = new Logger(AnthropicStrategy.name);
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    // La misma credencial que ya usa la tubería de clasificación: no se
    // introduce una segunda forma de autenticarse contra el mismo proveedor.
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;

    if (!this.client) {
      this.logger.warn('Sin ANTHROPIC_API_KEY: el copiloto no podrá usar Claude.');
    }
  }

  isReady(): boolean {
    return this.client !== null;
  }

  modelFor(tier: LlmTier): string {
    return tierConfig(this.provider, tier).model;
  }

  async *stream(request: LlmChatRequest): AsyncIterable<LlmChunk> {
    // `isReady()` lo comprueba la fábrica antes de llegar aquí; esto es el
    // cinturón por si algún día alguien invoca la estrategia directamente.
    if (!this.client) {
      throw new Error('El cliente de Anthropic no está configurado.');
    }

    const { model, effort } = tierConfig(this.provider, request.tier);

    const stream = this.client.messages.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        ...(request.system ? { system: request.system } : {}),
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        // Solo si el nivel lo declara: los modelos que no admiten `effort`
        // responden 400 al recibirlo (ver `model-tiers.ts`).
        ...(effort ? { output_config: { effort } } : {}),
      },
      // La cancelación del SDK: al cerrarse la conexión SSE se aborta también
      // la llamada al modelo, en vez de seguir generando para nadie.
      { signal: request.signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    // Después del bucle: el mensaje ya está completo y trae los contadores
    // reales de la llamada, que es lo que interesa registrar.
    const final = await stream.finalMessage();

    this.logger.log(
      `Copiloto (${model}): ${final.usage.input_tokens} entrada / ${final.usage.output_tokens} salida`,
    );

    yield {
      type: 'done',
      model: final.model,
      usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
    };
  }
}
