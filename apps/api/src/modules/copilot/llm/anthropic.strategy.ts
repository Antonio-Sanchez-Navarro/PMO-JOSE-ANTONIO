import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmChatRequest, LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm.types';
import { tierConfig } from './model-tiers';
import { COPILOT_TOOLS, esEjecutable, parseToolArgs } from './tools';

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
 * Cuántas veces se le puede devolver un resultado de herramienta al modelo en
 * un mismo turno.
 *
 * El tope no es defensa contra el modelo sino contra el bucle: sin él, un
 * modelo que pida buscar una y otra vez encadenaría llamadas hasta agotar la
 * cuota, y el usuario solo vería que la respuesta no llega nunca.
 */
const MAX_VUELTAS = 4;

/** El catálogo compartido, traducido al vocabulario de Anthropic. */
const TOOLS: Anthropic.Tool[] = COPILOT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.schema as unknown as Anthropic.Tool.InputSchema,
}));

/** Los nombres que reconocemos, para descartar cualquier otro. */
const NOMBRES = new Set<string>(COPILOT_TOOLS.map((t) => t.name));

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
    const messages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let entrada = 0;
    let salida = 0;

    // El bucle existe por las herramientas de solo lectura: el modelo pide una,
    // el backend la ejecuta y hay que **volver a llamar** con el resultado para
    // que siga respondiendo con el dato en la mano. Sin él, el turno se cortaría
    // justo cuando el modelo iba a usar lo que pidió.
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const stream = this.client.messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          ...(request.system ? { system: request.system } : {}),
          messages,
          tools: TOOLS,
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
      entrada += final.usage.input_tokens;
      salida += final.usage.output_tokens;

      // Las llamadas a herramienta salen de aquí y no de los eventos del stream
      // a propósito. El SDK entrega `input` **ya parseado**; reconstruirlo desde
      // los `input_json_delta` obligaría a concatenar JSON parcial y parsearlo
      // por nuestra cuenta, que es donde aparecen los fallos de escapado.
      const llamadas = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && NOMBRES.has(b.name),
      );

      // Las que actúan salen hacia el frontend y ahí termina el turno: las
      // confirma una persona.
      for (const bloque of llamadas.filter((b) => !esEjecutable(b.name))) {
        this.logger.log(`Herramienta ${bloque.name} propuesta por ${final.model}`);
        yield {
          type: 'tool_call',
          toolName: bloque.name,
          payload: parseToolArgs(bloque.name, bloque.input),
        };
      }

      const ejecutables = llamadas.filter((b) => esEjecutable(b.name));
      if (!ejecutables.length || !request.execute) break;

      // Se le devuelve al modelo lo que pidió, en el mismo formato que espera:
      // su propio turno de asistente y luego los resultados como `tool_result`.
      messages.push({ role: 'assistant', content: final.content });
      messages.push({
        role: 'user',
        content: await Promise.all(
          ejecutables.map(async (bloque) => {
            this.logger.log(`Ejecutando ${bloque.name} para ${final.model}`);
            const resultado = await request.execute!(bloque.name, bloque.input);

            return {
              type: 'tool_result' as const,
              tool_use_id: bloque.id,
              content: JSON.stringify(resultado),
            };
          }),
        ),
      });
    }

    this.logger.log(`Copiloto (${model}): ${entrada} entrada / ${salida} salida`);

    yield {
      type: 'done',
      model,
      // Sumados de todas las vueltas: si el modelo buscó antes de responder,
      // el turno costó las dos llamadas y el informe tiene que decirlo.
      usage: { inputTokens: entrada, outputTokens: salida },
    };
  }
}
