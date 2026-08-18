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
 * worker que murió a media faena—. Es un caso raro y su coste es un retraso, no
 * una pérdida: el trabajo sigue en la cola.
 *
 * ---
 *
 * **Segunda vuelta (2026-08-18): no bastó.** Medido en la consola de Upstash,
 * **297 k de 500 k** comandos, frente a 177 k el 08-14: unos **30 k al día**,
 * que agotan la cuota en menos de una semana.
 *
 * El error de la primera estimación fue contar **un comando por ciclo**. No lo
 * es: cada vencimiento de `drainDelay` arrastra el `BZPOPMIN` **más toda la
 * contabilidad** que BullMQ hace alrededor —del orden de cinco comandos—. Con
 * cuatro clientes que sondean (dos workers y dos oyentes de eventos) salían
 * ~1 250/hora, no los ~264 que decía la tabla de arriba.
 *
 * La buena noticia es que eso hace el arreglo **más** eficaz, no menos: subir el
 * plazo divide el ciclo entero, no una sola llamada.
 *
 * ⚠️ **Y hay un techo, que es la razón de no poner un número redondo mayor:
 * Upstash cierra las conexiones ociosas alrededor de los 5 minutos.** Un
 * bloqueo de 300 s se quedaría justo en la frontera y provocaría reconexiones
 * —cada una con su `AUTH`, su `INFO` y su reenganche— que gastarían más de lo
 * ahorrado. Por eso los plazos son de **240 s**: cuatro veces menos sondeo, con
 * un minuto de margen contra el corte.
 */

/** Opciones para los `@Processor`. */
export const AJUSTE_WORKER = {
  /**
   * Segundos que el worker bloquea esperando trabajo. **En segundos**, no en
   * milisegundos, al contrario que el resto de plazos de BullMQ.
   */
  drainDelay: 240,

  /**
   * Milisegundos entre revisiones de trabajos atascados.
   *
   * Sube de 5 a 10 min. Es el único parámetro de este archivo cuyo aumento
   * **sí** tiene coste real —un trabajo huérfano tarda el doble en reclamarse—
   * y por eso se mueve la mitad que los otros. Sigue sin ser una pérdida: el
   * trabajo está en la cola y se recupera solo.
   */
  stalledInterval: 600_000,
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
  /**
   * Milisegundos que dura el `XREAD BLOCK` sobre el flujo de eventos.
   *
   * Mismo valor que `drainDelay` a propósito —240 s, expresados aquí en
   * milisegundos— para que los dos plazos bloqueantes suban y bajen juntos y
   * ninguno se acerque solo al corte de conexión ociosa de Upstash.
   */
  blockingTimeout: 240_000,
} as const;

/**
 * Cuándo corta Upstash una conexión ociosa, en milisegundos.
 *
 * No es un ajuste: es una restricción del proveedor y está aquí para que la
 * prueba pueda comprobar que ningún plazo bloqueante la roza. Subir un plazo
 * por encima de esto no ahorra — provoca reconexiones, que cuestan más.
 */
export const CORTE_DE_OCIOSIDAD_UPSTASH_MS = 300_000;
