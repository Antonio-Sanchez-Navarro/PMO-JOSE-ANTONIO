import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmChatRequest, LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm.types';
import { tierConfig } from './model-tiers';
import { COPILOT_TOOLS, esEjecutable, parseToolArgs } from './tools';
import {
  convieneEsperar,
  crearClienteAnthropic,
  describirFallo,
} from '../../../common/anthropic/anthropic-client';

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

/**
 * Plazo **por llamada al modelo**, no por turno.
 *
 * Un turno del copiloto va en streaming y puede encadenar hasta `MAX_VUELTAS`
 * llamadas con ejecución de herramientas entre medias; esto cubre la más lenta
 * de ellas, no la conversación entera.
 *
 * ⚠️ **Este número está atado al `--timeout` de Cloud Run, y hasta el
 * 2026-08-21 se contradecían.** Valía 10 min por llamada mientras Cloud Run
 * cortaba la petición a los 5 (su valor por defecto, porque el pipeline no
 * pasaba `--timeout`). Un turno largo lo mataba la plataforma **por debajo del
 * código**: el backend creía que le quedaban otros cinco minutos y el usuario
 * veía morir el stream **sin evento `error`**, porque el corte ocurría donde no
 * había nadie para emitirlo.
 *
 * La relación que tiene que cumplirse, y que ahora está escrita en los dos
 * sitios:
 *
 *     MAX_VUELTAS × TIMEOUT_MS  +  tiempo de herramientas  <  timeout de Cloud Run
 *              4 × 180 s = 720 s  +  margen                 <  900 s
 *
 * **Se bajó este en vez de subir el de Cloud Run**, y el motivo ya estaba
 * escrito en este proyecto: el copiloto **no frena** ante un 429 porque «al otro
 * lado hay alguien esperando y un error a los veinte segundos es mejor que un
 * cursor parpadeando tres minutos». Una llamada al modelo que no termina en tres
 * minutos no está tardando: está colgada. Diez minutos no son un plazo, son una
 * sala de espera.
 *
 * Si algún día sube `MAX_VUELTAS` o este plazo, **sube también el `--timeout`
 * del servicio en `deploy.yml`** o vuelven a contradecirse.
 */
const TIMEOUT_MS = 3 * 60_000;

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
    // Misma política de reintentos que la tubería de clasificación: el SDK
    // reintenta 429 y 5xx respetando `retry-after`. Aquí no se frena nada por
    // encima de eso — al otro lado hay una persona esperando, y un error a los
    // veinte segundos es mejor que un cursor parpadeando tres minutos.
    this.client = apiKey
      ? crearClienteAnthropic(apiKey, this.config, {
          contexto: 'copiloto',
          timeoutPorDefectoMs: TIMEOUT_MS,
        })
      : null;

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

      let final: Anthropic.Message;
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          }
        }

        // Después del bucle: el mensaje ya está completo y trae los contadores
        // reales de la llamada, que es lo que interesa registrar.
        final = await stream.finalMessage();
      } catch (error) {
        // Los reintentos del SDK ya pasaron y siguen sin atendernos. Se traduce
        // a un mensaje que el chat pueda enseñar tal cual: el genérico del SDK
        // habla de códigos HTTP a quien solo ve que su pregunta no responde.
        // El resto de fallos —incluida la cancelación cuando el usuario cierra
        // la pestaña— se propagan intactos.
        if (convieneEsperar(error)) {
          this.logger.warn(`Copiloto sin atender por saturación: ${describirFallo(error)}`);
          throw new Error(
            'El servicio de IA está saturado ahora mismo. Vuelve a intentarlo en unos minutos.',
            { cause: error },
          );
        }
        throw error;
      }

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

      // ⚠️ **Hay que contestar a TODOS los `tool_use`, no solo a los que se
      // ejecutan.** La API de Anthropic exige que cada bloque `tool_use` del
      // turno de asistente tenga su `tool_result` en el turno siguiente; si
      // falta uno, **rechaza el array entero con un 400** y el turno muere —no
      // se degrada, no responde a medias: no responde.
      //
      // Salta solo cuando el modelo mezcla en una misma respuesta una
      // herramienta manual (`create_task`, enviar correo…) y una ejecutable
      // (`search_emails`), que es un caso perfectamente razonable: «busca esto
      // y créame la tarea». Como el turno de asistente que acabamos de apilar
      // lleva los dos bloques, devolver solo el del ejecutable dejaba al otro
      // sin respuesta.
      //
      // A las manuales se les contesta que quedan **pendientes de confirmación
      // de una persona**, que es la verdad: ya salieron hacia el frontend como
      // `tool_call` y ahí termina su camino en este turno. Decírselo al modelo
      // además evita que insista o dé por hecha una acción que aún no ocurrió.
      const pendientes = llamadas
        .filter((b) => !esEjecutable(b.name))
        .map((bloque) => ({
          type: 'tool_result' as const,
          tool_use_id: bloque.id,
          content: JSON.stringify({
            estado: 'pendiente_de_confirmacion',
            detalle:
              'Propuesta al usuario para que la confirme. Todavía no se ha ejecutado: ' +
              'no des la acción por hecha ni la repitas.',
          }),
        }));

      const resueltas = await Promise.all(
        ejecutables.map(async (bloque) => {
          this.logger.log(`Ejecutando ${bloque.name} para ${final.model}`);
          const resultado = await request.execute!(bloque.name, bloque.input);

          return {
            type: 'tool_result' as const,
            tool_use_id: bloque.id,
            content: JSON.stringify(resultado),
          };
        }),
      );

      messages.push({ role: 'user', content: [...resueltas, ...pendientes] });
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
