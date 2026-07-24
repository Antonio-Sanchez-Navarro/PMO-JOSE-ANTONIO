import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { GmailService } from './gmail.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Processor('gmail-sync')
export class GmailProcessor extends WorkerHost {
  private readonly logger = new Logger(GmailProcessor.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Procesando tarea de sincronización para el job ${job.id}`);

    const emailAddress = job.data.emailAddress;
    if (!emailAddress) {
      this.logger.warn('Job descartado: falta emailAddress en los datos');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: emailAddress },
      select: { id: true },
    });

    if (!user) {
      this.logger.warn(`Usuario no encontrado para el email: ${emailAddress}`);
      return;
    }

    try {
      await this.gmailService.syncHistory(user.id);
      this.logger.log(`Sincronización completada con éxito para el usuario ${user.id}`);
    } catch (error) {
      this.logger.error(`Falló la sincronización para el usuario ${user.id}`, error);
      throw error; // Lanzar error para que BullMQ lo reintente si aplica
    }
  }
}
