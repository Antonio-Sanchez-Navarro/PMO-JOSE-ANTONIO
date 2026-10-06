import type { ClassifyEmailJob } from './classify-email.job';

/**
 * Un solo análisis por ráfaga de correos del mismo hilo (encargo J).
 *
 * Desde G la IA piensa **el hilo entero** cada vez, y con un trabajo por correo
 * una ráfaga se pagaba varias veces: el 05-10 a las 17:33 entraron tres correos
 * del hilo de Sofía en 10 s y se hicieron tres análisis de ~$0,03 para un
 * resultado que solo valía el último.
 *
 * Ahora, al entrar un correo, no se analiza ese correo: se programa «pensar el
 * hilo» con un `jobId` del hilo y {@link RETARDO_HILO_MS} de espera. Al
 * ejecutarse, el trabajo lee el hilo **en ese momento** y lo piensa desde su
 * correo más reciente, así que ningún correo se queda fuera: el último siempre
 * está dentro.
 *
 * - **Si ya hay uno esperando, no se crea otro ni se reprograma.** Reprogramar
 *   alargaría la espera con cada correo nuevo, y un hilo con mucho movimiento
 *   no se pensaría nunca. Sin reprogramar, la espera máxima es fija (60 s desde
 *   el primer correo de la ráfaga) y el trabajo igualmente ve los que lleguen
 *   después, porque lee el hilo al ejecutarse.
 * - **Si está ejecutándose, se programa un segundo** con el otro id del par
 *   (`…` / `…-tras`). El que corre leyó el hilo al empezar y puede no ver el
 *   correo nuevo; el segundo sí lo verá. Si al final no hay nada pendiente, el
 *   procesador lo descarta sin llamar al modelo.
 * - **Si el anterior terminó o falló**, se borra y se programa de nuevo: BullMQ
 *   ignora un `add` con un id que ya existe en cualquier estado, y los trabajos
 *   terminados se conservan un día (`removeOnComplete`). Sin el borrado, el
 *   segundo correo de un hilo en 24 h no se analizaría nunca.
 *
 * Un trabajo perdido (Redis que se vacía, un fallo al encolar) no pierde el
 * correo: sigue con `processedAt` a `null` y el barrido de reconciliación lo
 * vuelve a programar por aquí mismo. Un redespliegue no afecta: los trabajos
 * esperando viven en Redis, no en el proceso.
 */
export const RETARDO_HILO_MS = 60_000;

/** Lo que se usa de la cola. Así las pruebas no necesitan Redis. */
export interface ColaDeHilos {
  getJob(id: string): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | undefined | null>;
  add(nombre: string, data: ClassifyEmailJob, opts: { jobId: string; delay: number }): Promise<unknown>;
}

const ESPERANDO = new Set(['delayed', 'waiting', 'wait', 'prioritized', 'waiting-children']);

/** Los dos ids de un hilo. `:` no vale en un `jobId` de BullMQ. */
export function idsDelHilo(userId: string, threadId: string): [string, string] {
  const base = `hilo-${userId}-${threadId}`;
  return [base, `${base}-tras`];
}

export type ResultadoProgramar = 'programado' | 'ya-esperando';

export async function programarAnalisisDelHilo(
  cola: ColaDeHilos,
  correo: { emailId: string; userId: string; threadId: string },
  retardoMs: number = RETARDO_HILO_MS,
): Promise<ResultadoProgramar> {
  const ids = idsDelHilo(correo.userId, correo.threadId);

  const estados: { id: string; estado: string | null; quitar?: () => Promise<void> }[] = [];
  for (const id of ids) {
    const job = await cola.getJob(id);
    estados.push(job ? { id, estado: await job.getState(), quitar: () => job.remove() } : { id, estado: null });
  }

  // Uno esperando ya leerá este correo cuando le toque.
  if (estados.some((e) => e.estado !== null && ESPERANDO.has(e.estado))) return 'ya-esperando';

  // Un id libre del par que no esté corriendo: se limpia si quedó terminado o
  // fallido y se programa ahí.
  const libre = estados.find((e) => e.estado !== 'active');
  // Los dos corriendo a la vez: no hay id libre. El correo sigue sin procesar
  // si ninguno lo vio, y el barrido de reconciliación lo volverá a programar.
  if (!libre) return 'ya-esperando';
  if (libre.estado !== null && libre.quitar) await libre.quitar();

  await cola.add('classify', { emailId: correo.emailId }, { jobId: libre.id, delay: retardoMs });
  return 'programado';
}
