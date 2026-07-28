import { Module } from '@nestjs/common';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  // `TasksModule` entra por el gateway: convertir un correo crea tarjetas, y el
  // tablero tiene que enterarse igual que si se hubieran creado desde él.
  imports: [AuthModule, AiModule, TasksModule],
  controllers: [EmailsController],
  providers: [EmailsService],
})
export class EmailsModule {}
