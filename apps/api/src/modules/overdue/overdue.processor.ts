import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OverdueService } from './overdue.service';
import { OVERDUE_QUEUE } from './overdue.constants';

/**
 * Consume la cola repetible que programa `OverdueScheduler`.
 *
 * No lleva guarda de idempotencia propia: `OverdueService.sweep` solo toca
 * tareas que aún no están en `OVERDUE`, así que una reentrega es un no-op.
 */
@Processor(OVERDUE_QUEUE)
export class OverdueProcessor extends WorkerHost {
  private readonly logger = new Logger(OverdueProcessor.name);

  constructor(private readonly overdue: OverdueService) {
    super();
  }

  async process(job: Job): Promise<{ candidates: number; moved: number; users: number }> {
    this.logger.log(`Barriendo tareas vencidas (job ${job.id})`);
    return this.overdue.sweep();
  }
}
