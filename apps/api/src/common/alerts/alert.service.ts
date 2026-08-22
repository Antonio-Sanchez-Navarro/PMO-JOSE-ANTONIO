import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { describirError } from '../observability/describir-error';
import { COLA_DE_ALERTAS } from './alert.constants';

/** Cuánto se calla una alerta repetida antes de volver a mandarse. */
const VENTANA_DE_FRENO_S = 900; // 15 min

/** Plazo de la llamada al webhook. Corto: una alerta tardía no sirve de nada. */
const TIMEOUT_MS = 5_000;

/**
 * Manda avisos a un webhook cuando algo se rompe.
 *
 * **Existe porque este sistema ya falló en silencio.** La renovación del watch
 * de Gmail devolvió «0 de 1» durante dos días con la ingesta condenada a
 * apagarse, y nadie se enteró: el log lo decía y nadie lee logs a las 02:30.
 * Un sistema que no sabe pedir ayuda solo se arregla cuando alguien mira.
 *
 * **El canal es Google Chat**, por webhook entrante. La decisión no fue de
 * comodidad: Google Chat **no comparte la ruta de fallo de OAuth con Gmail**,
 * que es justo lo que hay que vigilar. Mandar por Gmail el aviso de que Gmail
 * falló sería un detector de incendios que se apaga con el incendio.
 *
 * ⚠️ **La URL es una credencial, no configuración.** Quien la tenga puede
 * escribir en el canal, así que viaja por Secret Manager y nunca como variable
 * de entorno en claro ni en el repositorio.
 *
 * ⚠️ **Esto es la capa 1 y tiene un punto ciego por diseño: no puede avisar de
 * que la aplicación está muerta.** Un contenedor que no arranca o un 401 de
 * Cloud Scheduler ocurren fuera de este proceso. Eso lo cubre una alerta sobre
 * logs en Cloud Monitoring, que va aparte y sin código.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly url?: string;

  constructor(
    private readonly config: ConfigService,
    // La cola no se usa para encolar nada: se inyecta por su **conexión a
    // Redis**, que es donde vive el freno. Un `Queue` no sondea —solo habla
    // cuando se le pide algo—, así que no añade tráfico de fondo.
    @InjectQueue(COLA_DE_ALERTAS) private readonly cola: Queue,
  ) {
    this.url = this.config.get<string>('ALERT_WEBHOOK_URL')?.trim() || undefined;

    if (!this.url) {
      this.logger.warn(
        'ALERT_WEBHOOK_URL no está configurada: las alertas se registrarán en el log pero no se enviarán a ningún sitio.',
      );
    }
  }

  /**
   * Avisa de que algo va mal. **Nunca lanza.**
   *
   * Esa garantía es la más importante del servicio: se llama desde bloques
   * `catch`, y un alertador que lance convierte un fallo en dos y se traga el
   * error original. Si el aviso no se puede mandar, se registra y se sigue.
   *
   * @param titulo    Qué se rompió, en una línea.
   * @param detalle   El motivo. Si es un error, se pasa por `describirError`.
   * @param claveDeFreno Agrupa avisos equivalentes. Por defecto, el título.
   * @param ventanaDeFrenoS Segundos de silencio tras un aviso. Por defecto
   *   {@link VENTANA_DE_FRENO_S}. **Quien avisa desde un cron tiene que pasarlo**:
   *   una ventana igual o menor que la cadencia no frena nada, porque cada
   *   ejecución cae justo en el borde de la anterior.
   */
  async avisar(
    titulo: string,
    detalle?: unknown,
    claveDeFreno?: string,
    ventanaDeFrenoS?: number,
  ): Promise<void> {
    const motivo = detalle === undefined ? '' : describirError(detalle);
    // Google Chat usa **un solo asterisco** para negrita, no dos: `**esto**`
    // saldría con los asteriscos a la vista.
    const texto = motivo ? `🔴 *${titulo}*\n${motivo}` : `🔴 *${titulo}*`;

    // Se registra siempre, se mande o no: el log es la fuente de verdad y la
    // alerta solo una notificación. Si el webhook está caído, la información
    // no se pierde.
    this.logger.warn(`ALERTA · ${titulo}${motivo ? `: ${motivo}` : ''}`);

    if (!this.url) return;

    if (!(await this.debeMandarse(claveDeFreno ?? titulo, ventanaDeFrenoS))) return;

    try {
      const respuesta = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // El formato de un webhook entrante de Google Chat: un objeto con
        // `text`. Hay tarjetas (`cardsV2`) si algún día hace falta estructura,
        // pero una alerta se lee mejor como una línea que como una ficha.
        body: JSON.stringify({ text: texto }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!respuesta.ok) {
        this.logger.error(
          `El webhook de alertas respondió ${respuesta.status}; el aviso no llegó a su destino`,
        );
      }
    } catch (err) {
      // Aquí se acaba el camino a propósito: no se relanza ni se reintenta.
      // Un bucle de reintentos en el alertador es cómo un canal caído acaba
      // tumbando lo que venía a vigilar.
      this.logger.error(
        `No se pudo enviar la alerta «${titulo}»: ${describirError(err)}`,
      );
    }
  }

  /**
   * El freno: deja pasar un aviso por clave y ventana.
   *
   * **Sin esto la alerta se vuelve el problema.** Un fallo en bucle —el webhook
   * de Gmail rechazando cada push, un worker reintentando— dispararía cientos
   * de mensajes en minutos, y un canal que grita se silencia; a partir de ahí
   * el sistema vuelve a ser ciego, pero con la sensación de estar vigilado.
   *
   * `SET NX EX` es la misma primitiva atómica que la deduplicación del webhook:
   * si la clave ya existe, alguien avisó hace poco y este se calla.
   *
   * **Ante la duda, manda.** Si Redis no responde no se puede saber si ya se
   * avisó, y un aviso de más es mucho menos grave que un silencio.
   */
  private async debeMandarse(clave: string, ventanaS = VENTANA_DE_FRENO_S): Promise<boolean> {
    try {
      const redis = (await this.cola.client) as unknown as {
        set(
          clave: string,
          valor: string,
          modoExpiracion: 'EX',
          segundos: number,
          modoExistencia: 'NX',
        ): Promise<string | null>;
      };

      const primero = await redis.set(
        `alerta:${clave}`,
        '1',
        'EX',
        ventanaS,
        'NX',
      );

      return primero !== null;
    } catch (err) {
      this.logger.warn(
        `No se pudo comprobar el freno de alertas; se manda igualmente: ${describirError(err)}`,
      );
      return true;
    }
  }
}
