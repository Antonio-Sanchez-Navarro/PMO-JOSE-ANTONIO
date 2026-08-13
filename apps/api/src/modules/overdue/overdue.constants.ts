/** Cola dedicada al barrido de vencimientos (ver `overdue.processor.ts`). */
export const OVERDUE_QUEUE = 'overdue-sweep';

/**
 * Identificador del planificador repetible que **este módulo ya no crea**.
 *
 * Se conserva porque sigue siendo la clave con la que hay que borrarlo de
 * Redis: el cron vive en la base, no en el código, así que dejar de escribirlo
 * no lo apaga (ver `overdue.cron-purge.ts`). El día que ningún despliegue
 * encuentre nada que purgar, esta constante y su purga se van juntas.
 *
 * El patrón horario ya no se declara aquí: lo fija el job de Cloud Scheduler
 * que llama a `POST /cron/overdue`, y tenerlo también en el código sería una
 * segunda verdad que nadie actualizaría.
 */
export const OVERDUE_SCHEDULER_ID = 'overdue-sweep-cron';
