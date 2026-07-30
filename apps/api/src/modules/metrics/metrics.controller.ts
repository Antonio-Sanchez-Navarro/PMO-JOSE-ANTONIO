import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { QueryMetricsDto } from './dto/query-metrics.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

/**
 * Métricas del panel (Sprint 8).
 *
 * `dashboard` y no `metrics` como prefijo porque el nombre describe para qué es
 * —la vista de paneles— y deja libre `/metrics`, que es donde se suelen
 * exponer las métricas de operación del propio servicio (Prometheus y
 * compañía). Mezclar las dos cosas bajo la misma ruta se paga después.
 */
@Controller('dashboard')
@UseGuards(AuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /**
   * WIP, throughput, atrasadas y tiempos. Filtros: `?from=`, `?to=`, `?tz=`.
   *
   * Por defecto, los últimos siete días cortados en la zona de México.
   */
  @Get('metrics')
  metricas(@CurrentUser() user: CurrentUserContext, @Query() query: QueryMetricsDto) {
    return this.metrics.dashboard(user.userId, query);
  }
}
