/**
 * Convierte un error en texto legible **dentro del mensaje**, no como segundo
 * argumento del logger.
 *
 * **La trampa que esto existe para evitar.** `logger.error(mensaje, err)` de
 * Nest parece registrar el error y no lo hace: la segunda ranura es el
 * **stack**, y espera una cadena. Al pasarle un objeto, el formateador de pino
 * lo descarta, así que en Cloud Logging queda el mensaje y **nada más** — ni
 * texto del error, ni código, ni cuerpo de la respuesta.
 *
 * Costó dos días de ingesta rota: la renovación del `watch` de Gmail falló el
 * 08-13 y el 08-14 y sus dos registros no decían por qué, así que no se podía
 * distinguir un rechazo de Google de un tropiezo de la base de datos. La misma
 * trampa ya estaba documentada en `all-exceptions.filter.ts` («el serializador
 * de pino esperaba un Error de verdad») y aun así se repitió en nueve sitios.
 *
 * La forma correcta es meter el texto en el mensaje y el stack —una cadena— en
 * la segunda ranura:
 *
 * ```ts
 * this.logger.error(`No se pudo X: ${describirError(err)}`, stackDe(err));
 * ```
 *
 * Saca lo que de verdad hace falta para diagnosticar, incluido lo que las
 * librerías de Google esconden dos niveles adentro: `googleapis` envuelve la
 * respuesta HTTP en `err.response.data.error`, donde viven el `status` y el
 * `message` que explican un rechazo de `users.watch`.
 */
export function describirError(error: unknown): string {
  if (error === null || error === undefined) return '(sin error)';

  const partes: string[] = [];
  const obj = error as Record<string, unknown>;

  // `code` lo ponen tanto los errores de red de Node (`ECONNREFUSED`) como los
  // de googleapis (el HTTP como número) y los de Prisma (`P2002`).
  const codigo = obj?.code;
  if (typeof codigo === 'string' || typeof codigo === 'number') {
    partes.push(`code=${codigo}`);
  }

  // El estado HTTP, que en googleapis vive en `response.status`.
  const respuesta = obj?.response as Record<string, unknown> | undefined;
  const estado = obj?.status ?? respuesta?.status;
  if (typeof estado === 'number') partes.push(`HTTP ${estado}`);

  partes.push(error instanceof Error ? error.message : String(error));

  // El cuerpo de la respuesta de Google: `{ error: { code, message, status,
  // details } }`. Es donde está el motivo real de un rechazo de la API —
  // «Insufficient Permission», «Topic not found», «User rate limit
  // exceeded»— y sin él un 400 no se distingue de otro.
  const cuerpo = respuesta?.data;
  if (cuerpo !== undefined && cuerpo !== null) {
    const detalle = typeof cuerpo === 'string' ? cuerpo : seguroJson(cuerpo);
    // Recortado: el cuerpo puede traer datos del buzón y esto va a Cloud
    // Logging, que los retiene.
    if (detalle) partes.push(`respuesta=${detalle.slice(0, 500)}`);
  }

  return partes.join(' · ');
}

/**
 * El stack, que es lo que la segunda ranura de `logger.error` espera de verdad.
 *
 * Devuelve `undefined` para lo que no sea un `Error`, en vez de inventarse una
 * cadena: una ranura vacía se lee mejor que un `[object Object]`.
 */
export function stackDe(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/** `JSON.stringify` que no revienta con referencias circulares. */
function seguroJson(valor: unknown): string {
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}
