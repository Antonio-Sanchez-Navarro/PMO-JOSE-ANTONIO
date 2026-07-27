import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { OverdueService } from './overdue.service';
import { OverdueProcessor } from './overdue.processor';
import { OverdueScheduler } from './overdue.scheduler';
import { OVERDUE_QUEUE } from './overdue.constants';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: OVERDUE_QUEUE })],
  providers: [OverdueService, OverdueProcessor, OverdueScheduler],
  exports: [OverdueService],
})
export class OverdueModule {}
