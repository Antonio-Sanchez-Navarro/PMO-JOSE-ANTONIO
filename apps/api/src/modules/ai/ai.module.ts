import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CostsModule } from '../../common/costs/costs.module';
import { AlertModule } from '../../common/alerts/alert.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';
import { EmailClassificationService } from './email-classification.service';

@Module({
  // `TasksModule` entra por su gateway: cuando el worker termina de clasificar
  // un correo, la bandeja abierta tiene que enterarse sola. Sin ciclo —
  // `TasksModule` no depende de este.
  imports: [ConfigModule, CostsModule, AlertModule, TasksModule],
  providers: [AiService, AiProcessor, EmailClassificationService],
  // `EmailClassificationService` lo consume también `EmailsModule` para la
  // conversión manual de un correo en tarea.
  exports: [AiService, EmailClassificationService],
})
export class AiModule {}
