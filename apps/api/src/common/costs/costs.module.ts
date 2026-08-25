import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiCostService } from './ai-cost.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertModule } from '../alerts/alert.module';

/**
 * La contabilidad de lo que consumen las APIs de modelos.
 *
 * Vive en `common/` porque la usan dos módulos que no dependen el uno del otro
 * —la clasificación y el copiloto— y porque el problema que resuelve es
 * justamente que **no lleven cuentas distintas**.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AlertModule],
  providers: [AiCostService],
  exports: [AiCostService],
})
export class CostsModule {}
