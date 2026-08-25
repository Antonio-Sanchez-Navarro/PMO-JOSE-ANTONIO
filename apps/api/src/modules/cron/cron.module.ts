import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CronController } from './cron.controller';
import { CronAuthGuard } from './cron-auth.guard';
import { SecurityModule } from '../../common/security/security.module';
import { OverdueModule } from '../overdue/overdue.module';
import { GmailModule } from '../gmail/gmail.module';
import { AlertModule } from '../../common/alerts/alert.module';
import { CostsModule } from '../../common/costs/costs.module';
import { FrontendAlDiaService } from './frontend-al-dia.service';

/**
 * Las rutas que dispara Cloud Scheduler.
 *
 * No aporta lógica propia: `OverdueModule` y `GmailModule` ya exportan lo que
 * hay que ejecutar, y este módulo solo pone la puerta HTTP y su guard. Así el
 * trabajo sigue viviendo en su dominio y se puede llamar igual desde un test o
 * desde otro sitio, sin pasar por la ruta.
 */
@Module({
  imports: [ConfigModule, SecurityModule, OverdueModule, GmailModule, AlertModule, CostsModule],
  controllers: [CronController],
  providers: [CronAuthGuard, FrontendAlDiaService],
})
export class CronModule {}
