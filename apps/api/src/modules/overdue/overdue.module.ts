import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { OverdueService } from './overdue.service';
import { OverdueProcessor } from './overdue.processor';
import { OverdueCronPurge } from './overdue.cron-purge';
import { OVERDUE_QUEUE } from './overdue.constants';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  // `TasksModule` aporta el `TasksGateway` con el que el barrido anuncia sus
  // cambios. La dependencia va en un solo sentido: tareas no sabe del cron.
  //
  // `OverdueScheduler` ya no está: el barrido dejó de ser un repetible de
  // BullMQ y lo dispara Cloud Scheduler contra `/cron/overdue` (ver
  // `cron.controller.ts`). En su lugar queda `OverdueCronPurge`, que borra de
  // Redis lo que aquel dejó programado — quitar el código no apaga un cron que
  // vive en la base.
  //
  // `OverdueService` se exporta para que `CronModule` pueda invocarlo sin
  // duplicar la lógica en el controlador.
  imports: [ConfigModule, TasksModule, BullModule.registerQueue({ name: OVERDUE_QUEUE })],
  providers: [OverdueService, OverdueProcessor, OverdueCronPurge],
  exports: [OverdueService],
})
export class OverdueModule {}
