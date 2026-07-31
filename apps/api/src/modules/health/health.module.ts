import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { PrismaModule } from '../../common/prisma/prisma.module';

/**
 * `logger: false` en Terminus: por defecto escribe una línea de error por cada
 * comprobación fallida, y una sonda de readiness se dispara cada pocos
 * segundos. Con Postgres caído un minuto, eso son decenas de líneas idénticas
 * diciendo lo mismo — en Cloud Logging se paga por volumen y lo que se busca
 * queda enterrado. El fallo ya viaja en el cuerpo del 503, que es donde lo lee
 * quien pregunta.
 *
 * La cola `gmail-sync` se registra aquí solo para alcanzar su conexión de
 * Redis: es la que de verdad usa la aplicación, y comprobar esa y no una propia
 * es lo que hace que la respuesta signifique algo (ver `redis.health.ts`).
 */
@Module({
  imports: [
    TerminusModule.forRoot({ logger: false }),
    PrismaModule,
    BullModule.registerQueue({ name: 'gmail-sync' }),
  ],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
