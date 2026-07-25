import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { TaskPriority } from '@prisma/client';

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
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

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
        description: 'Categoría: PROJECT_MANAGEMENT, INVOICING, MEETING, INFORMATIONAL, OTHER',
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
    },
    required: ['isActionable', 'category', 'tasks', 'aiConfidence'],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `Eres un asistente de Gestión de Proyectos (PMO) experto en analizar correos corporativos.
Tu único propósito es leer un correo y determinar:
1. Si el correo requiere una acción o seguimiento por parte del usuario (isActionable).
2. Si es accionable, extraer la tarea principal o la lista de tareas.
3. Asignar prioridad, etiquetas, fecha límite (si el correo la menciona) y tu nivel de confianza.

Sobre las fechas: el mensaje del usuario incluye la fecha de recepción del correo.
Resuelve contra ella cualquier fecha relativa o incompleta ("el viernes", "31 de julio",
"la próxima semana") y devuélvela como YYYY-MM-DD. Si el correo no menciona una fecha
límite, devuelve null: no inventes ninguna.

Usa la herramienta ${TOOL_NAME} para devolver el resultado.`;

@Injectable()
export class AiService {
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {
    // Sin fallback: una clave inventada solo difiere el fallo hasta el primer
    // job y lo disfraza de error 401. Mejor no arrancar.
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY no está configurada. Añádela al .env de la raíz para habilitar el módulo de IA.',
      );
    }

    this.model = this.config.getOrThrow<string>('CLAUDE_MODEL_CLASSIFY');
    this.anthropic = new Anthropic({ apiKey });
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

    const response = await this.anthropic.messages.create({
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
    if (typeof raw.aiConfidence !== 'number' || Number.isNaN(raw.aiConfidence)) {
      throw new Error('Campo "aiConfidence" ausente o no numérico');
    }
    if (!Array.isArray(raw.tasks)) {
      throw new Error('Campo "tasks" ausente o no es un arreglo');
    }

    return {
      isActionable: raw.isActionable,
      category: raw.category,
      // La confianza alimenta decisiones de negocio: la acotamos al rango válido.
      aiConfidence: Math.min(1, Math.max(0, raw.aiConfidence)),
      tasks: raw.tasks.map((task, index) => this.parseTask(task, index)),
    };
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
