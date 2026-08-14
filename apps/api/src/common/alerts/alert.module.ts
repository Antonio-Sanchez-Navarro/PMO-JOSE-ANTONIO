import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AlertService } from './alert.service';
import { COLA_DE_ALERTAS } from './alert.constants';

/**
 * Las alertas, disponibles en toda la aplicación.
 *
 * **Es `@Global()` a propósito.** Lo que hay que vigilar no vive en un dominio:
 * está en el cron de Gmail, en el webhook, en el filtro de excepciones y en los
 * oyentes de la cola de fallidos. Obligar a cada módulo a importar este sería
 * garantizar que el próximo sitio que deba avisar no lo haga — y un punto ciego
 * es exactamente lo que este módulo viene a cerrar.
 */
@Global()
@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: COLA_DE_ALERTAS })],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
