import type { ConfigService } from '@nestjs/config';
import { AlertService } from './alert.service';

/**
 * El alertador.
 *
 * Existe porque este sistema ya falló en silencio dos días seguidos. Y estas
 * pruebas existen porque **un alertador mal hecho es peor que ninguno**: si
 * lanza, convierte un fallo en dos; si no tiene freno, inunda el canal y el
 * canal se silencia; y si no lleva la causa, repite el «0 de 1» que no se podía
 * accionar.
 */
describe('AlertService', () => {
  const URL = 'https://discord.example/webhook/abc';
  let fetchSimulado: jest.Mock;

  beforeEach(() => {
    fetchSimulado = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchSimulado as unknown as typeof fetch;
  });

  function crear(opciones: { url?: string; set?: jest.Mock } = {}) {
    const set = opciones.set ?? jest.fn().mockResolvedValue('OK');
    const config = {
      get: jest.fn().mockReturnValue('url' in opciones ? opciones.url : URL),
    } as unknown as ConfigService;
    const cola = { client: Promise.resolve({ set }) };

    return { servicio: new AlertService(config, cola as never), set };
  }

  it('manda el aviso al webhook con el título y la causa', async () => {
    const { servicio } = crear();

    await servicio.avisar('Watch de Gmail sin renovar', new Error('boom'));

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe(URL);

    const cuerpo = JSON.parse((opciones as { body: string }).body);
    expect(cuerpo.text).toContain('Watch de Gmail sin renovar');
    // La causa es la mitad del valor de la alerta: sin ella se repite el
    // «0 de 1» que nadie podía accionar.
    expect(cuerpo.text).toContain('boom');
  });

  it('saca el motivo real de un error de Google, no solo su mensaje', async () => {
    const { servicio } = crear();
    const err = Object.assign(new Error('rechazado'), {
      code: 400,
      response: { status: 400, data: { error: { status: 'INVALID_ARGUMENT' } } },
    });

    await servicio.avisar('Fallo', err);

    const cuerpo = JSON.parse(fetchSimulado.mock.calls[0][1].body);
    expect(cuerpo.text).toContain('INVALID_ARGUMENT');
  });

  it('manda el formato de Google Chat: un objeto con `text`', async () => {
    const { servicio } = crear();

    await servicio.avisar('Hola');

    const cuerpo = JSON.parse(fetchSimulado.mock.calls[0][1].body);
    expect(cuerpo).toEqual({ text: expect.stringContaining('Hola') });
  });

  it('usa un asterisco para la negrita: Google Chat no entiende el doble', async () => {
    const { servicio } = crear();

    await servicio.avisar('Título');

    const { text } = JSON.parse(fetchSimulado.mock.calls[0][1].body);
    expect(text).toContain('*Título*');
    // Con `**` los asteriscos saldrían impresos en el mensaje.
    expect(text).not.toContain('**');
  });

  describe('nunca lanza — se llama desde bloques catch', () => {
    it('cuando el webhook rechaza la conexión', async () => {
      const { servicio } = crear();
      fetchSimulado.mockRejectedValue(new Error('ECONNREFUSED'));

      // Si esto lanzara, se tragaría el error original que se estaba
      // reportando y el fallo quedaría peor documentado que sin alertas.
      await expect(servicio.avisar('Algo')).resolves.toBeUndefined();
    });

    it('cuando el webhook responde con un error HTTP', async () => {
      const { servicio } = crear();
      fetchSimulado.mockResolvedValue({ ok: false, status: 404 });

      await expect(servicio.avisar('Algo')).resolves.toBeUndefined();
    });

    it('cuando Redis no responde al comprobar el freno', async () => {
      const set = jest.fn().mockRejectedValue(new Error('sin conexión'));
      const { servicio } = crear({ set });

      await expect(servicio.avisar('Algo')).resolves.toBeUndefined();
      // Ante la duda, manda: un aviso de más es mucho menos grave que un
      // silencio.
      expect(fetchSimulado).toHaveBeenCalled();
    });
  });

  describe('freno de deduplicación', () => {
    it('se calla si ya se avisó de lo mismo en la ventana', async () => {
      const set = jest.fn().mockResolvedValue(null); // la clave ya existía
      const { servicio } = crear({ set });

      await servicio.avisar('Fallo repetido');

      expect(fetchSimulado).not.toHaveBeenCalled();
    });

    it('agrupa por clave, no por título: un bucle de fallos manda un mensaje', async () => {
      // Redis de verdad: la primera reserva pasa, las siguientes no.
      const claves = new Set<string>();
      const set = jest.fn(async (clave: string) => {
        if (claves.has(clave)) return null;
        claves.add(clave);
        return 'OK';
      });
      const { servicio } = crear({ set });

      // El mismo fallo con textos distintos —lo que pasa en un bucle, donde
      // cada vuelta trae otro id de job— comparte clave y solo suena una vez.
      await servicio.avisar('Job 1 perdido', undefined, 'dlq-gmail-sync');
      await servicio.avisar('Job 2 perdido', undefined, 'dlq-gmail-sync');
      await servicio.avisar('Job 3 perdido', undefined, 'dlq-gmail-sync');

      expect(fetchSimulado).toHaveBeenCalledTimes(1);
    });

    it('usa una ventana con caducidad: la clave no se queda para siempre', async () => {
      const { servicio, set } = crear();

      await servicio.avisar('Algo', undefined, 'mi-clave');

      expect(set).toHaveBeenCalledWith(
        'alerta:mi-clave',
        '1',
        'EX',
        expect.any(Number),
        'NX',
      );
    });
  });

  it('sin ALERT_WEBHOOK_URL no llama a nadie, pero tampoco falla', async () => {
    const { servicio } = crear({ url: undefined });

    await expect(servicio.avisar('Algo')).resolves.toBeUndefined();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
