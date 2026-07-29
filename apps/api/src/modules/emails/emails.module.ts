import { Module } from '@nestjs/common';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { TagsModule } from '../tags/tags.module';

@Module({
  // `TasksModule` entra por el gateway: convertir un correo crea tarjetas, y el
  // tablero tiene que enterarse igual que si se hubieran creado desde él.
  // `TagsModule` por `resolveIds`: la cuarentena permite colgar etiquetas del
  // usuario en cada tarea aprobada, y hay que comprobar que son suyas.
  imports: [AuthModule, AiModule, TasksModule, TagsModule],
  controllers: [EmailsController],
  providers: [EmailsService],
})
export class EmailsModule {}
