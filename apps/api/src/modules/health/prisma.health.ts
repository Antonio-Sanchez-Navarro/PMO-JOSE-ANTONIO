import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../common/prisma/prisma.service';
import { conPlazo } from './con-plazo';

/**
 * Tiempo máximo que puede tardar la comprobación antes de darse por caída.
 *
 * Una sonda de readiness la dispara el orquestador cada pocos segundos y con su
 * propio plazo: si nosotros no cortamos, la petición se queda colgada esperando
 * a un Postgres que no contesta, el orquestador corta por su lado y lo que
 * recibe es un tiempo de espera agotado en vez de un "no estoy listo". Es la
 * misma información, pero sin decir qué falla.
 */
const DB_PING_TIMEOUT_MS = 3_000;

/**
 * Comprobación de la base de datos para `/health/ready`.
 *
 * Lanza un `SELECT 1` de verdad y no mira una bandera de conexión: el cliente
 * de Prisma puede creerse conectado mientras la base rechaza consultas —se
 * quedó sin conexiones libres, está en recuperación, el disco está lleno—, y
 * eso es exactamente lo que una sonda tiene que detectar.
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const started = Date.now();

    try {
      await conPlazo(() => this.prisma.$queryRaw`SELECT 1`, DB_PING_TIMEOUT_MS);

      return this.getStatus(key, true, { responseTimeMs: Date.now() - started });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      throw new HealthCheckError(
        `${key} no responde`,
        this.getStatus(key, false, { reason, responseTimeMs: Date.now() - started }),
      );
    }
  }
}
