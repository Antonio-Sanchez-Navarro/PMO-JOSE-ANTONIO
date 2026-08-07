import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { SERVICE_NAME, SERVICE_VERSION } from '../../common/observability/service-context';

/**
 * Sondas de salud (Sprint 8).
 *
 * **Son dos preguntas distintas y por eso son dos rutas distintas**, que es la
 * parte que suele hacerse mal:
 *
 * - `/health/live` — ¿el proceso responde? Si esto falla, reiníciame.
 * - `/health/ready` — ¿puedo atender tráfico? Si esto falla, **no** me
 *   reinicies: quítame del balanceador y espera.
 *
 * Juntarlas en una sola es lo que convierte un hipo de Postgres en un reinicio
 * en cadena de todas las instancias, que estaban sanas: reiniciar la API no
 * levanta la base, y mientras tanto se pierde el poco servicio que quedaba.
 *
 * `@SkipThrottle()` a nivel de controlador, por el mismo motivo que el webhook
 * de Pub/Sub: quien llama aquí es infraestructura, no una persona. Un `429`
 * frente a una sonda no la disuade — la sonda lo lee como "no está sano" y
 * reinicia un contenedor que iba perfectamente.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Ruta histórica, anterior al Sprint 8. Se mantiene **con la misma forma y el
   * mismo comportamiento** porque `README.md` y `ARCHITECTURE.md` la citan y no
   * se sabe quién la está llamando ya.
   *
   * No comprueba dependencias, a propósito: darle ahora la profundidad de
   * `/ready` cambiaría en silencio su código de estado —empezaría a devolver
   * 503 en cuanto Redis parpadeara— y quien la tuviera puesta como sonda de
   * reinicio se encontraría con reinicios que antes no había.
   */
  @Get()
  check() {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Liveness. **No toca ninguna dependencia**, y esa es toda su gracia: si
   * respondiera consultando la base, una base caída provocaría el reinicio de
   * un proceso que no tiene nada roto.
   *
   * Que este handler conteste ya demuestra lo único que se pregunta: que el
   * bucle de eventos corre y que Nest sigue enrutando.
   */
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: Postgres, **su esquema** y Redis.
   *
   * Terminus devuelve **200** si todo responde y **503** con el detalle de cuál
   * falló si no. Redis entra porque sin él no hay ingesta de correo ni
   * clasificación: la API contestaría el tablero y se tragaría en silencio todo
   * lo que debía encolarse.
   *
   * **`database` y `schema` son dos entradas y no una, a propósito.** Son dos
   * fallos distintos que piden dos reacciones distintas: "la base no contesta"
   * se espera a que vuelva, "la base no está migrada" se corre el Job de
   * migraciones. Fundirlas en un solo `up`/`down` obligaría a entrar en los
   * logs para saber cuál de las dos es — y es exactamente lo que pasó el
   * 2026-08-07, cuando `database: up` convivió durante días con una base sin
   * una sola tabla.
   *
   * Cuesta una consulta más por sonda, sobre una tabla de nueve filas. Es
   * barato para lo que evita.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prisma.pingCheck('database'),
      () => this.prisma.schemaCheck('schema'),
      () => this.redis.pingCheck('redis'),
    ]);
  }
}
