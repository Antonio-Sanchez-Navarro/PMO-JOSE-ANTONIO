/**
 * Corre una promesa con plazo, **y recoge el temporizador gane quien gane**.
 *
 * La primera versión de esto era un `Promise.race` con un `setTimeout` suelto,
 * y tenía un fallo que no se ve leyéndolo: cuando la consulta gana, el
 * temporizador perdedor **sigue armado hasta que vence**. Una sonda de
 * readiness se dispara cada pocos segundos, así que el proceso iba acumulando
 * temporizadores vivos que no servían para nada.
 *
 * Se notó en las pruebas antes que en producción: siete pruebas triviales de
 * los indicadores tardaban 24 segundos en vez de milisegundos, porque el worker
 * de jest esperaba a que vencieran, y jest avisaba de que había salido a la
 * fuerza. El `unref()` evita que el proceso se quede vivo por ellos, pero no
 * evita que existan.
 *
 * El `finally` es lo que lo cierra: el plazo se limpia en cuanto hay respuesta,
 * sea buena o mala.
 */
export async function conPlazo<T>(
  operacion: () => Promise<T>,
  ms: number,
  mensaje = `sin respuesta en ${ms} ms`,
): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;

  const plazo = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => reject(new Error(mensaje)), ms);
    // Un plazo pendiente no debe ser motivo para que el proceso siga vivo al
    // apagarse: cinturón sobre el `finally`, para el caso del cierre ordenado.
    temporizador.unref?.();
  });

  try {
    return await Promise.race([operacion(), plazo]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
