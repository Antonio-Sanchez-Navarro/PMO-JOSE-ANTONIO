import { TaskStatus } from '@prisma/client';

/**
 * Qué hay que escribir en `completedAt` cuando una tarea pasa de un estado a
 * otro. Devuelve `{}` cuando no hay nada que tocar, para poder esparcirlo en el
 * `data` de Prisma sin condicionales en cada sitio.
 *
 * La columna existía desde el Sprint 1 y **nadie la escribía**: era una columna
 * muerta. Se enciende ahora porque el throughput del dashboard —"cuántas tareas
 * se cerraron el martes"— no se puede calcular sin ella; contar las que están
 * en `DONE` hoy no es throughput, es inventario.
 *
 * Dos reglas, y la segunda es la que suele olvidarse:
 *
 * 1. Al **entrar** en `DONE` se sella con el instante del cambio.
 * 2. Al **salir** de `DONE` se limpia. Si no, reabrir una tarea dejaría su
 *    fecha de cierre puesta y el histórico contaría un cierre que se deshizo:
 *    el throughput del martes subiría para siempre por algo que no pasó.
 *
 * Moverla **dentro** de `DONE` (reordenar la columna) no vuelve a sellarla: el
 * cierre ocurrió cuando ocurrió, y arrastrar la tarjeta no lo cambia.
 *
 * Es una función pura y el instante entra por parámetro para que las pruebas no
 * dependan del reloj.
 */
export function completionStamp(
  /** Estado del que viene, o `null` si la tarea está naciendo. */
  from: TaskStatus | null,
  to: TaskStatus,
  now: Date,
): { completedAt?: Date | null } {
  if (to === TaskStatus.DONE) {
    return from === TaskStatus.DONE ? {} : { completedAt: now };
  }

  return from === TaskStatus.DONE ? { completedAt: null } : {};
}
