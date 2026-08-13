import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { OverdueService } from './overdue.service';
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
  //
  // **`OverdueProcessor` también se fue** (2026-08-13): consumía la cola que
  // alimentaba el repetible, y desde que el barrido lo dispara Cloud Scheduler
  // **nadie encola nada ahí**. Un worker sobre una cola sin productor no está
  // ocioso: mantiene su llamada bloqueante contra Redis y la rehace cada pocos
  // segundos, así que estaba pagando cuota de Upstash por esperar un trabajo
  // que no podía llegar.
  //
  // La cola sigue registrada porque `OverdueCronPurge` necesita el objeto
  // `Queue` para borrar lo que quedara programado. Un `Queue` no sondea: solo
  // habla con Redis cuando se le pide algo.
  imports: [ConfigModule, TasksModule, BullModule.registerQueue({ name: OVERDUE_QUEUE })],
  providers: [OverdueService, OverdueCronPurge],
  exports: [OverdueService],
})
export class OverdueModule {}
