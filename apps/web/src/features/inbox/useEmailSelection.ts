import { useCallback, useEffect, useMemo, useState } from "react";
import type { EmailSnippet, EmailThread } from "./types";

/** Estado de la casilla de un hilo: ninguno, algunos o todos sus mensajes. */
export type EstadoDeSeleccion = "vacio" | "parcial" | "lleno";

/**
 * La selección múltiple de la bandeja.
 *
 * **Se selecciona por correo, aunque se pinte por hilo.** El descarte masivo
 * recibe `emailIds`, y un hilo puede mezclar mensajes accionables con boletines:
 * si la unidad de selección fuera el hilo, descartar uno se llevaría por delante
 * el mensaje que sí había que atender.
 *
 * **La selección no sobrevive a lo que no está en pantalla.** Cada vez que
 * cambia la lista —otra pestaña, otra etiqueta, un refresco— se podan los ids
 * que ya no están cargados. Es deliberado: una barra que dijera «318
 * seleccionados» con veinte filas a la vista estaría contando cosas que su
 * dueño no puede ver ni revisar, y el botón de al lado no pide confirmación de
 * veinte, sino de trescientos dieciocho.
 */
export function useEmailSelection(emails: EmailSnippet[]) {
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());

  const idsCargados = useMemo(() => new Set(emails.map((e) => e.id)), [emails]);

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
    (hilo: EmailThread): EstadoDeSeleccion => {
      let marcados = 0;
      for (const mensaje of hilo.messages) if (seleccion.has(mensaje.id)) marcados++;
      if (marcados === 0) return "vacio";
      return marcados === hilo.messages.length ? "lleno" : "parcial";
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
