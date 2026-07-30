import { Prisma } from '@prisma/client';
import { Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

/**
 * Husos horarios: un solo sitio para las tres piezas que necesita cualquier
 * ruta que agrupe datos por día.
 *
 * Vive en `common/` y no dentro de un módulo porque lo usan dos que no dependen
 * el uno del otro (`metrics` y `time`), y porque el problema que resuelve es
 * justo que **no diverjan**: dos rutas que cortan el día en zonas distintas
 * reparten los mismos minutos en días distintos y el dashboard enseña dos
 * verdades a la vez (2026-07-30, encargo de Doc tras verlo en las gráficas).
 */

/**
 * Donde trabaja quien usa esto. Es el corte por defecto de los días.
 *
 * Sale de aquí y no de `process.env` a propósito: es una decisión de producto
 * ("el día acaba a medianoche en México"), no de despliegue, y esconderla en
 * una variable de entorno haría que dos entornos dieran gráficas distintas con
 * los mismos datos.
 */
export const ZONA_POR_DEFECTO = 'America/Mexico_City';

/**
 * Cómo se pasa una columna de fecha de Prisma a la hora local de una zona.
 *
 * El doble `AT TIME ZONE` no es redundante y quitar el primero rompe los días de
 * forma silenciosa. Prisma declara los `DateTime` como `timestamp WITHOUT time
 * zone` y guarda dentro el instante en UTC. Un solo `AT TIME ZONE 'America/...'`
 * sobre esa columna hace lo **contrario** de lo que parece: no la convierte a
 * hora de México, la *interpreta* como si ya lo estuviera y devuelve un
 * `timestamptz`. Con la sesión en UTC, un cierre de las 22:58 acababa contado en
 * el día siguiente.
 *
 * Así que primero se dice de qué zona viene (`'UTC'`, que la convierte en
 * `timestamptz`) y después a cuál va. Encontrado probando contra la aplicación:
 * las pruebas con Prisma simulado no lo habrían visto nunca.
 */
export const enHoraLocal = (columna: string, tz: string): Prisma.Sql =>
  Prisma.sql`${Prisma.raw(`"${columna}"`)} AT TIME ZONE 'UTC' AT TIME ZONE ${tz}`;

/**
 * Que la zona horaria exista de verdad.
 *
 * Sin esto, un `?tz=Marte/Olympus` llegaría a Postgres y saldría un 500 con un
 * error de base de datos en la respuesta. Con esto es un 400 que dice qué está
 * mal. La lista la pone el propio motor de `Intl`, así que no hay que
 * mantenerla a mano.
 */
@ValidatorConstraint({ name: 'esZonaHoraria', async: false })
export class EsZonaHoraria implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    try {
      // Lanza `RangeError` si la zona no la conoce el sistema.
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'tz debe ser una zona horaria IANA válida, por ejemplo America/Mexico_City';
  }
}

/** El decorador de `tz`, para que las dos rutas validen igual. */
export const EsZonaHorariaValida = (): PropertyDecorator => Validate(EsZonaHoraria);
