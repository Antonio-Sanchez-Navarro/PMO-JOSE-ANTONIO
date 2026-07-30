import { Logger } from '@nestjs/common';
import { QueueEventsListener, QueueEventsHost, InjectQueue, OnQueueEvent } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@QueueEventsListener('gmail-sync')
export class GmailSyncDLQListener extends QueueEventsHost {
  private readonly logger = new Logger(GmailSyncDLQListener.name);

  constructor(@InjectQueue('dead-letter') private readonly dlq: Queue) {
    super();
  }

  @OnQueueEvent('failed')
  async onFailed(args: { jobId: string; failedReason: string; prev?: string }) {
    this.logger.warn(`Job ${args.jobId} en gmail-sync falló: ${args.failedReason}`);
    await this.dlq.add('dead-letter-job', {
      originalQueue: 'gmail-sync',
      jobId: args.jobId,
      reason: args.failedReason,
    });
  }
}

@QueueEventsListener('classify-email')
export class ClassifyEmailDLQListener extends QueueEventsHost {
  private readonly logger = new Logger(ClassifyEmailDLQListener.name);

  constructor(@InjectQueue('dead-letter') private readonly dlq: Queue) {
    super();
  }

  @OnQueueEvent('failed')
  async onFailed(args: { jobId: string; failedReason: string; prev?: string }) {
    this.logger.warn(`Job ${args.jobId} en classify-email falló: ${args.failedReason}`);
    await this.dlq.add('dead-letter-job', {
      originalQueue: 'classify-email',
      jobId: args.jobId,
      reason: args.failedReason,
    });
  }
}
