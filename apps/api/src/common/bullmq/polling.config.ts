/**
 * Cuánto sondea BullMQ a Redis cuando no hay trabajo.
 *
 * **El problema, medido:** el consumo de Upstash saltó a **177 k de 500 k
 * comandos** del plan gratuito **sin usuarios y sin apenas correos**. No lo
 * gastaba el trabajo: lo gastaba la espera. Cada worker y cada oyente de
 * eventos mantiene una llamada bloqueante contra Redis que, al expirar, se
 * relanza — y con los valores por defecto expira cada pocos segundos.
 *
 * Con los defaults y los clientes que había, solo por estar encendido:
 *
 * | Cliente | Llamada | Por defecto | Comandos/hora |
 * |---|---|---|---|
 * | Worker (×3) | `BZPOPMIN` | `drainDelay: 5 s` | ~720 cada uno |
 * | Worker (×3) | revisión de atascados | `stalledInterval: 30 s` | ~120 cada uno |
 * | QueueEvents (×2) | `XREAD BLOCK` | `blockingTimeout: 10 s` | ~360 cada uno |
 *
 * Del orden de **4 000 comandos/hora sin que pase nada**, ~96 k al día. Con el
 * tope mensual en 500 k, la cuota se quemaba en una semana larga.
 *
 * ---
 *
 * **Por qué subir estos números no ralentiza nada, que es lo que sorprende:**
 * son llamadas **bloqueantes**, no encuestas. Redis no espera a que venza el
 * plazo para contestar — devuelve **en cuanto entra un trabajo**. El plazo solo
 * decide cada cuánto se rehace la llamada mientras no hay nada, así que
 * multiplicarlo por doce divide el gasto por doce y **deja la latencia igual**.
 *
 * Lo único que sí se alarga es la reclamación de un trabajo atascado —el de un
 * worker que murió a media faena—, que pasa de ~30 s a ~5 min. Es un caso raro
 * y su coste es un retraso, no una pérdida: el trabajo sigue en la cola.
 */

/** Opciones para los `@Processor`. */
export const AJUSTE_WORKER = {
  /**
   * Segundos que el worker bloquea esperando trabajo. **En segundos**, no en
   * milisegundos, al contrario que el resto de plazos de BullMQ.
   */
  drainDelay: 60,

  /** Milisegundos entre revisiones de trabajos atascados. */
  stalledInterval: 300_000,
} as const;

/**
 * Opciones para los `@QueueEventsListener`.
 *
 * Los oyentes de la cola de fallidos son de los clientes más caros del sistema
 * en proporción a lo que hacen: existen para anotar en la DLQ un fallo que
 * ocurre muy de vez en cuando, y aun así mantienen su `XREAD` abierto todo el
 * día. Un plazo largo aquí no retrasa el aviso —el evento llega en cuanto se
 * publica— y recorta seis veces su coste de estar presentes.
 */
export const AJUSTE_EVENTOS = {
  /** Milisegundos que dura el `XREAD BLOCK` sobre el flujo de eventos. */
  blockingTimeout: 60_000,
} as const;
