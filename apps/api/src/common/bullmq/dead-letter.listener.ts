import { Logger } from '@nestjs/common';
import { QueueEventsListener, QueueEventsHost, InjectQueue, OnQueueEvent } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AJUSTE_EVENTOS } from './polling.config';
import { AlertService } from '../alerts/alert.service';

/**
 * Los jobs que se rindieron.
 *
 * **`QueueEvents.failed` se emite solo cuando el job llega al conjunto
 * `failed`**, es decir tras agotar sus reintentos — no en cada intento
 * fallido. Así que lo que pasa por aquí es trabajo definitivamente perdido:
 * un correo que no se sincronizó, una clasificación que no se hizo.
 *
 * ⚠️ **Hasta el 2026-08-15 esto se anotaba en una cola que no leía nadie.**
 * Los dos oyentes escribían en `dead-letter` y ningún proceso la consumía, así
 * que el registro existía y la información no llegaba a ninguna parte. La cola
 * se conserva —es el histórico, y sirve para reprocesar— pero ahora además se
 * avisa: un trabajo perdido en silencio es indistinguible de uno que no
 * existió.
 */
@QueueEventsListener('gmail-sync', { ...AJUSTE_EVENTOS })
export class GmailSyncDLQListener extends QueueEventsHost {
  private readonly logger = new Logger(GmailSyncDLQListener.name);

  constructor(
    @InjectQueue('dead-letter') private readonly dlq: Queue,
    private readonly alertas: AlertService,
  ) {
    super();
  }

  @OnQueueEvent('failed')
  async onFailed(args: { jobId: string; failedReason: string; prev?: string }) {
    this.logger.warn(`Job ${args.jobId} en gmail-sync falló: ${args.failedReason}`);

    void this.alertas.avisar(
      'Correo entrante perdido: un job agotó sus reintentos',
      `cola=gmail-sync job=${args.jobId} · ${args.failedReason}`,
      'dlq-gmail-sync',
    );

    await this.dlq.add('dead-letter-job', {
      originalQueue: 'gmail-sync',
      jobId: args.jobId,
      reason: args.failedReason,
    });
  }
}

@QueueEventsListener('classify-email', { ...AJUSTE_EVENTOS })
export class ClassifyEmailDLQListener extends QueueEventsHost {
  private readonly logger = new Logger(ClassifyEmailDLQListener.name);

  constructor(
    @InjectQueue('dead-letter') private readonly dlq: Queue,
    private readonly alertas: AlertService,
  ) {
    super();
  }

  @OnQueueEvent('failed')
  async onFailed(args: { jobId: string; failedReason: string; prev?: string }) {
    this.logger.warn(`Job ${args.jobId} en classify-email falló: ${args.failedReason}`);

    void this.alertas.avisar(
      'Clasificación perdida: un job agotó sus reintentos',
      `cola=classify-email job=${args.jobId} · ${args.failedReason}`,
      'dlq-classify-email',
    );

    await this.dlq.add('dead-letter-job', {
      originalQueue: 'classify-email',
      jobId: args.jobId,
      reason: args.failedReason,
    });
  }
}
