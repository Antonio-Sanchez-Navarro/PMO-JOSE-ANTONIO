import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

/** Mismo plazo y mismo motivo que en la comprobación de Postgres. */
const REDIS_PING_TIMEOUT_MS = 3_000;

/**
 * BullMQ expone su cliente con `IRedisClient`, una interfaz recortada a los
 * comandos que él usa, y `PING` no está en ella. Por debajo es un `ioredis` y
 * `ping()` existe; se declara aquí lo mínimo en vez de arrastrar `ioredis` como
 * dependencia directa solo para tener el tipo.
 */
type ClienteConPing = { ping(): Promise<string> };

/**
 * Comprobación de Redis para `/health/ready`.
 *
 * **Se hace el `PING` sobre el cliente de una cola que ya existe, no sobre una
 * conexión nueva.** Abrir una conexión propia para la sonda comprobaría que
 * Redis está vivo, que no es la pregunta: la pregunta es si *esta* aplicación
 * puede encolar trabajo. Una conexión nueva puede levantarse sin problema
 * mientras la que usa BullMQ está rota o agotada, y entonces la sonda diría que
 * sí y la ingesta de correo seguiría sin arrancar.
 *
 * Por lo mismo no se declara `ioredis` como dependencia: llega por BullMQ y es
 * su conexión la que interesa, no una nuestra.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@InjectQueue('gmail-sync') private readonly queue: Queue) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const started = Date.now();

    try {
      const client = (await this.queue.client) as unknown as ClienteConPing;

      const pong = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`sin respuesta en ${REDIS_PING_TIMEOUT_MS} ms`)),
            REDIS_PING_TIMEOUT_MS,
          ).unref(),
        ),
      ]);

      if (pong !== 'PONG') {
        throw new Error(`respuesta inesperada al PING: ${pong}`);
      }

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
