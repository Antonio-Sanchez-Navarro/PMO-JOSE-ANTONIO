import { THROTTLE_AUTH, THROTTLE_COPILOT, THROTTLE_OPTIONS } from './throttle.config';

describe('Configuración del límite de peticiones', () => {
  it('declara un solo cubo global', () => {
    // Esta es la regresión del fallo del 2026-07-29: con tres cubos con nombre
    // —general, copilot, auth— **los tres se aplican a todas las rutas**, así
    // que el más estrecho gobernaba la API entera y el copiloto cortaba a las
    // 10 peticiones en vez de a las 20. Añadir un cubo aquí vuelve a romperlo.
    expect(THROTTLE_OPTIONS).toHaveLength(1);
  });

  it('el cubo se llama `default`: es el que pisan las rutas con límite propio', () => {
    expect(THROTTLE_OPTIONS[0]).toMatchObject({ name: 'default', limit: 240 });
  });

  it('las excepciones pisan ese mismo cubo, no crean uno nuevo', () => {
    expect(Object.keys(THROTTLE_COPILOT)).toEqual(['default']);
    expect(Object.keys(THROTTLE_AUTH)).toEqual(['default']);
  });

  it('el copiloto es más estrecho que el general, y auth más que el copiloto', () => {
    // El orden importa: el copiloto cuesta tokens y auth es donde se prueban
    // contraseñas.
    expect(THROTTLE_COPILOT.default.limit).toBeLessThan(THROTTLE_OPTIONS[0].limit as number);
    expect(THROTTLE_AUTH.default.limit).toBeLessThan(THROTTLE_COPILOT.default.limit);
  });
});
