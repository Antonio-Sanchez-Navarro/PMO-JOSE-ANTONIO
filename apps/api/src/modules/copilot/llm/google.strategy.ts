import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { LlmChatRequest, LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm.types';
import { tierConfig } from './model-tiers';

/** Mismo techo que en Anthropic: con streaming no hay riesgo de agotar el tiempo de HTTP. */
const MAX_OUTPUT_TOKENS = 64_000;

/**
 * El copiloto sobre Gemini.
 *
 * Dos diferencias de vocabulario con Anthropic que esta clase absorbe para que
 * el resto del módulo no se entere:
 *
 * - Los turnos son `contents` con `parts[]`, y el papel del modelo se llama
 *   **`model`**, no `assistant`.
 * - Las instrucciones de sistema van en `config.systemInstruction`, no en un
 *   campo hermano de los mensajes.
 *
 * **Lo único que le falta es la credencial.** Los ids de modelo ya tienen valor
 * por defecto (ver `model-tiers.ts`), así que en cuanto exista `GEMINI_API_KEY`
 * en el entorno este proveedor pasa a `ready: true` y aparece en el selector.
 * Sin ella, `isReady()` responde `false` y la fábrica devuelve 503 con el
 * motivo **antes** de que el controlador escriba una cabecera.
 */
@Injectable()
export class GoogleStrategy implements LlmStrategy {
  readonly provider = LlmProvider.GOOGLE;

  private readonly logger = new Logger(GoogleStrategy.name);
  private readonly client: GoogleGenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;

    if (!this.client) {
      this.logger.warn('Sin GEMINI_API_KEY: el copiloto no podrá usar Gemini.');
    }
  }

  isReady(): boolean {
    // Los ids entran en la comprobación además de la credencial: sin ellos la
    // llamada saldría con `model: ""` y el fallo aparecería a mitad del
    // stream, cuando ya no se puede cambiar el código de estado.
    return Boolean(this.client) && Boolean(this.modelFor(LlmTier.LIGHT) && this.modelFor(LlmTier.PRO));
  }

  modelFor(tier: LlmTier): string {
    return tierConfig(this.provider, tier).model;
  }

  async *stream(request: LlmChatRequest): AsyncIterable<LlmChunk> {
    if (!this.client) {
      throw new Error('El cliente de Gemini no está configurado.');
    }

    const model = this.modelFor(request.tier);

    const stream = await this.client.models.generateContentStream({
      model,
      contents: request.messages.map((m) => ({
        // El papel del modelo se llama `model` aquí; el del usuario coincide.
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: {
        ...(request.system ? { systemInstruction: request.system } : {}),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Corta la generación cuando el cliente cierra la conexión SSE.
        ...(request.signal ? { abortSignal: request.signal } : {}),
      },
    });

    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of stream) {
      // `text` es un accesor que puede venir vacío: hay trozos que solo traen
      // metadatos (motivo de parada, filtros de seguridad) y emitirlos como
      // texto pintaría cadenas vacías en la interfaz.
      if (chunk.text) {
        yield { type: 'text', text: chunk.text };
      }

      // Los contadores llegan en los trozos, no en un mensaje final como en
      // Anthropic: se guarda el último que venga.
      if (chunk.usageMetadata) {
        usage = {
          inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
    }

    this.logger.log(
      `Copiloto (${model}): ${usage?.inputTokens ?? '?'} entrada / ${usage?.outputTokens ?? '?'} salida`,
    );

    yield { type: 'done', model, ...(usage ? { usage } : {}) };
  }
}
