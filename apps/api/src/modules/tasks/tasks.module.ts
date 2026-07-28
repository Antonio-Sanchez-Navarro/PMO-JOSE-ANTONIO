import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksGateway } from './tasks.gateway';
import { AuthModule } from '../auth/auth.module';
import { TagsModule } from '../tags/tags.module';

@Module({
  // `TagsModule` entra porque crear una tarea puede colgarle etiquetas del
  // usuario, y comprobar que son suyas es responsabilidad de ese servicio.
  imports: [AuthModule, TagsModule],
  controllers: [TasksController],
  providers: [TasksService, TasksGateway],
  // El gateway sale del módulo porque el barrido de vencidas también anuncia
  // sus cambios: es el tercer sitio donde una tarea se modifica.
  exports: [TasksService, TasksGateway],
})
export class TasksModule {}
