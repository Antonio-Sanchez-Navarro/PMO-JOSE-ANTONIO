import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';
import { EmailClassificationService } from './email-classification.service';

@Module({
  imports: [ConfigModule],
  providers: [AiService, AiProcessor, EmailClassificationService],
  // `EmailClassificationService` lo consume también `EmailsModule` para la
  // conversión manual de un correo en tarea.
  exports: [AiService, EmailClassificationService],
})
export class AiModule {}
