import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ClassifyEmailDLQListener, GmailSyncDLQListener } from './dead-letter.listener';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'dead-letter',
    }),
  ],
  providers: [GmailSyncDLQListener, ClassifyEmailDLQListener],
})
export class DeadLetterModule {}
