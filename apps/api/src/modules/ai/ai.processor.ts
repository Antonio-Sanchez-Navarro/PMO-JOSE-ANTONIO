import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Worker } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailClassificationService } from './email-classification.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  convieneEsperar,
  describirFallo,
  esSaldoAgotado,
  esperaSugeridaMs,
} from '../../common/anthropic/anthropic-client';
import type { ClassifyEmailJob, ClassifyEmailResult } from './classify-email.job';
import { AJUSTE_WORKER } from '../../common/bullmq/polling.config';
import { AlertService } from '../../common/alerts/alert.service';
import { describirError, stackDe } from '../../common/observability/describir-error';
import { TasksGateway } from '../tasks/tasks.gateway';
import { GmailQuotaError, esCuotaAgotada } from '../gmail/gmail-quota';

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
 * ⚠️ **Desde la Fase 8 este número también gobierna cuota de Gmail, y ese es
 * hoy el motivo de que sea tan bajo.** Clasificar un correo con adjuntos hace
 * antes hasta {@link MAX_ADJUNTOS_POR_CORREO} llamadas a
 * `messages.attachments.get`, que se pagan del **mismo cubo por usuario** que
 * usa la ingesta para bajar mensajes. Es decir: este limitador y
 * `PAUSA_ENTRE_TANDAS_MS` compiten por lo mismo, aunque estén en módulos
 * distintos y midan cosas distintas.
 *
 * **Bajado de 20 a 6 el 2026-09-14** (Fase 8.2). En producción la ingesta
 * llevaba 258 pausas consecutivas por 429: se frenaba bien y volvía a
 * encontrarse el cubo vacío, porque quien lo estaba vaciando era esta cola.
 * Con 6 × 2 adjuntos × 5 unidades salen ~60 unidades/minuto en adjuntos, frente
 * a las ~500 de antes.
 *
 * Los números siguen sin ser una medición. Quedarse corto retrasa correos —y
 * ahora mismo eso es exactamente lo que se quiere, digerir el atasco despacio—;
 * pasarse vuelve a parar la ingesta entera.
 */
const CONCURRENCIA = 2;
const LIMITE_POR_VENTANA = { max: 6, duration: 60_000 };

/**
 * Cuánto se para la cola cuando quien dice «basta» es **Gmail**, y no Anthropic.
 *
 * Solo se usa si Google no manda `Retry-After`. Un minuto sería el orden de
 * magnitud del cubo por minuto, pero cuando esto salta de verdad el cubo lleva
 * vacío un buen rato —lo está vaciando la propia recuperación del atasco— así
 * que volver al minuto es volver a chocar. Cinco minutos da tiempo a que la
 * ingesta, que también está frenando, se lleve su parte.
 */
const ESPERA_POR_CUOTA_DE_GMAIL_MS = 5 * 60_000;

/**
 * Por qué un correo sale del procesador **sin clasificar** pero dado por
 * terminado.
 *
 * Un correo con `processedAt` puesto y `skipReason` nulo se clasificó de verdad;
 * con `skipReason` no nulo, se cerró sin clasificar y aquí está el motivo. La
 * diferencia importa: sin ella, dentro de tres meses nadie sabría que la
 * categoría existe.
 *
 * Para contarlos, que es de lo que se trata:
 *
 * ```sql
 * SELECT "skipReason", count(*) FROM "Email" WHERE "skipReason" IS NOT NULL GROUP BY 1;
 * ```
 *
 * **Cinco es una curiosidad; cincuenta el mes que viene es una avería de la
 * ingesta** — probablemente el parseo MIME no sacando el cuerpo de cierto tipo
 * de correo.
 */
/**
 * Silencio entre avisos de saldo agotado.
 *
 * Doce horas: mientras la cuenta siga vacia **todos** los correos fallaran por
 * lo mismo, asi que avisar por cada uno seria inundar el canal con el mismo
 * hecho -la leccion del barrido, otra vez-. Con doce horas el aviso llega, se
 * repite si el problema dura un dia entero, y no tapa nada mas.
 */
const FRENO_SIN_SALDO_S = 12 * 3_600;

export const SKIP_REASON = {
  /** Ni `bodyText` ni `snippet`: no hay nada que darle al modelo. */
  sinTexto: 'SIN_TEXTO',
} as const;

@Processor('classify-email', {
  concurrency: CONCURRENCIA,
  limiter: LIMITE_POR_VENTANA,
  ...AJUSTE_WORKER,
})
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly classification: EmailClassificationService,
    private readonly prisma: PrismaService,
    private readonly alertas: AlertService,
    private readonly gateway: TasksGateway,
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
      select: {
        id: true,
        // Hace falta para encaminar el aviso por socket: los eventos van al
        // usuario dueño del correo, no a todas las pestañas del sistema.
        userId: true,
        processedAt: true,
        bodyText: true,
        snippet: true,
        labels: true,
      },
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
      // ⚠️ **Antes esto era un `return` pelado y ahí estaba el bucle.**
      //
      // El barrido de reconciliación busca `processedAt IS NULL`. Sin escribir
      // nada, el correo seguía siendo candidato **para siempre**: cinco correos
      // reencolados cada quince minutos, 96 vueltas al día despertando Cloud Run
      // y tocando Cloud SQL para volver a salir por esta misma línea.
      //
      // La salida fácil habría sido excluirlos en la consulta del barrido. Se
      // descarta: eso cambia un problema ruidoso por uno silencioso. Aquí se
      // cierra **dejando rastro** — `processedAt` lo saca del conjunto de
      // candidatos y `skipReason` deja claro que **no se clasificó de verdad**.
      //
      // Y se registran las etiquetas de Gmail porque son la pista de **por qué**
      // llega un correo sin texto: si todos resultan ser invitaciones de
      // Calendar o mensajes solo-adjunto, es normal; si son correos corrientes,
      // el parseo MIME se está comiendo el cuerpo y **ese** es el fallo gordo.
      // Se dejan fuera el asunto y el remitente: para saber de qué tipo son
      // basta la etiqueta, y el log no es sitio para el correo de nadie.
      await this.prisma.email.update({
        where: { id: emailId },
        data: { processedAt: new Date(), skipReason: SKIP_REASON.sinTexto },
      });

      this.logger.warn(
        `El email ${emailId} no tiene texto para analizar: marcado como ` +
          `${SKIP_REASON.sinTexto} (etiquetas: ${email.labels.join(', ') || 'ninguna'}).`,
      );
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
          (result.tasks.length ? `, ${result.tasks.length} tarea(s) propuesta(s)` : ''),
      );

      // La clasificación es asíncrona: cuando termina, quien tenga la bandeja
      // abierta lleva un rato mirando una fila que ya no dice la verdad —le
      // faltan la categoría, el `isActionable` y el contador de la cuarentena.
      // Sin este aviso, la propuesta no aparece hasta que alguien recarga, y el
      // producto se siente roto justo en el momento en que acaba de funcionar.
      //
      // Sin `exceptSocketId`: aquí no hay una pestaña que originara la acción
      // —lo disparó la cola—, así que se anuncia a todas las del usuario.
      this.gateway.emitEmailUpdated({ id: emailId, userId: email.userId });
    } catch (error) {
      // ─── Saldo agotado: la causa, dicha con su nombre ──────────────────
      //
      // Va **antes** que el freno a propósito, aunque no se solapen hoy: si
      // algún día `convieneEsperar` se ampliara, esperar por falta de crédito
      // sería dormir la cola para siempre.
      //
      // Y no se reintenta: **esperar no rellena la cuenta**. Se avisa con la
      // causa —no con el síntoma— y se deja caer, porque lo que hay que hacer
      // es recargar, no volver a intentarlo.
      //
      // Sin esto, el día que se acabe el crédito cada correo agota sus tres
      // intentos y cae en la DLQ. La DLQ avisaría de que «un job falló» y nadie
      // diría por qué: media hora leyendo trazas a las tres de la mañana con la
      // ingesta parada, cuando la respuesta estaba en la consola de facturación.
      if (esSaldoAgotado(error)) {
        this.logger.error(
          `Se acabo el credito de Anthropic al clasificar ${emailId}: ${describirError(error)}`,
        );
        await this.alertas.avisar(
          'Se acabo el credito de Anthropic',
          'La clasificacion de correos esta parada por saldo, no por un fallo del codigo. ' +
            'Reintentar no arregla nada: hay que recargar la cuenta. Mientras tanto los ' +
            'correos siguen entrando y se guardan, pero nadie los clasifica.',
          'anthropic-sin-saldo',
          FRENO_SIN_SALDO_S,
        );
        return;
      }

      // ─── Y si quien dice «basta» es Gmail ──────────────────────────────
      //
      // ⚠️ **Esto faltaba desde la Fase 8, y era el motor del atasco.** Al
      // empezar a bajar adjuntos, `classifyAndPersist` pasó a poder lanzar
      // `GmailQuotaError`; aquí no se reconocía, así que caía al `throw` de
      // abajo como un fallo cualquiera. Y un fallo cualquiera **se reintenta
      // tres veces**: cada reintento volvía a bajar los mismos adjuntos, del
      // mismo cubo agotado, para volver a fallar.
      //
      // O sea que el 429 de Gmail no solo no frenaba esta cola: la hacía pedir
      // **el triple**. Con el barrido de reconciliación reencolando cada quince
      // minutos lo que sigue sin clasificar, el consumo no bajaba nunca — y la
      // ingesta, que sí frenaba bien, volvía 258 veces seguidas a encontrarse
      // el cubo igual de vacío. El freno de un lado no sirve mientras el otro
      // lado siga bebiendo.
      //
      // Va **antes** que `convieneEsperar`, que mira los errores de Anthropic:
      // son dos proveedores distintos y cada uno dice cuánto esperar a su
      // manera.
      if (error instanceof GmailQuotaError || esCuotaAgotada(error)) {
        return this.frenarPorCuotaDeGmail(emailId, error);
      }

      // Saturación de la API: no es un job malo, es que no hay cuota ahora.
      if (convieneEsperar(error)) {
        return this.frenarLaCola(emailId, error);
      }

      this.logger.error(`Falló la clasificación del email ${emailId}: ${describirError(error)}`, stackDe(error));
      // Se relanza para que BullMQ lo reintente. Desde el 2026-08-21 eso es
      // cierto: `attempts: 3` con espera exponencial esta en las
      // `defaultJobOptions` de `app.module.ts`. **Antes no lo era** -regia el
      // `attempts: 1` de fabrica- y este comentario describia una red que nadie
      // habia tendido. Si alguien quita esas opciones, esta linea vuelve a
      // mentir y el correo se va a fallidos al primer tropiezo.
      throw error;
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
  /**
   * Para la cola porque se acabó la cuota de **Gmail**, no la de Anthropic.
   *
   * Es el mismo par que `frenarLaCola` —`rateLimit()` pausa el worker,
   * `Worker.RateLimitError()` devuelve el job sin gastarle un intento— y la
   * segunda mitad es aquí lo importante: sin ella, cada reintento vuelve a
   * bajar los adjuntos del correo, que es justo lo que agotó el cubo.
   *
   * Pausar el worker entero tampoco es un detalle: si la cuota está agotada,
   * los otros cinco correos de la ventana iban a chocar igual, y cada choque
   * alarga la penalización. Es la misma lección que ya está escrita en
   * `gmail.processor.ts`, ahora también de este lado.
   */
  private async frenarPorCuotaDeGmail(emailId: string, error: unknown): Promise<never> {
    const sugerida = error instanceof GmailQuotaError ? error.esperaMs : null;
    const espera = sugerida ?? ESPERA_POR_CUOTA_DE_GMAIL_MS;

    this.logger.warn(
      `Cola de clasificación en pausa ${Math.round(espera / 1000)} s por cuota de GMAIL ` +
        `agotada al bajar adjuntos (email ${emailId}` +
        `${sugerida ? ', plazo pedido por Google' : ''}): ${describirError(error)}`,
    );

    await this.worker.rateLimit(espera);
    throw Worker.RateLimitError();
  }

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
