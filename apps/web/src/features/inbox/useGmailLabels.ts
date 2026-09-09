import { useEffect, useState } from "react";
import { fetchGmailLabels, type GmailLabel } from "./api/labels.api";

/** Las etiquetas del buzón indexadas por el id que guarda `Email.labels`. */
export type LabelsById = Record<string, GmailLabel>;

/**
 * La lista del buzón entero se pide **una vez por sesión de página**, no una
 * por componente.
 *
 * La bandeja, sus filas y el detalle del correo necesitan el mismo diccionario,
 * y son tres sitios distintos: sin esta caché, abrir la bandeja dispararía tres
 * llamadas idénticas a Gmail para pintar los mismos nombres. La promesa se
 * comparte a nivel de módulo, así que el segundo y el tercero se enganchan a la
 * que ya está en vuelo.
 */
let enVuelo: Promise<GmailLabel[]> | null = null;

function cargar(): Promise<GmailLabel[]> {
  if (!enVuelo) {
    enVuelo = fetchGmailLabels().catch((err) => {
      // Se suelta la caché para que un montaje posterior pueda reintentar. Si
      // se quedara la promesa fallida, un fallo de red dejaría la bandeja sin
      // nombres hasta recargar la página entera.
      enVuelo = null;
      throw err;
    });
  }
  return enVuelo;
}

/**
 * Diccionario de etiquetas, o vacío mientras carga —o si no se pudo cargar—.
 *
 * **El fallo se traga a propósito.** Los nombres son presentación: si Gmail no
 * contesta, la bandeja tiene que seguir enseñando correos. Sin diccionario,
 * `visibleLabels` esconde lo que no sepa traducir, que es exactamente lo que
 * hacía antes de que este endpoint existiera.
 */
export function useGmailLabels(): LabelsById {
  const [byId, setById] = useState<LabelsById>({});

  useEffect(() => {
    let cancelado = false;

    cargar()
      .then((labels) => {
        if (cancelado) return;
        setById(Object.fromEntries(labels.map((label) => [label.id, label])));
      })
      .catch((err) => {
        console.warn("No se pudieron cargar los nombres de las etiquetas de Gmail:", err);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return byId;
}
