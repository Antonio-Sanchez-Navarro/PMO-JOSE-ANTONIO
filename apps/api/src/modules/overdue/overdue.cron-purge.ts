import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OVERDUE_QUEUE, OVERDUE_SCHEDULER_ID } from './overdue.constants';
import {
  describirError,
  stackDe,
} from '../../common/observability/describir-error';

/**
 * Borra de Redis el cron repetible que este módulo programaba.
 *
 * **Quitar el código que lo creaba no lo apaga.** El planificador de BullMQ
 * vive en Redis, no en el proceso: `bull:overdue-sweep:*` sobrevive al
 * despliegue que borra el `upsertJobScheduler`, y con Upstash —que es
 * persistente— sobrevive indefinidamente. El resultado sería el peor de los
 * dos mundos: Cloud Scheduler llamando a `/cron/overdue` **y** el repetible
 * viejo encolando su propio barrido cada vez que alguien despierte el
 * contenedor. Dos barridos, ninguno de los dos a la hora esperada.
 *
 * Por eso la retirada es una acción explícita y no una ausencia de código.
 *
 * **Se ejecuta en cada arranque a propósito.** Es idempotente —si no hay nada
 * que borrar no hace nada y no dice nada—, y así cubre el caso de una revisión
 * vieja que vuelva a servir tráfico por un rollback y reprograme el repetible.
 * Cuando el registro lleve semanas sin mencionar ni una purga, esta clase se
 * puede borrar; hasta entonces cuesta una llamada a Redis por arranque.
 *
 * @see cron.controller.ts — quien hace ahora el trabajo, disparado por HTTP.
 */
@Injectable()
export class OverdueCronPurge implements OnModuleInit {
  private readonly logger = new Logger(OverdueCronPurge.name);

  constructor(@InjectQueue(OVERDUE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    try {
      let borrados = 0;

      // 1) El planificador con nuestro id, que es el que creaba `upsertJobScheduler`.
      if (await this.queue.removeJobScheduler(OVERDUE_SCHEDULER_ID)) {
        borrados++;
        this.logger.warn(
          `Purgado el planificador BullMQ "${OVERDUE_SCHEDULER_ID}": el barrido lo dispara ahora Cloud Scheduler`,
        );
      }

      // 2) Cualquier otro planificador de esta cola. Si alguien cambió el id en
      //    el pasado, el anterior sigue vivo bajo otro nombre y el paso 1 no lo
      //    ve. Se limita a esta cola, así que no puede tocar nada ajeno.
      for (const planificador of await this.queue.getJobSchedulers()) {
        if (!planificador.key) continue;
        if (await this.queue.removeJobScheduler(planificador.key)) {
          borrados++;
          this.logger.warn(`Purgado un planificador BullMQ huérfano: "${planificador.key}"`);
        }
      }

      // 3) Los repetibles del formato antiguo (`queue.add({ repeat })`), que no
      //    aparecen como planificadores. El propio código de este módulo los usó
      //    antes de migrar a `upsertJobScheduler`, y aquella migración ya dejó
      //    claves huérfanas una vez.
      for (const repetible of await this.queue.getRepeatableJobs()) {
        await this.queue.removeRepeatableByKey(repetible.key);
        borrados++;
        this.logger.warn(`Purgado un repetible BullMQ heredado: "${repetible.key}"`);
      }

      if (borrados === 0) {
        this.logger.log('Sin crones BullMQ pendientes de purgar en la cola de vencidas');
      }
    } catch (error) {
      // No se propaga: sin Redis la API sigue sirviendo el tablero. Lo que no
      // puede pasar es que un fallo aquí tumbe el arranque, porque entonces un
      // Redis caído dejaría la API entera fuera por una tarea de limpieza.
      this.logger.error(
        `No se pudo purgar el cron BullMQ de vencidas (¿Redis caído?). Puede quedar un barrido duplicado: ${describirError(error)}`,
        stackDe(error),
      );
    }
  }
}
