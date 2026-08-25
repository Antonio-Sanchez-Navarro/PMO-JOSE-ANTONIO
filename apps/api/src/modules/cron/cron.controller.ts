import { Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CronAuthGuard } from './cron-auth.guard';
import { OverdueService } from '../overdue/overdue.service';
import { GmailService } from '../gmail/gmail.service';
import { FrontendAlDiaService } from './frontend-al-dia.service';
import { AiCostService } from '../../common/costs/ai-cost.service';

/**
 * Los temporizadores del producto, como rutas HTTP.
 *
 * **Por qué dejaron de ser un cron en proceso.** El barrido de vencidas vivía
 * como job repetible de BullMQ, y un repetible necesita un proceso vivo que lo
 * dispare. Cloud Run escala a cero sin tráfico y estrangula la CPU entre
 * peticiones, así que el barrido no corría: medido en la propia cola, una cita
 * de las 01:05 se ejecutó **39,5 horas tarde**, y solo porque una sonda externa
 * despertó el contenedor. Con Cloud Scheduler llamando a una ruta, quien
 * despierta el contenedor es la propia petición — que es como Cloud Run espera
 * que se haga un cron.
 *
 * **`@Controller('cron')` sin prefijo.** `main.ts` no llama a
 * `setGlobalPrefix`, así que las rutas son exactamente `/cron/overdue` y
 * `/cron/gmail-watch`. Un `/api/cron/...` en la configuración de Scheduler da
 * 404, y el job se ve «ejecutado» en la consola igual.
 */
@Controller('cron')
@UseGuards(CronAuthGuard)
/**
 * Exentas del límite por IP, igual que el webhook de Pub/Sub.
 *
 * Todas las llamadas legítimas llegan desde las mismas pocas IP de Google, así
 * que comparten cubo y se irían sumando entre sí; y un 429 a Cloud Scheduler no
 * lo disuade, lo reintenta. Lo que protege estas rutas es `CronAuthGuard`, que
 * exige un token OIDC firmado por una cuenta concreta.
 */
@SkipThrottle()
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly overdue: OverdueService,
    private readonly gmail: GmailService,
    private readonly frontend: FrontendAlDiaService,
    private readonly costes: AiCostService,
  ) {}

  /**
   * Marca como vencidas las tareas que pasaron de fecha.
   *
   * Sustituye al repetible `overdue-sweep-cron`. Es idempotente —marcar dos
   * veces lo ya marcado no cambia nada—, así que un reintento de Scheduler tras
   * un timeout no hace daño.
   */
  @Post('overdue')
  @HttpCode(200)
  async barrerVencidas() {
    const resultado = await this.overdue.sweep();
    this.logger.log(`Barrido de vencidas ejecutado por Cloud Scheduler`);
    return { ok: true, ...resultado };
  }

  /**
   * Barrido de reconciliación: recoge los correos que se quedaron por el camino.
   *
   * **Es la alternativa elegida a `--min-instances=1` y al ping**, y no por
   * precio: por lo que hace de más. Cloud Run escala a cero y con la instancia
   * se apagan los workers de BullMQ, así que un trabajo rezagado espera al
   * siguiente correo y no a un temporizador. Cualquier petición periódica
   * despierta el contenedor y arregla eso.
   *
   * Lo que **solo** arregla esto es el otro agujero: un correo que se guardó y
   * cuyo `add` a la cola falló no está atascado ni fallido, es que **su trabajo
   * nunca existió**. Un worker vivo no lo recoge nunca, porque no hay nada que
   * recoger. Por eso el barrido gana al ping: despierta y además reencola.
   *
   * Idempotente: el `jobId` es el id del correo, así que dos barridos seguidos
   * no duplican trabajo, y el procesador se salta lo que ya tiene `processedAt`.
   */
  @Post('reconciliar')
  @HttpCode(200)
  async reconciliar() {
    const resultado = await this.gmail.reconciliarSinClasificar();
    this.logger.log(
      `Reconciliación: ${resultado.reencolados} reencolado(s) de ` +
        `${resultado.candidatos} candidato(s), ${resultado.fallidos} fallido(s), ` +
        `${resultado.sinTexto} cerrado(s) sin clasificar en total`,
    );
    return { ok: true, ...resultado };
  }

  /**
   * ¿Está producción sirviendo el frontend que le toca?
   *
   * **Capa 2 del despliegue.** La Capa 1 avisa por evento y solo cuenta lo que
   * **llega a fallar**; si Vercel deja de publicar su estado o el build ni se
   * lanza, no hay evento y el silencio parece normalidad. Esto **pregunta**.
   *
   * Devuelve tres estados y ninguno sobra: `al-dia`, `atrasado` y
   * **`indeterminado`** — que no es lo mismo que estar bien, y por eso también
   * avisa. Una sonda muda cuando no puede mirar es una sonda apagada con
   * apariencia de encendida.
   */
  @Post('frontend-al-dia')
  @HttpCode(200)
  async comprobarFrontend() {
    return { ok: true, ...(await this.frontend.comprobar()) };
  }

  /**
   * ¿Cuánto se está consumiendo de las APIs de modelos, y cuánto queda?
   *
   * **Capa 3: vigilar lo que se consume, no lo que se hace.** Las tres pasadas
   * de código dieron veintisiete hallazgos y ninguno era una cuenta atrás — y de
   * las dos formas de que esto se pare un martes por la mañana, quedarse sin
   * crédito es hoy la más probable.
   *
   * ⚠️ **Cada hora, y hasta el 2026-08-25 era diaria a las 08:00.** El
   * razonamiento viejo —«el gasto es un fenómeno lento, preguntarlo cada hora no
   * adelantaría el aviso»— confundía la velocidad del fenómeno con la del aviso.
   * El gasto sube despacio, pero **el umbral se cruza en un instante**: cruzarlo
   * a las 09:00 costaba 23 horas de silencio con la cuenta atrás corriendo. Era
   * el hueco más ancho de los seis disparadores.
   *
   * Veinticuatro pasadas al día no son veinticuatro avisos: el freno de 23 h de
   * `AiCostService` deja pasar uno por umbral y calla el resto. Lo que baja no
   * es el número de mensajes, es la espera hasta el primero.
   */
  @Post('coste-ia')
  @HttpCode(200)
  async comprobarCosteIa() {
    return { ok: true, ...(await this.costes.comprobar()) };
  }

  /**
   * Registra o renueva la suscripción push de Gmail de todos los usuarios.
   *
   * **Sirve para las dos cosas a propósito**, y no es un detalle de comodidad:
   * `users.watch` de Gmail **caduca a los 7 días**, y la llamada para renovarlo
   * es exactamente la misma que para crearlo por primera vez. Con una sola ruta
   * se puede llamar a mano nada más desplegar —sin esperar a la primera cita
   * del planificador— y dejar que Scheduler la repita a diario después.
   *
   * Se renueva a diario y no cada 7 días por el mismo motivo por el que un
   * despertador se pone antes de la hora: si un día falla, quedan seis
   * intentos antes de que la ingesta se apague en silencio.
   */
  @Post('gmail-watch')
  @HttpCode(200)
  async renovarWatchDeGmail() {
    const resultado = await this.gmail.renovarWatchDeTodos();
    this.logger.log(
      `Watch de Gmail renovado: ${resultado.renovados} de ${resultado.candidatos} usuario(s)`,
    );
    return { ok: true, ...resultado };
  }
}
