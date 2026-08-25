import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCostService } from '../../common/costs/ai-cost.service';
import Anthropic from '@anthropic-ai/sdk';
import { TaskPriority } from '@prisma/client';
import {
  convieneEsperar,
  crearClienteAnthropic,
  describirFallo,
  esperaSugeridaMs,
} from '../../common/anthropic/anthropic-client';

export interface ExtractedTask {
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  /** Fecha límite detectada en el correo, o `null` si no menciona ninguna. */
  dueDate: Date | null;
}

export interface EmailAnalysisResult {
  isActionable: boolean;
  category: string;
  tasks: ExtractedTask[];
  aiConfidence: number;
  /**
   * Remitente abreviado ("Astrid R.") y proyecto al que pertenece el correo.
   * Alimentan el prefijo de contexto del título (ver `title.prefix.ts`). Son
   * `null` cuando el correo no da para deducirlos.
   */
  senderName: string | null;
  project: string | null;
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * Vocabulario cerrado de categorías.
 *
 * Va como `enum` en el esquema, no como texto libre: cuando `category` era
 * `type: string` la API aceptó salidas corruptas del modelo (fragmentos de la
 * serialización de la herramienta dentro del valor). `priority`, que siempre
 * fue `enum`, nunca se corrompió.
 */
const CATEGORIES = [
  'PROJECT_MANAGEMENT',
  'INVOICING',
  'MEETING',
  'INFORMATIONAL',
  'OTHER',
] as const;

const FALLBACK_CATEGORY: (typeof CATEGORIES)[number] = 'OTHER';

const TOOL_NAME = 'extract_email_tasks';

/**
 * Herramienta de salida estructurada.
 *
 * `strict: true` obliga a la API a validar la respuesta contra este esquema, lo
 * que exige `additionalProperties: false` y que `required` liste todas las
 * propiedades de cada objeto.
 */
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Extrae las tareas accionables de un correo corporativo.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      isActionable: {
        type: 'boolean',
        description: 'true si el correo requiere una acción o seguimiento del usuario',
      },
      category: {
        type: 'string',
        enum: [...CATEGORIES],
        description: 'Categoría del correo, exactamente uno de los valores permitidos',
      },
      tasks: {
        type: 'array',
        description: 'Tareas extraídas. Vacío si el correo no es accionable.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título conciso y accionable' },
            description: { type: 'string', description: 'Contexto breve de la tarea' },
            priority: { type: 'string', enum: [...PRIORITIES] },
            tags: { type: 'array', items: { type: 'string' } },
            dueDate: {
              anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }],
              description:
                'Fecha límite en formato YYYY-MM-DD si el correo la menciona explícitamente; null si no.',
            },
          },
          required: ['title', 'description', 'priority', 'tags', 'dueDate'],
          additionalProperties: false,
        },
      },
      aiConfidence: {
        type: 'number',
        description: 'Confianza del análisis, entre 0 y 1',
      },
      senderName: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description:
          'Nombre del remitente abreviado: nombre de pila e inicial del apellido con punto, por ejemplo "Astrid R.". null si el correo no permite deducirlo.',
      },
      project: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description:
          'Proyecto, obra, cliente o asunto al que pertenece el correo, en una o dos palabras, por ejemplo "Citrotarte" o "Lote 36". null si no hay ninguno claro.',
      },
    },
    required: ['isActionable', 'category', 'tasks', 'aiConfidence', 'senderName', 'project'],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `Eres un asistente de Gestión de Proyectos (PMO) experto en analizar correos corporativos.
Tu único propósito es leer un correo y determinar:
1. Si el correo requiere una acción o seguimiento por parte del usuario (isActionable).
2. Si es accionable, extraer la tarea principal o la lista de tareas.
3. Asignar prioridad, etiquetas, fecha límite (si el correo la menciona) y tu nivel de confianza.

Sobre el contexto de las tareas (senderName y project): el tablero necesita saber de
quién y de qué proyecto viene cada tarea. Extrae el nombre del remitente abreviado
—nombre de pila e inicial del apellido con punto, "Astrid R."— y el proyecto, obra,
cliente o asunto al que pertenece el correo, en una o dos palabras ("Citrotarte",
"Lote 36"). Si el correo no permite deducir alguno de los dos, devuelve null: no
inventes un remitente ni un proyecto.

Los títulos de las tareas van SIN prefijo: escríbelos como acciones limpias
("Solicitar inmueble en garantía"). El sistema antepone después el bloque
[Astrid R. - Citrotarte 1/3] con los datos que acabas de extraer, y numera él las
tareas. No escribas tú corchetes ni contadores: se duplicarían.

Sobre las fechas: el mensaje del usuario incluye la fecha de recepción del correo.
Resuelve contra ella cualquier fecha relativa o incompleta ("el viernes", "31 de julio",
"la próxima semana") y devuélvela como YYYY-MM-DD. Si el correo no menciona una fecha
límite, devuelve null: no inventes ninguna.

Usa la herramienta ${TOOL_NAME} para devolver el resultado.`;

/**
 * Con qué se clasifica si `CLAUDE_MODEL_CLASSIFY` no llega.
 *
 * **Aquí sí hay respaldo y con la clave no lo había, y la diferencia importa.**
 * Una credencial inventada no existe: falla en la primera llamada disfrazada de
 * 401. Un id de modelo, en cambio, lo sabemos escribir bien desde aquí, así que
 * el respaldo funciona de verdad. Y lo que evita no es poco: el servicio se
 * construye al arrancar, de modo que un `getOrThrow` sin la variable puesta no
 * dejaba sin clasificación al tablero — dejaba **la API entera sin arrancar**,
 * tablero y sesiones incluidos, por un nombre de modelo que falta.
 *
 * Se avisa fuerte en el log porque el entorno manda: si producción quiere otro
 * modelo y la variable no llegó, esto lo está ignorando en silencio.
 */
const MODELO_DE_CLASIFICACION_POR_DEFECTO = 'claude-sonnet-5';

@Injectable()
export class AiService {
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly costes: AiCostService,
  ) {
    // Sin fallback: una clave inventada solo difiere el fallo hasta el primer
    // job y lo disfraza de error 401. Mejor no arrancar.
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY no está configurada. Añádela al .env de la raíz para habilitar el módulo de IA.',
      );
    }

    const configurado = this.config.get<string>('CLAUDE_MODEL_CLASSIFY')?.trim();
    if (!configurado) {
      this.logger.warn(
        `CLAUDE_MODEL_CLASSIFY no está configurada: se clasifica con ${MODELO_DE_CLASIFICACION_POR_DEFECTO}. ` +
          'En Cloud Run llega desde Secret Manager (ver el paso de despliegue).',
      );
    }

    this.model = configurado || MODELO_DE_CLASIFICACION_POR_DEFECTO;
    this.anthropic = crearClienteAnthropic(apiKey, this.config, {
      contexto: 'clasificación de correo',
    });
    this.logger.log(`Modelo de clasificación: ${this.model}`);
  }

  /**
   * @param receivedAt fecha de recepción del correo: ancla temporal para resolver
   *   fechas relativas. Sin ella el modelo adivina el año y las fechas límite salen mal.
   */
  async analyzeEmail(
    subject: string,
    bodyText: string,
    receivedAt: Date,
  ): Promise<EmailAnalysisResult> {
    const fecha = receivedAt.toISOString().slice(0, 10);

    let response: Anthropic.Message;
    try {
      response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Fecha de recepción: ${fecha}\nSubject: ${subject}\n\nBody:\n${bodyText}`,
          },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: TOOL_NAME },
      });
    } catch (error) {
      // Llegar aquí con un 429 significa que el cliente ya reintentó y esperó
      // lo que pedía la API, y aun así sigue cerrado. Se anota con la espera
      // que sugiere la respuesta y se propaga: quien decide qué hacer con la
      // saturación es el worker, que puede frenar la cola entera (ver
      // `ai.processor.ts`). Frenar aquí solo dormiría a este correo.
      if (convieneEsperar(error)) {
        const espera = esperaSugeridaMs(error);
        this.logger.warn(
          `Anthropic no atendió tras agotar los reintentos: ${describirFallo(error)}` +
            (espera ? ` · sugiere esperar ${Math.round(espera / 1000)} s` : ''),
        );
      }
      throw error;
    }

    // ─── Anotar lo que costo, antes de interpretar la respuesta ──────────
    //
    // Va **aqui y no despues de validar** a proposito: una respuesta que llega
    // y no sirve —un `refusal`, un bloque que falta— **ya se pago**. Anotarla
    // solo cuando el resultado es util haria que el gasto pareciera menor justo
    // cuando algo va mal, que es cuando mas importa saberlo.
    //
    // No se espera al `await`... si se espera, pero el metodo no lanza nunca:
    // el contador no puede tumbar el trabajo que esta midiendo.
    await this.costes.registrar(
      response.model ?? this.model,
      response.usage?.input_tokens ?? 0,
      response.usage?.output_tokens ?? 0,
    );

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude rechazó analizar el correo (stop_reason: refusal)');
    }

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolBlock) {
      throw new Error(`Claude no devolvió un bloque tool_use (stop_reason: ${response.stop_reason})`);
    }

    return this.parseAnalysis(toolBlock.input);
  }

  /**
   * Valida la salida del modelo antes de tocar la base de datos.
   *
   * `strict: true` ya la restringe en la API, pero un `as` ciego convertiría
   * cualquier desviación en un error opaco de Prisma varias capas más abajo.
   */
  private parseAnalysis(input: unknown): EmailAnalysisResult {
    if (typeof input !== 'object' || input === null) {
      throw new Error('La salida de la IA no es un objeto');
    }
    const raw = input as Record<string, unknown>;

    if (typeof raw.isActionable !== 'boolean') {
      throw new Error('Campo "isActionable" ausente o no booleano');
    }
    if (typeof raw.category !== 'string') {
      throw new Error('Campo "category" ausente o no textual');
    }
    // Segunda barrera tras el `enum` del esquema: una categoría fuera del
    // vocabulario degrada a OTHER en vez de contaminar la DB. No se lanza error
    // porque el resto del análisis (las tareas) sigue siendo utilizable.
    const category = (CATEGORIES as readonly string[]).includes(raw.category)
      ? raw.category
      : (this.logger.warn(
          `Categoría fuera del vocabulario: ${JSON.stringify(raw.category)} → ${FALLBACK_CATEGORY}`,
        ),
        FALLBACK_CATEGORY);
    if (typeof raw.aiConfidence !== 'number' || Number.isNaN(raw.aiConfidence)) {
      throw new Error('Campo "aiConfidence" ausente o no numérico');
    }
    if (!Array.isArray(raw.tasks)) {
      throw new Error('Campo "tasks" ausente o no es un arreglo');
    }

    return {
      isActionable: raw.isActionable,
      category,
      // La confianza alimenta decisiones de negocio: la acotamos al rango válido.
      aiConfidence: Math.min(1, Math.max(0, raw.aiConfidence)),
      tasks: raw.tasks.map((task, index) => this.parseTask(task, index)),
      // Ausentes o de otro tipo se degradan a null en vez de romper el análisis:
      // sin ellos la tarea sale sin prefijo, que es peor que con él pero mucho
      // mejor que perder la extracción entera.
      senderName: this.parseContexto(raw.senderName, 'senderName'),
      project: this.parseContexto(raw.project, 'project'),
    };
  }

  /** Remitente y proyecto: texto útil o `null`. Nunca cadena vacía. */
  private parseContexto(value: unknown, campo: string): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
      this.logger.warn(`Campo "${campo}" ignorado: no es texto (${typeof value})`);
      return null;
    }
    const limpio = value.trim();
    return limpio === '' ? null : limpio;
  }

  private parseTask(value: unknown, index: number): ExtractedTask {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`La tarea #${index} no es un objeto`);
    }
    const raw = value as Record<string, unknown>;

    if (typeof raw.title !== 'string' || raw.title.trim() === '') {
      throw new Error(`La tarea #${index} no tiene título`);
    }
    if (!PRIORITIES.includes(raw.priority as (typeof PRIORITIES)[number])) {
      throw new Error(`La tarea #${index} tiene una prioridad inválida: ${String(raw.priority)}`);
    }

    return {
      title: raw.title.trim(),
      description: typeof raw.description === 'string' ? raw.description : '',
      priority: raw.priority as TaskPriority,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
      dueDate: this.parseDueDate(raw.dueDate, index),
    };
  }

  private parseDueDate(value: unknown, index: number): Date | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') {
      this.logger.warn(`Fecha límite ignorada en la tarea #${index}: no es texto`);
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`Fecha límite ignorada en la tarea #${index}: "${value}" no es una fecha`);
      return null;
    }
    return parsed;
  }
}
