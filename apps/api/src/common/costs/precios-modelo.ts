/**
 * Lo que cuesta cada modelo, por millón de tokens.
 *
 * ⚠️ **Un precio es un dato con fecha de caducidad, y este archivo existe para
 * que eso se vea.** Cada entrada dice **cuándo se comprobó** y, si su precio
 * cambia en una fecha conocida, **cuándo cambia y a cuánto**. Un precio
 * incrustado sin fecha es exactamente la familia del `maxScale` del comentario:
 * un número correcto el día que se escribió y silenciosamente falso después.
 *
 * El aviso de coste **dice esta fecha**, para que quien lo lea sepa contra qué
 * se está comparando en vez de tener que confiar.
 */
export interface PrecioModelo {
  /** USD por millón de tokens de entrada. */
  entrada: number;
  /** USD por millón de tokens de salida. */
  salida: number;
  /** Cuándo se comprobó este precio contra la documentación de la API. */
  revisadoEl: string;
  /**
   * Si el precio sube en una fecha conocida, aquí. La estimación **lo aplica
   * sola** cuando llega el día: un precio que caduca y no se actualiza hace que
   * el aviso llegue tarde, que es justo cuando no sirve.
   */
  cambia?: { el: string; entrada: number; salida: number; porQue: string };
}

/**
 * Precios vigentes.
 *
 * ⚠️ **Sonnet 5 corre hoy a precio de lanzamiento y sube un 50 % el 31 de
 * agosto de 2026** — de $2/$10 a $3/$15 por millón. Y `CLAUDE_MODEL_CLASSIFY`
 * es `claude-sonnet-5`, así que **lo que sube es la clasificación de correos**,
 * que es el gasto continuo de este proyecto. No es una nota al pie: es que el
 * consumo se encarece un 50 % en una fecha que ya conocemos.
 */
export const PRECIOS: Record<string, PrecioModelo> = {
  'claude-sonnet-5': {
    entrada: 2,
    salida: 10,
    revisadoEl: '2026-08-25',
    cambia: {
      el: '2026-08-31',
      entrada: 3,
      salida: 15,
      porQue: 'acaba el precio de lanzamiento de Sonnet 5',
    },
  },
  'claude-fable-5': { entrada: 10, salida: 50, revisadoEl: '2026-08-25' },
  'claude-mythos-5': { entrada: 10, salida: 50, revisadoEl: '2026-08-25' },
  'claude-opus-5': { entrada: 5, salida: 25, revisadoEl: '2026-08-25' },
  'claude-opus-4-8': { entrada: 5, salida: 25, revisadoEl: '2026-08-25' },
  'claude-opus-4-7': { entrada: 5, salida: 25, revisadoEl: '2026-08-25' },
  'claude-opus-4-6': { entrada: 5, salida: 25, revisadoEl: '2026-08-25' },
  'claude-sonnet-4-6': { entrada: 3, salida: 15, revisadoEl: '2026-08-25' },
  'claude-haiku-4-5': { entrada: 1, salida: 5, revisadoEl: '2026-08-25' },
};

/**
 * Precio de un modelo desconocido.
 *
 * **Se estima por arriba a propósito.** Un modelo que no está en la tabla es
 * uno que alguien añadió sin pasar por aquí; contarlo como gratis haría que el
 * gasto pareciera menor justo cuando ha cambiado algo. Que la estimación se
 * pase es recuperable; que se quede corta es cómo se llega a cero sin aviso.
 */
export const PRECIO_DESCONOCIDO: PrecioModelo = {
  entrada: 10,
  salida: 50,
  revisadoEl: '2026-08-25',
};

/**
 * Cuándo entra en vigor un cambio de precio, como instante.
 *
 * ⚠️ **`-05:00` y no `Z`.** Una subida anunciada «el 31» empieza a las 00:00 de
 * Tulum, que son las 05:00 UTC: con `Z` se encarecerían las cinco últimas horas
 * del día 30. `America/Cancun` es UTC−5 fijo y no cambia con el horario de
 * verano —ver `ZONA_POR_DEFECTO` en `common/time-zone.ts`—, así que el desfase
 * se puede escribir aquí sin que caduque.
 */
const entraEnVigor = (el: string): Date => new Date(`${el}T00:00:00-05:00`);

/** El día del calendario de una fila de `aiUsage`, como `YYYY-MM-DD`. */
const diaDelCalendario = (dia: Date): string => dia.toISOString().slice(0, 10);

/** El mismo precio con la subida ya aplicada. */
const conLaSubidaPuesta = (
  base: PrecioModelo,
  cambia: NonNullable<PrecioModelo['cambia']>,
): PrecioModelo => ({
  entrada: cambia.entrada,
  salida: cambia.salida,
  revisadoEl: base.revisadoEl,
});

/**
 * El precio de un modelo en un **instante** dado.
 *
 * ⚠️ **Para las filas de `aiUsage` NO es esta, es
 * {@link precioDelDia}.** No son intercambiables aunque las dos reciban un
 * `Date`, y confundirlas cuesta un día entero de estimación — está contado ahí.
 */
export function precioDe(model: string, cuando: Date = new Date()): PrecioModelo {
  const base = PRECIOS[model] ?? PRECIO_DESCONOCIDO;

  return base.cambia && cuando >= entraEnVigor(base.cambia.el)
    ? conLaSubidaPuesta(base, base.cambia)
    : base;
}

/**
 * El precio que rigió un **día del calendario**, para las filas de `aiUsage`.
 *
 * ⚠️ **Existe porque `aiUsage.dia` no es un instante: es una fecha disfrazada de
 * `Date`.** `AiCostService.diaLocal` guarda el día local como medianoche UTC, así
 * que la fila del 31 de agosto lleva dentro `2026-08-31T00:00:00Z` — que como
 * instante son **las 19:00 del día 30 en Tulum**, cinco horas antes de que la
 * subida entre en vigor.
 *
 * Pasándola por {@link precioDe}, el resultado era que **el día entero de la
 * subida se cobraba al precio viejo**: hasta un 50 % de menos justo el día en que
 * el gasto se encarece, y en la dirección de «queda más de lo que queda», que es
 * por donde se llega a cero sin aviso. Encontrado el 2026-08-25, antes de que
 * mordiera: la primera subida es el 31.
 *
 * **La cura es no volver a mezclar las dos escalas.** Aquí no se convierte nada a
 * instante: se comparan dos fechas `YYYY-MM-DD` como texto, que en formato ISO
 * ordena igual que el calendario. Sin husos por medio no hay desfase que
 * equivocarse.
 */
export function precioDelDia(model: string, dia: Date): PrecioModelo {
  const base = PRECIOS[model] ?? PRECIO_DESCONOCIDO;

  return base.cambia && diaDelCalendario(dia) >= base.cambia.el
    ? conLaSubidaPuesta(base, base.cambia)
    : base;
}

/** ¿Hay subidas de precio pendientes en los próximos `dias`? */
export function subidaCercana(
  cuando: Date = new Date(),
  dias = 14,
): { model: string; el: string; porQue: string; subida: number }[] {
  const limite = new Date(cuando.getTime() + dias * 24 * 3_600_000);
  const subidas: { model: string; el: string; porQue: string; subida: number }[] = [];

  for (const [model, precio] of Object.entries(PRECIOS)) {
    if (!precio.cambia) continue;
    const el = entraEnVigor(precio.cambia.el);
    if (el < cuando || el > limite) continue;

    subidas.push({
      model,
      el: precio.cambia.el,
      porQue: precio.cambia.porQue,
      // Cuánto sube la entrada, que es la parte que domina en la clasificación:
      // los correos son largos y las respuestas cortas.
      subida: Math.round((precio.cambia.entrada / precio.entrada - 1) * 100),
    });
  }

  return subidas;
}
