import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alerts/alert.service';
import { describirError } from '../observability/describir-error';
import { ZONA_POR_DEFECTO } from '../time-zone';
import { precioDe, subidaCercana } from './precios-modelo';

/** Presupuesto por defecto, en dólares, si no se configura otro. */
const PRESUPUESTO_POR_DEFECTO = 20;

/**
 * Días de historial con los que se calcula el ritmo.
 *
 * Siete y no treinta: el ritmo de hace un mes no dice nada del de ahora, y este
 * proyecto ha cambiado de modelo dos veces en agosto. Siete cubre una semana
 * entera —incluidos los fines de semana, que son más flojos— sin arrastrar una
 * configuración vieja.
 */
const DIAS_DE_RITMO = 7;

/**
 * Suelo del divisor del ritmo, en días.
 *
 * ⚠️ **Uno, y antes era dos.** El dos compensaba a ojo que «el día en curso está
 * a medias porque el cron corre por la mañana». Eso ya no hace falta compensarlo:
 * desde el 2026-08-25 el divisor **mide** lo que lleva transcurrido el día en
 * curso en vez de suponerlo, así que un suelo de dos días solo serviría para
 * partir el ritmo por la mitad durante la primera jornada.
 *
 * Lo único que le queda por evitar al suelo es la división entre casi cero a las
 * 00:05 — ver {@link AiCostService.divisorDeRitmo}.
 */
const MINIMO_DE_DIAS = 1;

/** A partir de qué consumo se avisa. */
const UMBRALES = [0.75, 0.9];

/**
 * Silencio entre avisos de coste.
 *
 * ⚠️ **Ya NO va atado a la cadencia del cron, y el matiz importa.** El cron pasó
 * de diario a **horario** el 2026-08-25 —una cita diaria dejaba hasta 24 h entre
 * cruzar el umbral y enterarse— y este número no se tocó. No es un descuido: lo
 * que rompe un freno es ser **igual o menor** que la cadencia, que es lo que le
 * pasó al barrido con su freno de 24 h contra una cita de 24 h, donde cada pasada
 * caía justo en el borde de la anterior. 23 h contra una cita horaria están
 * veintitrés veces al otro lado.
 *
 * Lo que el freno fija es **cuántos avisos salen**, no cuánto se tarda en el
 * primero. Sigue siendo uno al día por umbral; lo que baja de 24 h a 1 h es la
 * espera hasta ese primero, que era todo el problema.
 *
 * ⚠️ **Donde la cadencia sí amplifica es en el fallo abierto de
 * `AlertService`**: si Redis no responde, el freno no se puede consultar y el
 * aviso se manda igualmente —a propósito, porque un mensaje de más es menos
 * grave que un silencio—. Con la cita diaria eso era un mensaje repetido al
 * día; con la horaria son veinticuatro. Se acepta porque un Redis caído se
 * lleva por delante las colas y ya está gritando por otros sitios, pero queda
 * escrito.
 */
const FRENO_S = 23 * 3_600;

/**
 * Silencio entre avisos de **subida de precio**, que es mucho mas largo.
 *
 * ⚠️ **Una subida programada es el hecho mas estable que existe**: la fecha se
 * sabe con semanas de antelacion y no cambia. Con el freno normal, el cron
 * diario mandaria el mismo mensaje **catorce dias seguidos** — eso no es una
 * alerta, es una suscripcion, y acaba con alguien silenciando el canal justo
 * antes de que llegue algo que importe.
 *
 * Con una semana, en la ventana de catorce dias avisa **dos veces**: cuando la
 * subida entra en el horizonte y un recordatorio a mitad. Eso es informacion.
 *
 * Lo encontro una prueba: la del umbral fallaba porque este aviso saltaba por
 * su cuenta. Sin escribirla, esto habria llegado a produccion con el mismo
 * fallo que llevamos un mes cerrando en otros sitios.
 */
const FRENO_SUBIDA_S = 7 * 24 * 3_600;

export interface EstimacionCoste {
  gastado: number;
  presupuesto: number;
  /** Fracción consumida, de 0 a 1 y sin techo: puede pasar de 1. */
  consumido: number;
  /** Gasto medio diario de los últimos {@link DIAS_DE_RITMO} días. */
  ritmoDiario: number;
  /** Días que quedan a ese ritmo. `null` si no hay ritmo del que estimar. */
  diasRestantes: number | null;
  porModelo: { model: string; entrada: number; salida: number; coste: number }[];
  /** Fecha en que se revisaron los precios usados. */
  preciosRevisadosEl: string;
}

/**
 * Cuánto se está consumiendo de las APIs de modelos, y cuánto queda.
 *
 * **Estima, no factura, y esa es la decisión.** La cuenta exacta la daría la
 * Admin API de Anthropic, pero exige otra credencial que crear, rotar y vigilar.
 * Y la pregunta útil no es «cuántos dólares llevo» sino **«cuánto queda al ritmo
 * actual»** — que sale de los `usage` que la API ya devuelve gratis en cada
 * llamada.
 *
 * Una estimación que avisa a tiempo vale más que una cifra exacta que llega
 * cuando la cola ya está parada.
 */
@Injectable()
export class AiCostService {
  private readonly logger = new Logger(AiCostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly alertas: AlertService,
  ) {}

  /**
   * Anota lo que costó una llamada.
   *
   * **Nunca lanza.** Se llama desde el camino de la clasificación y del
   * copiloto, y un fallo del contador no puede tumbar el trabajo que estaba
   * midiendo: sería el termómetro rompiendo al enfermo. Si falla, se registra y
   * se sigue — el precio es una estimación algo baja, no un correo perdido.
   */
  async registrar(model: string, entrada: number, salida: number): Promise<void> {
    if (!model || (entrada <= 0 && salida <= 0)) return;

    try {
      const dia = this.diaLocal();

      await this.prisma.aiUsage.upsert({
        where: { dia_model: { dia, model } },
        create: { dia, model, inputTokens: entrada, outputTokens: salida, llamadas: 1 },
        update: {
          inputTokens: { increment: entrada },
          outputTokens: { increment: salida },
          llamadas: { increment: 1 },
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo anotar el consumo de ${model}: ${describirError(err)}`);
    }
  }

  /** Lo consumido en el mes en curso, con el ritmo y lo que queda. */
  async estimar(ahora: Date = new Date()): Promise<EstimacionCoste> {
    const desdeMes = this.diaLocal(ahora);
    desdeMes.setUTCDate(1);

    const filas = await this.prisma.aiUsage.findMany({
      where: { dia: { gte: desdeMes } },
      select: { dia: true, model: true, inputTokens: true, outputTokens: true },
    });

    const porModelo = new Map<string, { entrada: number; salida: number; coste: number }>();
    let gastado = 0;

    for (const fila of filas) {
      // El precio del **día en que se consumió**, no el de hoy: si Sonnet 5 sube
      // el 31, lo gastado antes siguió costando lo de antes. Sumar todo al
      // precio nuevo inflaría el pasado y el aviso llegaría antes de tiempo.
      const precio = precioDe(fila.model, fila.dia);
      const coste =
        (fila.inputTokens / 1_000_000) * precio.entrada +
        (fila.outputTokens / 1_000_000) * precio.salida;

      const acc = porModelo.get(fila.model) ?? { entrada: 0, salida: 0, coste: 0 };
      acc.entrada += fila.inputTokens;
      acc.salida += fila.outputTokens;
      acc.coste += coste;
      porModelo.set(fila.model, acc);

      gastado += coste;
    }

    const ritmoDiario = await this.ritmoDiario(ahora);
    const presupuesto = this.presupuesto();
    const restante = Math.max(presupuesto - gastado, 0);

    return {
      gastado,
      presupuesto,
      consumido: presupuesto > 0 ? gastado / presupuesto : 0,
      ritmoDiario,
      // Sin ritmo no se inventa una cifra: `null` significa «no lo sé», que es
      // una respuesta, y `Infinity` disfrazado de «quedan muchos días» no lo es.
      diasRestantes: ritmoDiario > 0 ? Math.floor(restante / ritmoDiario) : null,
      porModelo: [...porModelo].map(([model, v]) => ({ model, ...v })),
      preciosRevisadosEl: precioDe('claude-sonnet-5').revisadoEl,
    };
  }

  /**
   * Comprueba el consumo y avisa si toca.
   *
   * ⚠️ **El mensaje dice los días que quedan, no el porcentaje.** «Quedan ~11
   * días al ritmo de los últimos 7» se actúa; «has consumido el 90 %» se
   * archiva. Es la misma diferencia que entre un aviso con enlace al log y uno
   * que obliga a buscarlo.
   */
  async comprobar(ahora: Date = new Date()): Promise<EstimacionCoste> {
    const e = await this.estimar(ahora);

    this.logger.log(
      `Coste IA · $${e.gastado.toFixed(2)} de $${e.presupuesto} ` +
        `(${Math.round(e.consumido * 100)}%) · ritmo $${e.ritmoDiario.toFixed(2)}/dia · ` +
        `quedan ${e.diasRestantes ?? '?'} dia(s) · precios de ${e.preciosRevisadosEl}`,
    );

    const umbral = UMBRALES.filter((u) => e.consumido >= u).pop();
    const subidas = subidaCercana(ahora);

    if (umbral === undefined && subidas.length === 0) return e;

    const partes: string[] = [];

    if (umbral !== undefined) {
      partes.push(
        `Llevas $${e.gastado.toFixed(2)} de $${e.presupuesto} este mes. ` +
          (e.diasRestantes === null
            ? 'No hay consumo reciente del que estimar cuanto queda.'
            : `Al ritmo de los ultimos ${DIAS_DE_RITMO} dias ($${e.ritmoDiario.toFixed(2)}/dia), ` +
              `quedan ~${e.diasRestantes} dia(s).`),
      );
    }

    if (subidas.length > 0) {
      for (const subida of subidas) {
        partes.push(
          `Y ojo: el ${subida.el} ${subida.model} sube un ${subida.subida}% porque ${subida.porQue}. ` +
            'El gasto de ese dia en adelante no se parecera al de ahora.',
        );
      }
    }

    partes.push(`Precios comprobados el ${e.preciosRevisadosEl}. Es una estimacion, no la factura.`);

    // La clave y el freno cambian segun de que se avise: el umbral es una
    // condicion que evoluciona, la subida es una fecha fija. Mezclarlos haria
    // que el aviso lento heredara el freno del rapido.
    await this.alertas.avisar(
      umbral !== undefined
        ? `Consumo de IA al ${Math.round(umbral * 100)}% del presupuesto`
        : 'Sube el precio de un modelo que usamos',
      partes.join(' '),
      umbral !== undefined ? `coste-ia-${umbral}` : 'coste-ia-subida',
      umbral !== undefined ? FRENO_S : FRENO_SUBIDA_S,
    );

    return e;
  }

  /**
   * Gasto medio diario, para proyectar.
   *
   * ⚠️ **Se divide entre los días que la observación cubre de verdad, no entre
   * {@link DIAS_DE_RITMO} fijo.** El día que se estrenó la tabla había **un**
   * día de datos y se dividía entre **siete**: el ritmo salía siete veces menor
   * que el real y los días restantes siete veces mayores. Medido en producción
   * el 2026-08-25, con la tabla recién creada:
   *
   *     Coste IA · $0.01 de $20 (0%) · ritmo $0.00/dia · quedan 20235 dia(s)
   *
   * Con el gasto de ese día repartido en un día eran ~2.900. **El sesgo empujaba
   * hacia «queda más de lo que queda»**, que es el lado por el que se llega a
   * cero sin aviso — y el contrario del que este mismo módulo eligió para el
   * modelo desconocido, que se estima por arriba a propósito.
   *
   * No es solo del estreno: vuelve cada vez que el consumo se interrumpe varios
   * días, porque entonces la ventana tiene menos historia de la que aparenta.
   *
   * **Se cuentan los días transcurridos desde el primer dato, no los días que
   * tienen fila.** Un sábado sin correos es un cero **real** y tiene que pesar
   * en la media; descontarlo inflaría el ritmo y adelantaría el aviso sin
   * motivo. Lo que no es real es contar como observados los seis días
   * anteriores a que existiera la tabla.
   *
   * Y el día **en curso** cuenta por las horas que lleva, no como un día entero:
   * lo dice {@link AiCostService.divisorDeRitmo}, y es lo que hace que este
   * número no dé un salto a cada medianoche ahora que el cron corre cada hora.
   */
  private async ritmoDiario(ahora: Date): Promise<number> {
    // ⚠️ **La ventana se corta por días locales, no restando 168 h al instante
    // de ahora.** Restando horas, el día más viejo entraba o salía de la ventana
    // según la hora a la que corriera el cron; con la cita diaria fija eso daba
    // siempre el mismo resultado, pero desde que corre **cada hora** la ventana
    // cambiaría de tamaño veinticuatro veces al día y el ritmo daría saltos que
    // no están en el gasto. Así son siempre hoy y los seis días anteriores.
    const desde = this.diaLocal(ahora);
    desde.setUTCDate(desde.getUTCDate() - (DIAS_DE_RITMO - 1));

    const filas = await this.prisma.aiUsage.findMany({
      where: { dia: { gte: desde } },
      select: { dia: true, model: true, inputTokens: true, outputTokens: true },
    });

    if (filas.length === 0) return 0;

    let total = 0;
    let primerDia = filas[0].dia.getTime();

    for (const fila of filas) {
      const precio = precioDe(fila.model, fila.dia);
      total +=
        (fila.inputTokens / 1_000_000) * precio.entrada +
        (fila.outputTokens / 1_000_000) * precio.salida;

      primerDia = Math.min(primerDia, fila.dia.getTime());
    }

    // Fraccionario y sin `+ 1`: se cuenta hasta **este momento**, no hasta el
    // final de hoy. Ver {@link AiCostService.divisorDeRitmo}.
    const cubiertos = (this.instanteLocal(ahora) - primerDia) / 86_400_000;

    return total / this.divisorDeRitmo(cubiertos);
  }

  /**
   * Entre cuántos días se reparte el gasto observado.
   *
   * ⚠️ **`diasCubiertos` es fraccionario a propósito, y ese es el arreglo del
   * 2026-08-25.** Cuenta desde las 00:00 locales del primer día con datos hasta
   * **este instante**, no hasta el final de hoy: a la 01:00 del segundo día han
   * transcurrido 1,04 días, no 2. Contar el día en curso como entero repartía el
   * gasto entre más días de los vividos y **bajaba el ritmo**, que es la misma
   * dirección del `/7` fijo que esto ya corrigió: hacia «queda más de lo que
   * queda», por donde se llega a cero sin aviso.
   *
   * Con la cita de las 08:00 ese sesgo valía un tercio de día y era tolerable.
   * Desde que el cron corre **cada hora** aparecería entero cada madrugada: a las
   * 00:30, el día en curso —vacío— pesaría tanto como cualquier día completo.
   * Acelerar la cadencia es lo que convirtió un redondeo aceptable en una
   * mentira horaria.
   *
   * Acotado por los dos lados, y cada tope evita un error distinto:
   *
   * - **Por arriba, {@link DIAS_DE_RITMO}**: nunca se reparte entre más días de
   *   los que mira la ventana, aunque la tabla tenga meses.
   * - **Por abajo, {@link MINIMO_DE_DIAS}**: a las 00:05 del primer día han
   *   transcurrido 0,003 días, y dividir por eso convierte tres céntimos en un
   *   ritmo de diez dólares diarios. El suelo dice «como mucho, todo esto cabe
   *   en un día», que es la lectura conservadora y no inventa una alarma.
   *
   * ⚠️ **El suelo tiene un precio y conviene tenerlo escrito**: mientras solo
   * haya unas horas de historia, el ritmo sale por debajo del real y el aviso
   * llegaría tarde. Dura lo que tarda en cumplirse el primer día y solo muerde
   * cuando aún no hay casi nada que medir — pero es una decisión, no una
   * propiedad, y va en la dirección incómoda.
   */
  private divisorDeRitmo(diasCubiertos: number): number {
    return Math.min(DIAS_DE_RITMO, Math.max(MINIMO_DE_DIAS, diasCubiertos));
  }

  private presupuesto(): number {
    const crudo = Number(this.config.get<string>('PRESUPUESTO_IA_USD'));
    return Number.isFinite(crudo) && crudo > 0 ? crudo : PRESUPUESTO_POR_DEFECTO;
  }

  /**
   * El día de hoy en la zona del producto.
   *
   * Se corta con {@link ZONA_POR_DEFECTO} y no en UTC para que el consumo se
   * reparta en los mismos días que el resto de las métricas del tablero. Dos
   * cortes distintos darían dos verdades sobre el mismo martes.
   */
  private diaLocal(ahora: Date = new Date()): Date {
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_POR_DEFECTO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ahora);

    return new Date(`${local}T00:00:00.000Z`);
  }

  /**
   * Ahora mismo, en la zona del producto y en la misma escala que
   * {@link AiCostService.diaLocal}.
   *
   * **Existe para que el día en curso se pueda medir en vez de suponerse.**
   * `diaLocal` da las 00:00 locales de hoy; esto da esas 00:00 más lo que va del
   * día, así que restarle un `dia` de la tabla da **días con decimales** en vez
   * de un salto de uno en uno.
   *
   * Ojo con mezclar escalas: las filas de `aiUsage` guardan el día local
   * disfrazado de medianoche UTC, así que restarles un `Date` real se equivoca
   * en las cinco horas del huso. Por eso esto se construye sobre `diaLocal` y no
   * sobre `ahora.getTime()`.
   */
  private instanteLocal(ahora: Date): number {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA_POR_DEFECTO,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // `h23` y no `hour12: false`: sin esto, la medianoche sale como «24» en
      // varios locales y el día en curso empezaría valiendo un día entero.
      hourCycle: 'h23',
    }).formatToParts(ahora);

    const valor = (tipo: string): number =>
      Number(partes.find((p) => p.type === tipo)?.value ?? 0);

    return (
      this.diaLocal(ahora).getTime() +
      ((valor('hour') * 60 + valor('minute')) * 60 + valor('second')) * 1_000
    );
  }
}
