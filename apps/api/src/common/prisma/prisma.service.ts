import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Plazos de las transacciones, subidos por los arranques en frío de Neon.
 *
 * **El problema, medido en producción:** transacciones fallando de forma
 * intermitente con `Transaction already closed` porque el despertar de la base
 * —Neon es serverless y se suspende sin tráfico— tarda del orden de 5,3 s y el
 * plazo por defecto de Prisma es de 5 s. Fallaba por trescientas milésimas, y
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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ transactionOptions: { ...OPCIONES_DE_TRANSACCION } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
