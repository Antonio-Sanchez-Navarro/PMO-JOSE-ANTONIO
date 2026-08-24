import { CronController } from './cron.controller';
import type { OverdueService } from '../overdue/overdue.service';
import type { GmailService } from '../gmail/gmail.service';
import type { FrontendAlDiaService } from './frontend-al-dia.service';

/**
 * Las dos rutas que dispara Cloud Scheduler.
 *
 * Son el pulso de la mitad de fondo del producto: si no responden, las tareas
 * dejan de marcarse como vencidas y la ingesta de correo se apaga a los siete
 * días. Subieron sin pruebas y esto salda esa deuda.
 */
describe('CronController', () => {
  function crear(
    opciones: { sweep?: jest.Mock; renovar?: jest.Mock; frontend?: jest.Mock } = {},
  ) {
    const sweep = opciones.sweep ?? jest.fn().mockResolvedValue({ candidates: 5, moved: 2, users: 1 });
    const renovar = opciones.renovar ?? jest.fn().mockResolvedValue({ candidatos: 1, renovados: 1 });
    const frontend = opciones.frontend ?? jest.fn().mockResolvedValue({ estado: 'al-dia' });

    const controller = new CronController(
      { sweep } as unknown as OverdueService,
      { renovarWatchDeTodos: renovar } as unknown as GmailService,
      { comprobar: frontend } as unknown as FrontendAlDiaService,
    );

    return { controller, sweep, renovar, frontend };
  }

  describe('POST /cron/overdue', () => {
    it('ejecuta el barrido y devuelve su resultado', async () => {
      const { controller, sweep } = crear();

      const respuesta = await controller.barrerVencidas();

      expect(sweep).toHaveBeenCalledTimes(1);
      expect(respuesta).toMatchObject({ ok: true, candidates: 5, moved: 2 });
    });

    it('llamarlo dos veces no hace daño: Scheduler reintenta tras un timeout', async () => {
      const { controller, sweep } = crear();

      await controller.barrerVencidas();
      await controller.barrerVencidas();

      // El barrido es idempotente —marcar lo ya marcado no cambia nada—, así
      // que un reintento de Cloud Scheduler es seguro por diseño.
      expect(sweep).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /cron/gmail-watch', () => {
    it('renueva el watch y devuelve cuántos quedaron observados', async () => {
      const { controller, renovar } = crear();

      const respuesta = await controller.renovarWatchDeGmail();

      expect(renovar).toHaveBeenCalledTimes(1);
      expect(respuesta).toMatchObject({ ok: true, candidatos: 1, renovados: 1 });
    });

    it('devuelve los contadores aunque no se renueve ninguno', async () => {
      const renovar = jest.fn().mockResolvedValue({ candidatos: 1, renovados: 0 });
      const { controller } = crear({ renovar });

      const respuesta = await controller.renovarWatchDeGmail();

      // El «0 de 1» tiene que llegar al cuerpo de la respuesta, no solo al log:
      // es lo que permite que un monitor externo lo vea sin leer Cloud Logging.
      expect(respuesta).toMatchObject({ candidatos: 1, renovados: 0 });
    });
  });
});
