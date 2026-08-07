import { HealthCheckError } from '@nestjs/terminus';
import { conPlazo } from './con-plazo';
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
  describe('conPlazo', () => {
    /**
     * La prueba que faltaba, y que se pagó cara.
     *
     * La primera versión era un `Promise.race` con un `setTimeout` suelto: al
     * ganar la consulta, el temporizador perdedor seguía armado los 3 segundos.
     * Como la sonda se dispara cada pocos segundos, el proceso iba acumulando
     * temporizadores inútiles. Se vio aquí antes que en producción — estas
     * siete pruebas tardaban **24 segundos** en vez de milisegundos, porque el
     * worker de jest esperaba a que vencieran.
     */
    it('recoge el temporizador cuando la operación gana', async () => {
      jest.useFakeTimers();

      await conPlazo(() => Promise.resolve('listo'), 3_000);

      expect(jest.getTimerCount()).toBe(0);

      jest.useRealTimers();
    });

    it('lo recoge también cuando la operación falla', async () => {
      jest.useFakeTimers();

      await conPlazo(() => Promise.reject(new Error('caída')), 3_000).catch(() => {});

      expect(jest.getTimerCount()).toBe(0);

      jest.useRealTimers();
    });

    it('si nadie contesta, el plazo corta con su motivo', async () => {
      jest.useFakeTimers();

      const colgada = conPlazo(() => new Promise(() => {}), 3_000);
      const esperado = expect(colgada).rejects.toThrow('sin respuesta en 3000 ms');

      jest.advanceTimersByTime(3_000);
      await esperado;

      jest.useRealTimers();
    });
  });

  describe('PrismaHealthIndicator', () => {
    const construir = (queryRaw: jest.Mock) =>
      new PrismaHealthIndicator({ $queryRaw: queryRaw } as unknown as PrismaService);

    /**
     * El esquema, que es la mitad que faltaba.
     *
     * El 2026-08-07 la base de producción estuvo **vacía** con la sonda en
     * verde: `SELECT 1` responde igual de bien sin una sola tabla. Estas
     * pruebas fijan la diferencia entre "conecta" y "puede servir".
     */
    describe('schemaCheck', () => {
      const conRecuento = (fila: Record<string, number>) =>
        construir(jest.fn().mockResolvedValue([fila]));

      it('con las migraciones aplicadas, marca up y dice cuántas son', async () => {
        const indicador = conRecuento({ aplicadas: 9, aMedias: 0, revertidas: 0 });

        const resultado = await indicador.schemaCheck('schema');

        expect(resultado.schema.status).toBe('up');
        expect(resultado.schema.aplicadas).toBe(9);
      });

      /** La regresión del caso real: base sin `_prisma_migrations`. */
      it('sin la tabla de migraciones falla, y lo dice en castellano', async () => {
        const indicador = construir(
          jest
            .fn()
            .mockRejectedValue(
              new Error('relation "_prisma_migrations" does not exist (42P01)'),
            ),
        );

        await indicador.schemaCheck('schema').catch((error: HealthCheckError) => {
          expect(error.causes.schema.status).toBe('down');
          // El mensaje en crudo se lee como un fallo del código; traducido dice
          // lo que de verdad pasa, que es que nadie migró esta base.
          expect(error.causes.schema.reason).toContain('no se ha migrado nunca');
        });

        expect.hasAssertions();
      });

      it('con la tabla vacía también falla: existir no es estar migrada', async () => {
        const indicador = conRecuento({ aplicadas: 0, aMedias: 0, revertidas: 0 });

        await expect(indicador.schemaCheck('schema')).rejects.toBeInstanceOf(
          HealthCheckError,
        );
      });

      /**
       * **La acotación que evita convertir el arreglo en una caída.** El Job
       * migra mientras la revisión vieja sirve, así que una migración a medias
       * es lo normal durante unos segundos de cada despliegue. Si esto tumbara
       * la sonda, cada despliegue sacaría del balanceador a toda la flota.
       */
      it('una migración a medias se cuenta pero NO tumba la sonda', async () => {
        const indicador = conRecuento({ aplicadas: 9, aMedias: 1, revertidas: 0 });

        const resultado = await indicador.schemaCheck('schema');

        expect(resultado.schema.status).toBe('up');
        expect(resultado.schema.aMedias).toBe(1);
      });

      it('una migración revertida tampoco: pide una persona, no un 503', async () => {
        const indicador = conRecuento({ aplicadas: 8, aMedias: 0, revertidas: 1 });

        const resultado = await indicador.schemaCheck('schema');

        expect(resultado.schema.status).toBe('up');
        expect(resultado.schema.revertidas).toBe(1);
      });

      it('si la base no contesta, corta por su cuenta', async () => {
        jest.useFakeTimers();
        const indicador = construir(jest.fn().mockReturnValue(new Promise(() => {})));

        const comprobacion = indicador.schemaCheck('schema');
        const esperado = expect(comprobacion).rejects.toBeInstanceOf(HealthCheckError);

        jest.advanceTimersByTime(3_000);
        await esperado;

        jest.useRealTimers();
      });
    });

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
