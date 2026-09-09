import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Worker } from 'bullmq';
import { Logger } from '@nestjs/common';
import { GmailService } from './gmail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AJUSTE_WORKER } from '../../common/bullmq/polling.config';
import { describirError, stackDe } from '../../common/observability/describir-error';
import { esCuotaAgotada, GmailQuotaError } from './gmail-quota';

/**
 * Espera base cuando Google no dice cuánto. La cuota que nos tumbó es la de
 * **unidades por minuto y por usuario**, y ese cubo se rellena cada minuto: no
 * tiene sentido dormir menos, ni empezar durmiendo mucho más.
 */
const ESPERA_BASE_MS = 60_000;

/** Techo de la espera. Sin él, un `Retry-After` con una fecha rara o un reloj
 * desajustado dormiría la ingesta horas y nadie sabría por qué. */
const ESPERA_MAXIMA_MS = 15 * 60_000;

/**
 * Techo de sincronizaciones por minuto, compartido entre instancias porque el
 * contador vive en Redis.
 *
 * El freno del 403 es una red **por debajo**: actúa cuando Google ya nos dijo
 * que no. Esto es la red de arriba, la que evita llegar ahí. Sin ella, una
 * ráfaga de avisos de Pub/Sub —o un tramo que se repite— arranca tantas
 * sincronizaciones a la vez como jobs haya, y cada una gasta su cuota.
 *
 * Seis por minuto es holgado para el uso real (un buzón activo genera un aviso
 * cada pocos minutos) y deja la cuota lejos aunque algo se atasque.
 */
const LIMITE_SYNC_POR_VENTANA = { max: 6, duration: 60_000 };

interface SyncHistoryJob {
  emailAddress?: string;
  historyId?: string;
}

interface WatchInboxJob {
  userId?: string;
}

type GmailJob = SyncHistoryJob & WatchInboxJob;

@Processor('gmail-sync', {
  // Uno cada vez: dos sincronizaciones del mismo buzón en paralelo se pisan el
  // marcador de historial y duplican el gasto de cuota para traer lo mismo.
  concurrency: 1,
  limiter: LIMITE_SYNC_POR_VENTANA,
  ...AJUSTE_WORKER,
})
export class GmailProcessor extends WorkerHost {
  private readonly logger = new Logger(GmailProcessor.name);

  /** Pausas por cuota encadenadas sin una sincronización buena en medio. */
  private pausasSeguidas = 0;

  constructor(
    private readonly gmailService: GmailService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<GmailJob, unknown, string>): Promise<unknown> {
    // La cola `gmail-sync` transporta dos tipos de trabajo.
    if (job.name === 'watch-inbox') {
      return this.handleWatchInbox(job);
    }
    return this.handleSyncHistory(job);
  }

  /** Activa las notificaciones push de Gmail tras el login (`users.watch`). */
  private async handleWatchInbox(job: Job<GmailJob>): Promise<void> {
    const { userId } = job.data;
    if (!userId) {
      this.logger.warn('Job watch-inbox descartado: falta userId');
      return;
    }

    this.logger.log(`Activando watch de Gmail para el usuario ${userId}`);
    const result = await this.gmailService.watchInbox(userId);
    if (!result.ok) {
      throw new Error(`Falló watchInbox para el usuario ${userId}: ${result.motivo}`);
    }
  }

  private async handleSyncHistory(job: Job<GmailJob>): Promise<unknown> {
    this.logger.log(`Procesando tarea de sincronización para el job ${job.id}`);

    const { emailAddress, historyId } = job.data;
    if (!emailAddress) {
      this.logger.warn('Job descartado: falta emailAddress en los datos');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: emailAddress },
      select: { id: true },
    });

    if (!user) {
      this.logger.warn(`Usuario no encontrado para el email: ${emailAddress}`);
      return;
    }

    try {
      const result = await this.gmailService.syncHistory(user.id, historyId);
      this.logger.log(
        `Sincronización completada para ${user.id}: ${result.processed} correo(s) en modo ${result.mode}`,
      );
      // Una vuelta buena cierra el ciclo de castigo: la próxima pausa, si la
      // hay, vuelve a empezar por abajo en vez de heredar la escalada de un
      // atasco ya resuelto.
      this.pausasSeguidas = 0;
      return result;
    } catch (error) {
      if (error instanceof GmailQuotaError || esCuotaAgotada(error)) {
        return this.frenarLaIngesta(user.id, error);
      }

      this.logger.error(`Falló la sincronización para el usuario ${user.id}: ${describirError(error)}`, stackDe(error));
      throw error; // Lanzar error para que BullMQ lo reintente si aplica
    }
  }

  /**
   * Pausa la ingesta entera y devuelve el job a la cola **sin gastarle un
   * intento**. Es el mismo par que usa el worker de clasificación contra el 429
   * de Anthropic, y las dos mitades hacen cosas distintas:
   *
   * - `rateLimit()` para el worker completo. Es el punto: si la cuota está
   *   agotada, los avisos de los demás buzones iban a chocar igual, y cada
   *   choque alarga la penalización.
   * - `Worker.RateLimitError()` es la señal convenida de BullMQ para que el job
   *   vuelva a la espera como si no se hubiera ejecutado.
   *
   * **Y esa segunda mitad es la que salva los `historyId`.** Con un error
   * normal, el job gasta sus tres intentos y acaba en la cola de fallidos: el
   * aviso de Pub/Sub se pierde, nadie vuelve a pedir ese tramo, y el marcador
   * se queda esperando una notificación que ya no llegará. Los `historyId`
   * caducan a la semana, así que un job perdido hoy es un backfill —y un hueco
   * de correos— dentro de siete días.
   */
  private async frenarLaIngesta(userId: string, error: unknown): Promise<never> {
    const sugerida = error instanceof GmailQuotaError ? error.esperaMs : null;

    // Retroceso exponencial sobre las pausas **seguidas**: si el cubo sigue
    // vacío al volver, es que el ritmo anterior no bastaba y hay que esperar
    // más. El contador vive en memoria del proceso —se reinicia en cada
    // despliegue y no se comparte entre instancias—, y es a propósito: la
    // alternativa era otro estado en Redis, y una escalada aproximada que
    // funciona sola vale más aquí que una exacta con una pieza más que puede
    // fallar. La primera vuelta tras un despliegue vuelve a empezar por abajo.
    this.pausasSeguidas += 1;
    const escalada = ESPERA_BASE_MS * 2 ** (this.pausasSeguidas - 1);
    const espera = Math.min(sugerida ?? escalada, ESPERA_MAXIMA_MS);

    this.logger.warn(
      `Ingesta de Gmail en pausa ${Math.round(espera / 1000)} s por cuota agotada ` +
        `(usuario ${userId}, pausa consecutiva n.º ${this.pausasSeguidas}` +
        `${sugerida ? ', plazo pedido por Google' : ''}): ${describirError(error)}`,
    );

    await this.worker.rateLimit(espera);
    throw Worker.RateLimitError();
  }
}
