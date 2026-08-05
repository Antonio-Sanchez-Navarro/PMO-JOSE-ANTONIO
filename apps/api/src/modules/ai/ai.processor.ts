import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Worker } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailClassificationService } from './email-classification.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  convieneEsperar,
  describirFallo,
  esperaSugeridaMs,
} from '../../common/anthropic/anthropic-client';
import type { ClassifyEmailJob, ClassifyEmailResult } from './classify-email.job';

/**
 * Cuántas clasificaciones van a la vez y cuántas por minuto.
 *
 * El límite de tasa de Anthropic es de la organización entera, no de este
 * worker: el copiloto consume de la misma cuota y responde a alguien que está
 * esperando. Por eso la cola se queda deliberadamente por debajo de lo que
 * podría — una sincronización de Gmail encola decenas de correos de golpe y sin
 * freno se los comería todos en unos segundos, dejando 429 al copiloto.
 *
 * `duration` es una ventana móvil de BullMQ, compartida por todos los procesos
 * que atienden la cola porque el contador vive en Redis: escalar la API a tres
 * instancias no triplica el ritmo contra la API de Claude.
 *
 * Los números son conservadores a propósito y no una medición: se ajustan
 * cuando haya cuota real que medir. Quedarse corto retrasa correos; pasarse
 * rompe el chat.
 */
const CONCURRENCIA = 2;
const LIMITE_POR_VENTANA = { max: 20, duration: 60_000 };

@Processor('classify-email', { concurrency: CONCURRENCIA, limiter: LIMITE_POR_VENTANA })
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly classification: EmailClassificationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(
    job: Job<ClassifyEmailJob, ClassifyEmailResult, string>,
  ): Promise<ClassifyEmailResult> {
    // Sigue comprobándose aunque el tipo lo dé por seguro: lo que llega de la
    // cola es JSON que se serializó en otro proceso, quizá con una versión
    // anterior del código. El tipo protege de escribir mal el productor, no de
    // un job viejo que ya estaba en Redis.
    const emailId = job.data?.emailId;
    if (!emailId) {
      this.logger.warn('Job descartado: falta emailId');
      return;
    }

    this.logger.log(`Procesando clasificación de email ${emailId}`);

    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: { id: true, processedAt: true, bodyText: true, snippet: true },
    });

    if (!email) {
      this.logger.warn(`Email no encontrado: ${emailId}`);
      return;
    }

    // Idempotencia: la cola puede reentregar el mismo job.
    if (email.processedAt) {
      this.logger.log(`El email ${emailId} ya fue procesado el ${email.processedAt}. Omitiendo.`);
      return;
    }

    if (!email.bodyText && !email.snippet) {
      this.logger.warn(`El email ${emailId} no tiene texto para analizar.`);
      return;
    }

    try {
      const result = await this.classification.classifyAndPersist(emailId, {
        // Reproceso = reemplazo: si el correo ya tenía tareas de la IA, se
        // sustituyen en lugar de duplicarse.
        replaceExisting: true,
        // El worker respeta el criterio del modelo; forzar es cosa de la vía
        // manual (`POST /emails/:id/to-task`).
        forceActionable: false,
      });

      this.logger.log(
        `Resultado de IA para ${emailId}: isActionable=${result.isActionable}` +
          (result.tasks.length ? `, ${result.tasks.length} tareas creadas` : ''),
      );
    } catch (error) {
      // Saturación de la API: no es un job malo, es que no hay cuota ahora.
      if (convieneEsperar(error)) {
        return this.frenarLaCola(emailId, error);
      }

      this.logger.error(`Falló la clasificación del email ${emailId}`, error);
      throw error; // Para que BullMQ lo reintente si hay redelivery configurado
    }
  }

  /**
   * Detiene la cola el tiempo que pida la propia API y devuelve el job a la
   * espera **sin gastarle un intento**.
   *
   * Las dos mitades son necesarias y hacen cosas distintas: `rateLimit()` pausa
   * el worker entero —los demás correos de la tanda ni se intentan, que es el
   * punto: si la cuota está agotada, los siguientes iban a chocar igual— y
   * `Worker.RateLimitError()` es la señal convenida de BullMQ para que el job
   * vuelva a la cola como si no se hubiera ejecutado. Lanzar un error normal
   * aquí consumiría reintentos hasta mandar a la cola de fallidos un correo que
   * no tiene nada de malo.
   *
   * Si la respuesta no dice cuánto esperar se usa la ventana del limitador, que
   * es el orden de magnitud en el que se rellenan estos cubos.
   */
  private async frenarLaCola(emailId: string, error: unknown): Promise<never> {
    const espera = esperaSugeridaMs(error) ?? LIMITE_POR_VENTANA.duration;

    this.logger.warn(
      `Cola de clasificación en pausa ${Math.round(espera / 1000)} s por saturación de Anthropic ` +
        `(email ${emailId}): ${describirFallo(error)}`,
    );

    await this.worker.rateLimit(espera);
    throw Worker.RateLimitError();
  }
}
