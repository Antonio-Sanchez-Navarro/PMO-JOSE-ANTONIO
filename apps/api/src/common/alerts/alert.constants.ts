/**
 * Cola que existe solo por su conexión a Redis.
 *
 * `AlertService` necesita Redis para el freno de deduplicación, y esta es la
 * forma de conseguirlo sin abrir una conexión propia ni acoplarse a una cola de
 * otro dominio. **No se encola nada en ella**: un `Queue` de BullMQ sin worker
 * no sondea, así que no añade tráfico de fondo — importa, porque el consumo de
 * Upstash ya nos costó un incidente.
 */
export const COLA_DE_ALERTAS = 'alerts';
