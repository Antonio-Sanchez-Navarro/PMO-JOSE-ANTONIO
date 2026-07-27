import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksGateway } from './tasks.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, TasksGateway],
  // El gateway sale del módulo porque el barrido de vencidas también anuncia
  // sus cambios: es el tercer sitio donde una tarea se modifica.
  exports: [TasksService, TasksGateway],
})
export class TasksModule {}
