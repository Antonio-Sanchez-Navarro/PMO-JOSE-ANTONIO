import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Task, TaskPriority } from '@prisma/client';
import { AiService } from './ai.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Etiqueta que marca las tareas creadas a mano desde `POST /emails/:id/to-task`.
 *
 * El reproceso automático borra las tareas que generó la IA para ese correo
 * (ver `replaceExisting`); sin esta marca se llevaría por delante también las
 * que creó una persona. Es un apaño: lo correcto es una columna `source`
 * ('email' | 'whatsapp' | 'manual') en `Task`, que ya está planificada en el
 * Sprint 4 ("indicador de origen"). Cuando exista, sustituir este filtro.
 */
export const MANUAL_TAG = 'manual';

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

  async classifyAndPersist(emailId: string, options: ClassifyOptions): Promise<ClassifyResult> {
    const email = await this.prisma.email.findUniqueOrThrow({ where: { id: emailId } });

    const textToAnalyze = email.bodyText || email.snippet || '';
    if (!textToAnalyze) {
      throw new Error(`El email ${emailId} no tiene texto para analizar.`);
    }

    const analysis = await this.ai.analyzeEmail(
      email.subject || '(Sin Asunto)',
      textToAnalyze,
      email.receivedAt,
    );

    const isActionable = analysis.isActionable || options.forceActionable;

    let toCreate: Prisma.TaskCreateManyInput[] = isActionable
      ? analysis.tasks.map((task, index) => ({
          userId: email.userId,
          sourceEmailId: email.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          tags: task.tags,
          dueDate: task.dueDate,
          aiConfidence: analysis.aiConfidence,
          position: index,
        }))
      : [];

    // El modelo no vio nada accionable pero una persona insiste: no la dejamos
    // sin tarea. Se crea una desde el asunto, con la marca manual.
    const usedFallback = options.forceActionable && toCreate.length === 0;
    if (usedFallback) {
      toCreate = [
        {
          userId: email.userId,
          sourceEmailId: email.id,
          title: email.subject?.trim() || 'Tarea desde correo sin asunto',
          description: email.snippet ?? '',
          priority: TaskPriority.MEDIUM,
          tags: [MANUAL_TAG],
          aiConfidence: analysis.aiConfidence,
          position: 0,
        },
      ];
    }

    const tasks = await this.prisma.$transaction(async (tx) => {
      if (options.replaceExisting) {
        const { count } = await tx.task.deleteMany({
          where: { sourceEmailId: email.id, NOT: { tags: { has: MANUAL_TAG } } },
        });
        if (count > 0) {
          this.logger.log(`Reproceso: borradas ${count} tareas previas del email ${emailId}`);
        }
      }

      await tx.email.update({
        where: { id: email.id },
        data: {
          isActionable,
          category: analysis.category,
          processedAt: new Date(),
        },
      });

      if (toCreate.length === 0) return [];

      // `createMany` no devuelve las filas creadas y la UI necesita los ids.
      return Promise.all(toCreate.map((data) => tx.task.create({ data })));
    });

    return { isActionable, category: analysis.category, tasks, usedFallback };
  }
}
