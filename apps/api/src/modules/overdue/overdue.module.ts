import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { OverdueService } from './overdue.service';
import { OverdueProcessor } from './overdue.processor';
import { OverdueScheduler } from './overdue.scheduler';
import { OVERDUE_QUEUE } from './overdue.constants';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  // `TasksModule` aporta el `TasksGateway` con el que el barrido anuncia sus
  // cambios. La dependencia va en un solo sentido: tareas no sabe del cron.
  imports: [ConfigModule, TasksModule, BullModule.registerQueue({ name: OVERDUE_QUEUE })],
  providers: [OverdueService, OverdueProcessor, OverdueScheduler],
  exports: [OverdueService],
})
export class OverdueModule {}
