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
/** Lo que devuelve el recuento de `_prisma_migrations`. */
interface RecuentoMigraciones {
  aplicadas: number;
  aMedias: number;
  revertidas: number;
}

/**
 * `42P01` = `undefined_table` en Postgres. Se busca el código y también el
 * texto porque el error llega envuelto por Prisma (`P2010`) y el formato del
 * mensaje no es contrato de nadie.
 */
const SIN_TABLA = /42P01|does not exist/i;

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * ¿Está aplicado el esquema? **Es una pregunta distinta de si la base
   * responde, y la diferencia costó cara.**
   *
   * El 2026-08-07 se descubrió que la base de producción estaba **vacía**: ni
   * una tabla. `/health/ready` llevaba días devolviendo `database: up` y no
   * mentía — el `SELECT 1` de arriba funciona igual de bien contra una base sin
   * esquema—. La API figuraba sana en todos los tableros mientras cualquier
   * petición que tocara una tabla habría muerto con `relation does not exist`.
   * Una sonda que no distingue "conecta" de "puede servir" es justo la que
   * deja pasar eso.
   *
   * Se pregunta por `_prisma_migrations` y no por una tabla del dominio
   * (`"User"`, por ejemplo) porque es la única que responde a la pregunta
   * correcta: no "existe esta tabla" sino "se llegó a migrar". Una tabla del
   * dominio la puede crear cualquiera a mano y da un falso verde.
   *
   * **Solo falla si NO hay esquema en absoluto**, y esa acotación es
   * deliberada:
   *
   * - Una migración **a medias** (`finished_at` nulo) es lo normal durante unos
   *   segundos en cada despliegue, porque el Job migra mientras la revisión
   *   vieja sigue sirviendo. Fallar ahí dejaría **toda** la flota fuera del
   *   balanceador en cada despliegue: convertiría el arreglo en una caída
   *   programada.
   * - Una migración **revertida** necesita una persona, no un 503. Sacar las
   *   instancias del balanceador no la arregla y quita el poco servicio que
   *   quedara.
   *
   * Las dos se **cuentan y se enseñan** en el detalle de la respuesta, que es
   * donde sirven: para diagnosticar, no para tumbar.
   */
  async schemaCheck(key: string): Promise<HealthIndicatorResult> {
    const started = Date.now();

    try {
      const [conteo] = await conPlazo(
        () => this.prisma.$queryRaw<RecuentoMigraciones[]>`
          SELECT
            count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS aplicadas,
            count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS "aMedias",
            count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS revertidas
          FROM "_prisma_migrations"
        `,
        DB_PING_TIMEOUT_MS,
      );

      const aplicadas = conteo?.aplicadas ?? 0;

      if (aplicadas === 0) {
        // La tabla existe pero no hay ni una migración cerrada: la base está
        // tan sin servicio como si no existiera.
        throw new Error(
          "la tabla _prisma_migrations no tiene ninguna migración aplicada: la base está sin esquema",
        );
      }

      return this.getStatus(key, true, {
        aplicadas,
        aMedias: conteo?.aMedias ?? 0,
        revertidas: conteo?.revertidas ?? 0,
        responseTimeMs: Date.now() - started,
      });
    } catch (error) {
      const bruto = error instanceof Error ? error.message : String(error);

      // 42P01 es "undefined_table" de Postgres. Traducirlo importa: el mensaje
      // en crudo habla de una relación que no existe y se lee como un fallo del
      // código, cuando lo que dice es que nadie migró esta base.
      const reason = SIN_TABLA.test(bruto)
        ? "la base no tiene esquema: falta _prisma_migrations, así que no se ha migrado nunca"
        : bruto;

      throw new HealthCheckError(
        `${key} no está listo`,
        this.getStatus(key, false, { reason, responseTimeMs: Date.now() - started }),
      );
    }
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
