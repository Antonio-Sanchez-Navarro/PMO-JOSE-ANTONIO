import { TimeController } from './time.controller';
import { TimeService } from './time.service';
import type { CurrentUserContext } from '../auth/auth.types';

const USUARIO = { userId: 'user-1', email: 'x@y.z' } as CurrentUserContext;

/**
 * `GET /time/active` — que el `null` viaje.
 *
 * Estas pruebas existen por un fallo que se vio en la consola del navegador el
 * 2026-07-30 y que las 423 pruebas de servicio no podían ver: `findActive`
 * devolvía `null` correctamente, pero **Nest traduce un `null` devuelto a un
 * cuerpo vacío**. El cliente hacía `response.json()` sobre cero bytes y
 * reventaba con `Unexpected end of JSON input` en cada montaje del tablero sin
 * cronómetro corriendo.
 *
 * El fallo no estaba en la lógica sino en la frontera, así que la prueba mira
 * la frontera: qué se le entrega a la respuesta HTTP.
 */
describe('TimeController · GET /time/active', () => {
  let controller: TimeController;
  let service: { findActive: jest.Mock };
  let res: { json: jest.Mock };

  beforeEach(() => {
    service = { findActive: jest.fn() };
    res = { json: jest.fn() };
    controller = new TimeController(service as unknown as TimeService);
  });

  it('sin cronómetro en marcha manda un null literal, no un cuerpo vacío', async () => {
    service.findActive.mockResolvedValue(null);

    await controller.findActive(USUARIO, res as never);

    expect(res.json).toHaveBeenCalledWith(null);
    // Lo que importa es que se haya *mandado* algo: devolver el valor sin más
    // es justo lo que producía los cero bytes.
    expect(res.json).toHaveBeenCalledTimes(1);
  });

  it('con cronómetro en marcha manda el fichaje tal cual', async () => {
    const fichaje = { id: 'entry-1', taskId: 'task-1', endedAt: null };
    service.findActive.mockResolvedValue(fichaje);

    await controller.findActive(USUARIO, res as never);

    expect(res.json).toHaveBeenCalledWith(fichaje);
  });

  it('pregunta solo por el cronómetro de quien llama', async () => {
    service.findActive.mockResolvedValue(null);

    await controller.findActive(USUARIO, res as never);

    expect(service.findActive).toHaveBeenCalledWith(USUARIO.userId);
  });
});
