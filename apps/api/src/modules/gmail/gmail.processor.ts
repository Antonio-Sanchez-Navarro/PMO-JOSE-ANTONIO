import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { GmailService } from './gmail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AJUSTE_WORKER } from '../../common/bullmq/polling.config';
import { describirError, stackDe } from '../../common/observability/describir-error';

interface SyncHistoryJob {
  emailAddress?: string;
  historyId?: string;
}

interface WatchInboxJob {
  userId?: string;
}

type GmailJob = SyncHistoryJob & WatchInboxJob;

@Processor('gmail-sync', { ...AJUSTE_WORKER })
export class GmailProcessor extends WorkerHost {
  private readonly logger = new Logger(GmailProcessor.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<GmailJob, unknown, string>): Promise<unknown> {
    // La cola `gmail-sync` transporta dos tipos de trabajo.
    if (job.name === 'watch-inbox') {
      return this.handleWatchInbox(job);
    }
    return this.handleSyncHistory(job);
  }

  /** Activa las notificaciones push de Gmail tras el login (`users.watch`). */
  private async handleWatchInbox(job: Job<GmailJob>): Promise<void> {
    const { userId } = job.data;
    if (!userId) {
      this.logger.warn('Job watch-inbox descartado: falta userId');
      return;
    }

    this.logger.log(`Activando watch de Gmail para el usuario ${userId}`);
    const result = await this.gmailService.watchInbox(userId);
    if (!result.ok) {
      throw new Error(`Falló watchInbox para el usuario ${userId}: ${result.motivo}`);
    }
  }

  private async handleSyncHistory(job: Job<GmailJob>): Promise<unknown> {
    this.logger.log(`Procesando tarea de sincronización para el job ${job.id}`);

    const { emailAddress, historyId } = job.data;
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
      const result = await this.gmailService.syncHistory(user.id, historyId);
      this.logger.log(
        `Sincronización completada para ${user.id}: ${result.processed} correo(s) en modo ${result.mode}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Falló la sincronización para el usuario ${user.id}: ${describirError(error)}`, stackDe(error));
      throw error; // Lanzar error para que BullMQ lo reintente si aplica
    }
  }
}
