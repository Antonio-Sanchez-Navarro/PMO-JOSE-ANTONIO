import { HealthCheckError } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Queue } from 'bullmq';

/**
 * Las sondas de salud.
 *
 * Lo que se comprueba aquí es lo único que importa de ellas: **que digan que no
 * cuando la dependencia no está**. Un indicador que devuelve `up` pase lo que
 * pase es exactamente lo que había antes del Sprint 8 —un `{status:"ok"}` fijo—
 * y es peor que no tener sonda, porque el orquestador se fía.
 */
describe('Sondas de salud', () => {
  describe('PrismaHealthIndicator', () => {
    const construir = (queryRaw: jest.Mock) =>
      new PrismaHealthIndicator({ $queryRaw: queryRaw } as unknown as PrismaService);

    it('con la base respondiendo, marca `up`', async () => {
      const indicador = construir(jest.fn().mockResolvedValue([{ '?column?': 1 }]));

      const resultado = await indicador.pingCheck('database');

      expect(resultado.database.status).toBe('up');
    });

    it('lanza una consulta de verdad, no mira una bandera de conexión', async () => {
      const queryRaw = jest.fn().mockResolvedValue([]);

      await construir(queryRaw).pingCheck('database');

      // El cliente de Prisma puede creerse conectado mientras la base rechaza
      // consultas: sin round-trip la sonda no se entera.
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('con la base caída falla, y dice por qué', async () => {
      const indicador = construir(
        jest.fn().mockRejectedValue(new Error('too many connections')),
      );

      await expect(indicador.pingCheck('database')).rejects.toBeInstanceOf(
        HealthCheckError,
      );

      // El motivo viaja en el detalle para que el 503 sirva de algo.
      await indicador.pingCheck('database').catch((error: HealthCheckError) => {
        expect(error.causes.database.reason).toContain('too many connections');
        expect(error.causes.database.status).toBe('down');
      });
    });

    it('si la base no contesta, corta por su cuenta en vez de quedarse colgada', async () => {
      jest.useFakeTimers();
      // Una base que acepta la consulta y nunca responde: el caso que deja la
      // petición viva hasta que corta el orquestador por su lado.
      const indicador = construir(jest.fn().mockReturnValue(new Promise(() => {})));

      const comprobacion = indicador.pingCheck('database');
      const esperado = expect(comprobacion).rejects.toBeInstanceOf(HealthCheckError);

      jest.advanceTimersByTime(3_000);
      await esperado;

      jest.useRealTimers();
    });
  });

  describe('RedisHealthIndicator', () => {
    const construir = (ping: jest.Mock) =>
      new RedisHealthIndicator({
        client: Promise.resolve({ ping }),
      } as unknown as Queue);

    it('con Redis respondiendo PONG, marca `up`', async () => {
      const resultado = await construir(
        jest.fn().mockResolvedValue('PONG'),
      ).pingCheck('redis');

      expect(resultado.redis.status).toBe('up');
    });

    it('con Redis caído falla', async () => {
      const indicador = construir(
        jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      );

      await expect(indicador.pingCheck('redis')).rejects.toBeInstanceOf(
        HealthCheckError,
      );
    });

    it('una respuesta que no es PONG también es un fallo', async () => {
      // Pasa con un Redis en carga o a medio arrancar: contesta, pero no lo
      // que se le preguntó. Dar eso por bueno sería fiarse de que hubo bytes.
      const indicador = construir(jest.fn().mockResolvedValue('LOADING'));

      await expect(indicador.pingCheck('redis')).rejects.toBeInstanceOf(
        HealthCheckError,
      );
    });
  });
});
