import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Métricas del panel (Sprint 8).
 *
 * `MetricsService` se exporta porque tiene dos consumidores: esta ruta REST y la
 * herramienta `get_metrics` del copiloto. Es el servicio compartido del que
 * salen las dos proyecciones.
 */
@Module({
  imports: [AuthModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
