import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DEFAULT_OVERDUE_CRON, OVERDUE_QUEUE, OVERDUE_SCHEDULER_ID } from './overdue.constants';

/**
 * Programa el barrido de vencidas al arrancar.
 *
 * Se hace con un job repetible de BullMQ y no con `@nestjs/schedule` para que
 * el cron viva en Redis: con varias instancias de la API, el barrido lo ejecuta
 * una sola (un `@Cron` en proceso correría en todas a la vez).
 */
@Injectable()
export class OverdueScheduler implements OnModuleInit {
  private readonly logger = new Logger(OverdueScheduler.name);

  constructor(
    @InjectQueue(OVERDUE_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const pattern = this.config.get<string>('OVERDUE_CRON') || DEFAULT_OVERDUE_CRON;

    try {
      // `upsertJobScheduler` reemplaza la programación anterior con el mismo id.
      // Con `queue.add({ repeat })` cada cambio de patrón dejaba una clave de
      // repetición huérfana y el barrido acababa corriendo dos veces.
      await this.queue.upsertJobScheduler(
        OVERDUE_SCHEDULER_ID,
        {
          pattern,
          // Un barrido nada más arrancar: tras un despliegue (o una noche con la
          // API apagada) las tareas vencidas aparecen sin esperar a la hora en punto.
          immediately: true,
        },
        {
          name: 'sweep',
          opts: { removeOnComplete: 50, removeOnFail: 100 },
        },
      );

      this.logger.log(`Barrido de vencidas programado con el patrón "${pattern}"`);
    } catch (error) {
      // No se propaga: sin Redis la API sigue sirviendo el tablero, solo deja de
      // marcar vencidas. El error queda explícito en el log para no confundirlo
      // con un fallo del cron en sí.
      this.logger.error(
        `No se pudo programar el barrido de vencidas (¿Redis caído?). Las tareas no pasarán a OVERDUE.`,
        error,
      );
    }
  }
}
