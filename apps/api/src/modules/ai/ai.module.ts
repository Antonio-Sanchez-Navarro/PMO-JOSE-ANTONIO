import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CostsModule } from '../../common/costs/costs.module';
import { AlertModule } from '../../common/alerts/alert.module';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';
import { EmailClassificationService } from './email-classification.service';

@Module({
  imports: [ConfigModule, CostsModule, AlertModule],
  providers: [AiService, AiProcessor, EmailClassificationService],
  // `EmailClassificationService` lo consume también `EmailsModule` para la
  // conversión manual de un correo en tarea.
  exports: [AiService, EmailClassificationService],
})
export class AiModule {}
