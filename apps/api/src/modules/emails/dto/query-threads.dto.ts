import { QueryEmailsDto } from './query-emails.dto';

/**
 * Query de `GET /emails/threads` (Fase 7).
 *
 * Hereda **los mismos filtros** que `GET /emails` a propósito: `actionable`,
 * `converted`, `status`, `skip` y `take`, con idénticas reglas de validación.
 * Dos rutas que leen la misma bandeja no pueden interpretar `?actionable=false`
 * de dos maneras distintas — sería la clase de divergencia que se descubre en
 * producción y no al compilar.
 *
 * ⚠️ **Lo que cambia de significado es la paginación.** Aquí `skip` y `take`
 * cuentan **hilos, no correos**: `?take=50` devuelve 50 hilos, que pueden ser
 * 50 correos o 300. Ese es justo el motivo de que exista la ruta — con los 728
 * de producción cabiendo en 401 hilos, paginar por correo obligaba al cliente a
 * bajarse la bandeja entera para saber cuántas filas iba a pintar.
 *
 * ⚠️ **Y el hilo es el que deja el filtro, no el de Gmail.** Con
 * `?status=PENDING`, un hilo de seis mensajes de los que solo dos siguen
 * pendientes llega con `messageCount: 2` y dos `emailIds`. Es lo correcto para
 * lo que se va a hacer con él —descartar exactamente lo que se está viendo— y
 * hay que saberlo antes de pintar «3 mensajes» en una tarjeta.
 */
export class QueryThreadsDto extends QueryEmailsDto {}
