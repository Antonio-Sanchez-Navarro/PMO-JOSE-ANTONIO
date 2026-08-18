import {
  AJUSTE_EVENTOS,
  AJUSTE_WORKER,
  CORTE_DE_OCIOSIDAD_UPSTASH_MS,
} from './polling.config';

/**
 * Estas pruebas no comprueban lógica: comprueban **límites**.
 *
 * Los tres números de `polling.config.ts` son lo único que separa a este
 * proyecto de quemar la cuota gratuita de Upstash, y son exactamente el tipo de
 * constante que alguien baja «un momento, para depurar» y se queda bajada. Aquí
 * quedan fijados el techo del proveedor y la trampa de unidades.
 */
describe('Sondeo de BullMQ — los límites que no se pueden cruzar', () => {
  it('ningún plazo bloqueante roza el corte de conexión ociosa de Upstash', () => {
    // Pasarse no ahorra: la conexión se cae y cada reenganche cuesta más
    // comandos que el ciclo que se quería evitar. Es un techo, no una meta.
    expect(AJUSTE_WORKER.drainDelay * 1000).toBeLessThan(CORTE_DE_OCIOSIDAD_UPSTASH_MS);
    expect(AJUSTE_EVENTOS.blockingTimeout).toBeLessThan(CORTE_DE_OCIOSIDAD_UPSTASH_MS);
  });

  it('drainDelay va en SEGUNDOS y blockingTimeout en MILISEGUNDOS', () => {
    // La trampa de este archivo: dos plazos que miden lo mismo en unidades
    // distintas. Poner 240_000 en `drainDelay` daría un bloqueo de 66 horas y
    // el worker parecería colgado; poner 240 en `blockingTimeout` sondearía
    // cuatro veces por segundo y fundiría la cuota en un día.
    expect(AJUSTE_WORKER.drainDelay).toBeLessThan(1000);
    expect(AJUSTE_EVENTOS.blockingTimeout).toBeGreaterThan(1000);

    // Y suben juntos: mismo plazo real expresado en cada unidad.
    expect(AJUSTE_WORKER.drainDelay * 1000).toBe(AJUSTE_EVENTOS.blockingTimeout);
  });

  it('revisar atascados no puede ser más frecuente que esperar trabajo', () => {
    // Si la revisión corriera más a menudo que el ciclo de espera, sería ella
    // la que marca el gasto y subir `drainDelay` no serviría de nada.
    expect(AJUSTE_WORKER.stalledInterval).toBeGreaterThanOrEqual(
      AJUSTE_WORKER.drainDelay * 1000,
    );
  });

  it('los plazos siguen siendo mucho mayores que los de fábrica', () => {
    // Los valores por defecto de BullMQ (5 s, 30 s, 10 s) son razonables con
    // Redis propio y ruinosos con uno facturado por comando. Esta prueba es la
    // que falla si alguien los revierte sin darse cuenta.
    expect(AJUSTE_WORKER.drainDelay).toBeGreaterThanOrEqual(60);
    expect(AJUSTE_WORKER.stalledInterval).toBeGreaterThanOrEqual(300_000);
    expect(AJUSTE_EVENTOS.blockingTimeout).toBeGreaterThanOrEqual(60_000);
  });
});
