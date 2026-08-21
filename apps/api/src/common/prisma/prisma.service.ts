import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Plazos de las transacciones, subidos por los arranques en frío de la base.
 *
 * ⚠️ **Estos números se fijaron contra Neon, que ya no es la base.** Desde el
 * 2026-08-18 esto habla con **Cloud SQL**, que no se suspende por falta de
 * tráfico, así que el arranque en frío que los motivó ya no ocurre por ese
 * lado. Se mantienen porque **el otro lado sí sigue**: Cloud Run escala a cero
 * y la primera transacción tras un rato de calma paga el despertar del
 * contenedor y del pool. Si algún día estorban, esta es la razón por la que
 * bajarlos sería razonable — y la historia de abajo, la razón por la que no se
 * pusieron a ojo.
 *
 * **El problema, medido en producción (con Neon):** transacciones fallando de
 * forma intermitente con `Transaction already closed` porque el despertar de la
 * base —Neon era serverless y se suspendía sin tráfico— tardaba del orden de
 * 5,3 s y el plazo por defecto de Prisma es de 5 s. Fallaba por trescientas
 * milésimas, y
 * solo cuando la base llevaba un rato dormida: nunca en local, nunca dos veces
 * seguidas, que es lo que lo hizo difícil de ver.
 *
 * | Opción | Por defecto | Ahora | Qué mide |
 * |---|---|---|---|
 * | `maxWait` | 2 s | 10 s | Espera para **obtener** una conexión del pool |
 * | `timeout` | 5 s | 15 s | Plazo para **completar** la transacción entera |
 *
 * **Se fija aquí y no en cada llamada a propósito.** Prisma acepta estas
 * opciones en el constructor del cliente desde la 5.10, así que un solo sitio
 * cubre las nueve transacciones del proyecto —y las que se escriban mañana, que
 * es lo que de verdad importa: un plazo puesto llamada a llamada se olvida en
 * la décima—. Cualquier `$transaction` puede pillar la base fría, no solo las
 * de los workers: Cloud Run también escala a cero, así que la primera petición
 * tras un rato de calma paga el mismo despertar.
 *
 * ⚠️ **Subir el plazo no es gratis y conviene saber qué se paga.** El plazo
 * existe para que una transacción atascada suelte su conexión en vez de
 * bloquear el pool; con 15 s, una que se cuelgue de verdad retiene su conexión
 * tres veces más tiempo. Es el precio correcto aquí —las transacciones de este
 * proyecto son cortas y el fallo real era el despertar, no una consulta lenta—,
 * pero si algún día aparece contención de conexiones, este número es el primer
 * sospechoso.
 */
const OPCIONES_DE_TRANSACCION = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

/**
 * Conexiones que abre **cada instancia** contra Cloud SQL.
 *
 * ⚠️ **Esto no se dimensiona por tráfico, se dimensiona por el techo de la
 * base.** Sin `connection_limit`, Prisma usa su fórmula por defecto
 * (`núcleos × 2 + 1`), y como cada instancia de Cloud Run la calcula por su
 * cuenta, el total real es **ese número multiplicado por las instancias vivas**.
 * Nadie lo estaba mirando: el pipeline tampoco fijaba `--max-instances`.
 *
 * El presupuesto, con `--max-instances=8` en `deploy.yml`:
 *
 * | Quién | Conexiones |
 * |---|---|
 * | API: 8 instancias × 2 | 16 |
 * | Job de migraciones (solo durante el despliegue) | ~1 |
 * | Job de respaldo (`pg_dump`, una vez cada 12 h) | 1 |
 * | Una sesión manual de alguien depurando | 1 |
 * | **Total en el peor caso** | **~19** |
 *
 * ⚠️ **El techo asumido es 25**, que es el `max_connections` por defecto de un
 * `db-f1-micro` — la instancia no lleva `databaseFlags`, así que rige el valor
 * de fábrica. **No está verificado leyendo la base**, porque desde fuera no se
 * puede: la instancia no admite conexión directa. Si alguien puede confirmarlo,
 * la comprobación es `SHOW max_connections;` desde el Job de restauración. Si
 * resultara ser menos de 25, lo que baja es `--max-instances`, no esto:
 * estrangular el pool de cada instancia hace que las peticiones se peleen por
 * una conexión en vez de repartirse.
 *
 * Y si algún día sube `--max-instances`, **este número se revisa con él**.
 */
const CONEXIONES_POR_INSTANCIA = 2;

/**
 * Devuelve la `DATABASE_URL` con el `connection_limit` puesto.
 *
 * Se hace **aquí y no en el secreto** a propósito: el secreto es una credencial
 * que no se revisa en un diff, y este número es una decisión de dimensionado que
 * sí. Escrito en código, viaja con su explicación y con el commit que lo cambie.
 *
 * Si la URL ya trae un `connection_limit` —porque alguien lo puso a mano en el
 * secreto— **se respeta**: quien editó el secreto sabía algo que este archivo no.
 */
function urlConLimiteDeConexiones(): string | undefined {
  const cruda = process.env.DATABASE_URL;
  if (!cruda) return undefined;

  try {
    const url = new URL(cruda);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(CONEXIONES_POR_INSTANCIA));
    }
    return url.toString();
  } catch {
    // Una URL que no se puede analizar no se toca: que falle al conectar, con
    // su mensaje de siempre, en vez de fallar aquí con uno que despista.
    return cruda;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = urlConLimiteDeConexiones();
    super({
      transactionOptions: { ...OPCIONES_DE_TRANSACCION },
      ...(url ? { datasources: { db: { url } } } : {}),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
