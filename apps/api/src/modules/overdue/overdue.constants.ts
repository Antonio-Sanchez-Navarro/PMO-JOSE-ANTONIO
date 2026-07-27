/** Cola dedicada al barrido de vencimientos (ver `overdue.processor.ts`). */
export const OVERDUE_QUEUE = 'overdue-sweep';

/**
 * Identificador del planificador repetible. Es fijo a propósito: BullMQ usa la
 * clave para reemplazar la programación anterior, así que cambiar `OVERDUE_CRON`
 * y reiniciar no deja dos barridos conviviendo.
 */
export const OVERDUE_SCHEDULER_ID = 'overdue-sweep-cron';

/**
 * Cada hora, en el minuto 5. La granularidad de `dueDate` es de minutos, pero
 * una tarjeta que aparece en "Atrasadas" hasta una hora tarde no cambia ninguna
 * decisión; barrer más a menudo solo añade escrituras.
 */
export const DEFAULT_OVERDUE_CRON = '5 * * * *';
