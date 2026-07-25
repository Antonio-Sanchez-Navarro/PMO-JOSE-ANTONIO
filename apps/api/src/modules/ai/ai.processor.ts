import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailClassificationService } from './email-classification.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Processor('classify-email')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly classification: EmailClassificationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const emailId = job.data.emailId;
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
