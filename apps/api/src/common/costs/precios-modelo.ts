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

/** El precio de un modelo en una fecha dada, aplicando los cambios programados. */
export function precioDe(model: string, cuando: Date = new Date()): PrecioModelo {
  const base = PRECIOS[model] ?? PRECIO_DESCONOCIDO;

  if (base.cambia && cuando >= new Date(`${base.cambia.el}T00:00:00-05:00`)) {
    return {
      entrada: base.cambia.entrada,
      salida: base.cambia.salida,
      revisadoEl: base.revisadoEl,
    };
  }

  return base;
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
    const el = new Date(`${precio.cambia.el}T00:00:00-05:00`);
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
