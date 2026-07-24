import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { GmailProcessor } from './gmail.processor';
import { PubSubAuthGuard } from './pubsub-auth.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule aporta el AuthGuard que protege el controlador.
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: 'gmail-sync',
    }),
  ],
  providers: [GmailService, GmailProcessor, PubSubAuthGuard],
  controllers: [GmailController],
  exports: [GmailService],
})
export class GmailModule {}
