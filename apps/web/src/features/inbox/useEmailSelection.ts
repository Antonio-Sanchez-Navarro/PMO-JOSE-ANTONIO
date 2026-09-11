import { useCallback, useEffect, useMemo, useState } from "react";
import type { InboxThread } from "./types";

/** Estado de la casilla de un hilo: ninguno, algunos o todos sus mensajes. */
export type EstadoDeSeleccion = "vacio" | "parcial" | "lleno";

/**
 * La selección múltiple de la bandeja.
 *
 * **Se guarda por correo, aunque se marque por hilo.** El descarte masivo
 * recibe `emailIds` y la casilla del hilo mete los suyos de una vez: guardar el
 * `threadId` en su lugar obligaría a resolverlo otra vez al enviar, y el hilo
 * que se envía tiene que ser el que se vio —los `emailIds` de la respuesta son
 * exactamente los correos que el lote va a mover, ni uno más.
 *
 * **La selección no sobrevive a lo que no está en pantalla.** Cada vez que
 * cambia la lista —otra pestaña, otra etiqueta, un refresco— se podan los ids
 * que ya no están cargados. Es deliberado: una barra que dijera «318
 * seleccionados» con veinte filas a la vista estaría contando cosas que su
 * dueño no puede ver ni revisar, y el botón de al lado no pide confirmación de
 * veinte, sino de trescientos dieciocho.
 */
export function useEmailSelection(threads: InboxThread[]) {
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());

  const idsCargados = useMemo(
    () => new Set(threads.flatMap((t) => t.emailIds)),
    [threads],
  );

  // La poda. Se hace en un efecto y no al leer, para que `seleccionados` sea
  // siempre el mismo conjunto que se va a mandar a la API.
  useEffect(() => {
    setSeleccion((actual) => {
      if (actual.size === 0) return actual;
      const podada = new Set([...actual].filter((id) => idsCargados.has(id)));
      return podada.size === actual.size ? actual : podada;
    });
  }, [idsCargados]);

  const alternar = useCallback((ids: string[], seleccionar: boolean) => {
    setSeleccion((actual) => {
      const siguiente = new Set(actual);
      for (const id of ids) {
        if (seleccionar) siguiente.add(id);
        else siguiente.delete(id);
      }
      return siguiente;
    });
  }, []);

  const limpiar = useCallback(() => setSeleccion(new Set()), []);

  /** Reemplaza la selección entera. Lo usan los atajos («todo lo visible»). */
  const reemplazar = useCallback((ids: string[]) => setSeleccion(new Set(ids)), []);

  const estaSeleccionado = useCallback((id: string) => seleccion.has(id), [seleccion]);

  const estadoDelHilo = useCallback(
    (hilo: InboxThread): EstadoDeSeleccion => {
      let marcados = 0;
      for (const id of hilo.emailIds) if (seleccion.has(id)) marcados++;
      if (marcados === 0) return "vacio";
      return marcados === hilo.emailIds.length ? "lleno" : "parcial";
    },
    [seleccion],
  );

  const seleccionados = useMemo(() => [...seleccion], [seleccion]);

  return {
    seleccionados,
    total: seleccion.size,
    estaSeleccionado,
    estadoDelHilo,
    alternar,
    reemplazar,
    limpiar,
  };
}
