import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { GmailProcessor } from './gmail.processor';
import { PubSubAuthGuard } from './pubsub-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../../common/security/security.module';

@Module({
  // AuthModule aporta el AuthGuard que protege el controlador.
  // SecurityModule aporta el verificador de tokens OIDC de `PubSubAuthGuard`.
  imports: [
    AuthModule,
    SecurityModule,
    BullModule.registerQueue(
      { name: 'gmail-sync' },
      { name: 'classify-email' }
    ),
  ],
  providers: [GmailService, GmailProcessor, PubSubAuthGuard],
  controllers: [GmailController],
  exports: [GmailService],
})
export class GmailModule {}
