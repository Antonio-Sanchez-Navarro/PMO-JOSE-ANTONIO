import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailClassificationService } from './email-classification.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ClassifyEmailJob, ClassifyEmailResult } from './classify-email.job';

@Processor('classify-email')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly classification: EmailClassificationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(
    job: Job<ClassifyEmailJob, ClassifyEmailResult, string>,
  ): Promise<ClassifyEmailResult> {
    // Sigue comprobándose aunque el tipo lo dé por seguro: lo que llega de la
    // cola es JSON que se serializó en otro proceso, quizá con una versión
    // anterior del código. El tipo protege de escribir mal el productor, no de
    // un job viejo que ya estaba en Redis.
    const emailId = job.data?.emailId;
    if (!emailId) {
      this.logger.warn('Job descartado: falta emailId');
      return;
    }

    this.logger.log(`Procesando clasificación de email ${emailId}`);

    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: { id: true, processedAt: true, bodyText: true, snippet: true },
    });

    if (!email) {
      this.logger.warn(`Email no encontrado: ${emailId}`);
      return;
    }

    // Idempotencia: la cola puede reentregar el mismo job.
    if (email.processedAt) {
      this.logger.log(`El email ${emailId} ya fue procesado el ${email.processedAt}. Omitiendo.`);
      return;
    }

    if (!email.bodyText && !email.snippet) {
      this.logger.warn(`El email ${emailId} no tiene texto para analizar.`);
      return;
    }

    try {
      const result = await this.classification.classifyAndPersist(emailId, {
        // Reproceso = reemplazo: si el correo ya tenía tareas de la IA, se
        // sustituyen en lugar de duplicarse.
        replaceExisting: true,
        // El worker respeta el criterio del modelo; forzar es cosa de la vía
        // manual (`POST /emails/:id/to-task`).
        forceActionable: false,
      });

      this.logger.log(
        `Resultado de IA para ${emailId}: isActionable=${result.isActionable}` +
          (result.tasks.length ? `, ${result.tasks.length} tareas creadas` : ''),
      );
    } catch (error) {
      this.logger.error(`Falló la clasificación del email ${emailId}`, error);
      throw error; // Para que BullMQ lo reintente si hay redelivery configurado
    }
  }
}
