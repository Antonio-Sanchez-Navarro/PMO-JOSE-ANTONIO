import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Task, TaskPriority, TaskSource } from '@prisma/client';
import { AiService } from './ai.service';
import { adjustPriority } from './priority.rules';
import { senderFromHeader, withContextPrefix } from './title.prefix';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ClassifyOptions {
  /**
   * Borra las tareas que la IA había generado antes para este correo.
   * `true` en el worker (reproceso = reemplazo); `false` en la vía manual,
   * que solo añade.
   */
  replaceExisting: boolean;
  /**
   * Crea una tarea aunque el modelo considere el correo no accionable. Lo usa
   * la vía manual: si una persona pide convertirlo, su criterio manda.
   */
  forceActionable: boolean;
}

export interface ClassifyResult {
  isActionable: boolean;
  category: string;
  tasks: Task[];
  /** `true` si el modelo no extrajo tareas y se generó una desde el asunto. */
  usedFallback: boolean;
}

/**
 * Una tarea tal como la propone el análisis, antes de existir en la base de
 * datos. No tiene `id` porque todavía no es una fila: es lo que se le enseña a
 * una persona para que lo apruebe, lo edite o lo tire.
 */
export interface TaskDraft {
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  dueDate: Date | null;
  /** `EMAIL` si la extrajo el modelo; `MANUAL` si es el respaldo del asunto. */
  source: TaskSource;
}

/** Resultado del análisis sin tocar la base de datos. */
export interface ClassificationDraft {
  emailId: string;
  isActionable: boolean;
  category: string;
  aiConfidence: number;
  tasks: TaskDraft[];
  /** `true` si el modelo no extrajo tareas y se generó una desde el asunto. */
  usedFallback: boolean;
}

/**
 * Analiza un correo con la IA y persiste el resultado en una transacción.
 *
 * Vive aquí, y no en el worker, porque tiene dos consumidores que deben
 * comportarse igual: `AiProcessor` (cola `classify-email`) y la conversión
 * manual del `EmailsController`.
 */
@Injectable()
export class EmailClassificationService {
  private readonly logger = new Logger(EmailClassificationService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Analiza el correo y devuelve lo que propondría, **sin escribir nada**.
   *
   * Es la mitad de arriba de `classifyAndPersist`. Existe porque el flujo de
   * validación humana necesita enseñar la propuesta antes de que sea real: si
   * el análisis y la escritura van juntos, cuando el frontend recibe la
   * respuesta las tareas ya están creadas y no queda nada que aprobar.
   *
   * No marca el correo como procesado: clasificar para mirar no es haberlo
   * despachado, y dejar `processedAt` aquí haría que el worker se lo saltara.
   */
  async classify(
    emailId: string,
    options: { forceActionable: boolean },
  ): Promise<ClassificationDraft> {
    const email = await this.prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    return this.analyze(email, options.forceActionable);
  }

  async classifyAndPersist(emailId: string, options: ClassifyOptions): Promise<ClassifyResult> {
    const email = await this.prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    const draft = await this.analyze(email, options.forceActionable);
    const { isActionable, category, aiConfidence, usedFallback } = draft;

    const toCreate: Prisma.TaskCreateManyInput[] = draft.tasks.map((task, index) => ({
      userId: email.userId,
      sourceEmailId: email.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      tags: task.tags,
      dueDate: task.dueDate,
      aiConfidence,
      position: index,
      source: task.source,
    }));

    const tasks = await this.prisma.$transaction(async (tx) => {
      if (options.replaceExisting) {
        // Solo lo que generó la IA para este correo. Lo que puso una persona
        // (MANUAL) o llegó por otro canal sobrevive al reproceso.
        const { count } = await tx.task.deleteMany({
          where: { sourceEmailId: email.id, source: TaskSource.EMAIL },
        });
        if (count > 0) {
          this.logger.log(`Reproceso: borradas ${count} tareas previas del email ${emailId}`);
        }
      }

      await tx.email.update({
        where: { id: email.id },
        data: {
          isActionable,
          category,
          processedAt: new Date(),
        },
      });

      if (toCreate.length === 0) return [];

      // `createMany` no devuelve las filas creadas y la UI necesita los ids.
      return Promise.all(toCreate.map((data) => tx.task.create({ data })));
    });

    return { isActionable, category, tasks, usedFallback };
  }

  /**
   * Lo común a las dos vías: pedirle el análisis al modelo y dejarlo listo para
   * persistir, con la prioridad ya pasada por la capa determinista.
   */
  private async analyze(
    email: {
      id: string;
      subject: string | null;
      snippet: string | null;
      bodyText: string | null;
      receivedAt: Date;
      /** Cabecera `From` cruda: de ahí sale el remitente del prefijo. */
      from: string;
    },
    forceActionable: boolean,
  ): Promise<ClassificationDraft> {
    const textToAnalyze = email.bodyText || email.snippet || '';
    if (!textToAnalyze) {
      throw new Error(`El email ${email.id} no tiene texto para analizar.`);
    }

    const analysis = await this.ai.analyzeEmail(
      email.subject || '(Sin Asunto)',
      textToAnalyze,
      email.receivedAt,
    );

    const isActionable = analysis.isActionable || forceActionable;

    // Quién manda el correo sale de la cabecera, no del modelo (decisión de Doc
    // el 2026-07-28): es un dato duro y el modelo tendía a elegir a la persona
    // de la que hablaba el cuerpo. Solo si la cabecera no da nada aprovechable
    // se recurre a lo que dijera él, que es mejor que quedarse sin contexto.
    const contexto = {
      senderName: senderFromHeader(email.from) ?? analysis.senderName,
      project: analysis.project,
    };

    // El prefijo se compone aquí, sobre la lista ya filtrada, para que el
    // contador cuadre con las tareas que de verdad van a existir.
    const titulos = withContextPrefix(
      analysis.tasks.map((t) => t.title),
      contexto,
    );

    let tasks: TaskDraft[] = isActionable
      ? analysis.tasks.map((task, i) => ({
          title: titulos[i],
          description: task.description,
          // La prioridad del modelo pasa por la capa determinista antes de
          // persistirse: la fecha puede subirla, nunca bajarla.
          priority: this.resolvePriority(task, analysis.aiConfidence, email.id),
          tags: task.tags,
          dueDate: task.dueDate,
          source: TaskSource.EMAIL,
        }))
      : [];

    // El modelo no vio nada accionable pero una persona insiste: no la dejamos
    // sin tarea. Se propone una desde el asunto y se marca MANUAL, porque el
    // criterio que la justifica es el de la persona, no el del modelo: un
    // reproceso posterior no debe borrarla.
    const usedFallback = forceActionable && tasks.length === 0;
    if (usedFallback) {
      tasks = [
        {
          // Lleva el mismo prefijo que las demás: al tablero le da igual que
          // esta saliera del asunto y no del modelo, y una tarjeta sin contexto
          // entre otras con él se lee como un fallo.
          title: withContextPrefix(
            [email.subject?.trim() || 'Tarea desde correo sin asunto'],
            contexto,
          )[0],
          description: email.snippet ?? '',
          priority: TaskPriority.MEDIUM,
          tags: [],
          dueDate: null,
          source: TaskSource.MANUAL,
        },
      ];
    }

    return {
      emailId: email.id,
      isActionable,
      category: analysis.category,
      aiConfidence: analysis.aiConfidence,
      tasks,
      usedFallback,
    };
  }

  /**
   * Aplica la capa determinista y deja constancia del ajuste.
   *
   * El log es, de momento, el único rastro de por qué una tarea acabó en
   * `URGENT`: la columna para persistir el motivo llega con el panel de
   * auditoría del Sprint 3, que sigue pendiente.
   */
  private resolvePriority(
    task: { title: string; priority: TaskPriority; dueDate: Date | null },
    aiConfidence: number,
    emailId: string,
  ): TaskPriority {
    const decision = adjustPriority(
      { priority: task.priority, dueDate: task.dueDate, aiConfidence },
      // `new Date()` explícito: la función es pura y el instante entra por
      // parámetro para que las pruebas no dependan del reloj.
      new Date(),
    );

    if (decision.adjusted) {
      this.logger.log(`Prioridad ajustada en "${task.title}" (email ${emailId}): ${decision.reason}`);
    }

    return decision.priority;
  }
}
