import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Processor('classify-email')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly aiService: AiService,
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

    // Paso A: Cargar el Email
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
    });

    if (!email) {
      this.logger.warn(`Email no encontrado: ${emailId}`);
      return;
    }

    // Paso E (Idempotencia)
    if (email.processedAt) {
      this.logger.log(`El email ${emailId} ya fue procesado el ${email.processedAt}. Omitiendo.`);
      return;
    }

    try {
      // Paso B: Análisis
      const textToAnalyze = email.bodyText || email.snippet || '';
      
      if (!textToAnalyze) {
        this.logger.warn(`El email ${emailId} no tiene texto para analizar.`);
        return;
      }

      const result = await this.aiService.analyzeEmail(
        email.subject || '(Sin Asunto)',
        textToAnalyze,
        email.receivedAt,
      );

      this.logger.log(`Resultado de IA para ${emailId}: isActionable=${result.isActionable}`);

      // Paso C y D en una transacción para mantener consistencia
      await this.prisma.$transaction(async (tx) => {
        // Actualizar el Email
        await tx.email.update({
          where: { id: emailId },
          data: {
            isActionable: result.isActionable,
            category: result.category,
            processedAt: new Date(),
          },
        });

        // Crear las Tareas si es accionable
        if (result.isActionable && result.tasks && result.tasks.length > 0) {
          const tasksToCreate = result.tasks.map((task, index) => ({
            userId: email.userId,
            sourceEmailId: email.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            tags: task.tags || [],
            dueDate: task.dueDate,
            aiConfidence: result.aiConfidence,
            position: index,
          }));

          await tx.task.createMany({
            data: tasksToCreate,
          });
          
          this.logger.log(`Creadas ${tasksToCreate.length} tareas para el email ${emailId}`);
        }
      });

    } catch (error) {
      this.logger.error(`Falló la clasificación del email ${emailId}`, error);
      throw error; // Para que BullMQ lo reintente si hay redelivery configurado
    }
  }
}
