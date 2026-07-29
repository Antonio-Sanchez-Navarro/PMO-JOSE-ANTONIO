import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  createPartFromFunctionResponse,
  FunctionCall,
  GoogleGenAI,
  Part,
} from '@google/genai';
import { LlmChatRequest, LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm.types';
import { tierConfig } from './model-tiers';
import { COPILOT_TOOLS, esEjecutable, parseToolArgs } from './tools';

/** Mismo techo que en Anthropic: con streaming no hay riesgo de agotar el tiempo de HTTP. */
const MAX_OUTPUT_TOKENS = 64_000;

/** Mismo tope de vueltas que en Anthropic, y por el mismo motivo. */
const MAX_VUELTAS = 4;

/**
 * Las mismas herramientas en el vocabulario de Google: van dentro de
 * `functionDeclarations`, y el esquema entra por `parametersJsonSchema` — que
 * acepta JSON Schema tal cual, así que es literalmente el mismo objeto que
 * recibe Anthropic y no una traducción que pueda divergir.
 */
const TOOLS = [
  {
    functionDeclarations: COPILOT_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.schema,
    })),
  },
];

/** Los nombres que reconocemos, para descartar cualquier otro. */
const NOMBRES = new Set<string>(COPILOT_TOOLS.map((t) => t.name));

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
    const contents: Content[] = request.messages.map((m) => ({
      // El papel del modelo se llama `model` aquí; el del usuario coincide.
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    let entrada = 0;
    let salida = 0;

    // Mismo bucle que en Anthropic y por lo mismo: una herramienta de solo
    // lectura obliga a volver a llamar con el resultado para que el modelo siga
    // respondiendo con el dato en la mano.
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const stream = await this.client.models.generateContentStream({
        model,
        contents,
        config: {
          ...(request.system ? { systemInstruction: request.system } : {}),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          tools: TOOLS,
          // Corta la generación cuando el cliente cierra la conexión SSE.
          ...(request.signal ? { abortSignal: request.signal } : {}),
        },
      });

      const ejecutables: FunctionCall[] = [];
      /**
       * Las partes del turno del modelo, **tal cual vinieron**.
       *
       * Se guardan en vez de reconstruirlas desde `functionCalls` porque
       * Gemini 3 devuelve en cada `functionCall` un `thoughtSignature` y exige
       * que se le reenvíe: sin él responde 400 —"Function call is missing a
       * thought_signature"— y el turno se corta justo al ir a usar la
       * herramienta. Comprobado contra la API.
       */
      const partesModelo: Part[] = [];

      for await (const chunk of stream) {
        partesModelo.push(...(chunk.candidates?.[0]?.content?.parts ?? []));
        // `text` es un accesor que puede venir vacío: hay trozos que solo traen
        // metadatos (motivo de parada, filtros de seguridad) y emitirlos como
        // texto pintaría cadenas vacías en la interfaz.
        if (chunk.text) {
          yield { type: 'text', text: chunk.text };
        }

        // Aquí llegan dentro del stream, al revés que en Anthropic: `args`
        // viene ya como objeto, sin JSON parcial que reconstruir.
        for (const llamada of chunk.functionCalls ?? []) {
          if (!llamada.name || !NOMBRES.has(llamada.name)) continue;

          if (esEjecutable(llamada.name)) {
            ejecutables.push(llamada);
            continue;
          }

          this.logger.log(`Herramienta ${llamada.name} propuesta por ${model}`);
          yield {
            type: 'tool_call',
            toolName: llamada.name,
            payload: parseToolArgs(llamada.name, llamada.args),
          };
        }

        // Los contadores llegan en los trozos, no en un mensaje final como en
        // Anthropic: se acumula el último de cada vuelta.
        if (chunk.usageMetadata) {
          entrada = chunk.usageMetadata.promptTokenCount ?? entrada;
          salida = chunk.usageMetadata.candidatesTokenCount ?? salida;
        }
      }

      if (!ejecutables.length || !request.execute) break;

      // El turno del modelo va con sus partes originales —firma de pensamiento
      // incluida— y después un `functionResponse` por cada herramienta.
      contents.push({ role: 'model', parts: partesModelo });
      contents.push({
        role: 'user',
        parts: await Promise.all(
          ejecutables.map(async (llamada) => {
            this.logger.log(`Ejecutando ${llamada.name} para ${model}`);
            const resultado = await request.execute!(llamada.name!, llamada.args);

            return createPartFromFunctionResponse(llamada.id ?? '', llamada.name!, {
              result: resultado,
            } as Record<string, unknown>);
          }),
        ),
      });
    }

    this.logger.log(`Copiloto (${model}): ${entrada} entrada / ${salida} salida`);

    yield { type: 'done', model, usage: { inputTokens: entrada, outputTokens: salida } };
  }
}
