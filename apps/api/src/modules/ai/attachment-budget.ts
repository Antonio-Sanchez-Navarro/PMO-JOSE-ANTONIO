/**
 * Qué adjuntos se le mandan al modelo, y cuáles no.
 *
 * Vive aparte del servicio porque es **una decisión de coste y de límites**, no
 * de clasificación: se puede leer, discutir y probar sin montar nada. Y porque
 * equivocarse aquí no da un error — da una factura.
 */

/** Un adjunto, en lo que esta decisión necesita saber de él. */
export interface AdjuntoCandidato {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
}

/** Cómo viaja un adjunto dentro del mensaje a Anthropic. */
export type FormaDeBloque = 'document' | 'image';

/**
 * Lo que el modelo sabe mirar, y cómo hay que envolverlo.
 *
 * La lista es corta a propósito: son los tipos que Anthropic acepta hoy. Un
 * `.docx` o un `.xlsx` **no** entran —el modelo no los abre— y mandarlos sería
 * pagar por que los rechace.
 */
const TIPOS_SOPORTADOS: Record<string, FormaDeBloque> = {
  'application/pdf': 'document',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
};

/**
 * Tope por archivo, en bytes.
 *
 * Anthropic rechaza por encima de ~5 MB por archivo. Se corta antes, en 4,5, y
 * el margen no es timidez: lo que se cuenta aquí es el tamaño que **declara
 * Gmail**, y lo que viaja es base64, que abulta un tercio más. Apurar al límite
 * exacto sería fallar justo con los archivos grandes, que son los que más caro
 * salen de descargar para nada.
 */
export const MAX_BYTES_POR_ADJUNTO = 4.5 * 1024 * 1024;

/**
 * Tope sumado de todos los adjuntos de un correo.
 *
 * El límite de la petición entera es mucho mayor, pero esto no lo pone la API:
 * lo pone la factura. Un correo con diez PDF de 4 MB es una clasificación
 * carísima para un tablero de tareas, y el valor de leer el décimo documento no
 * se parece al del primero.
 *
 * ⚠️ **Bajado de 10 a 6 MB el 2026-09-14, y no por ahorrar: por coherencia.**
 * Al recortar {@link MAX_ADJUNTOS_POR_CORREO} a 2, el tope de 10 MB se volvió
 * **inalcanzable** —dos archivos de 4,5 MB como mucho son 9— así que dejaba de
 * ser un techo para pasar a ser código muerto, con su prueba convertida en un
 * adorno que ya no comprobaba nada. Seis lo devuelve a la vida: corta el caso
 * caro de verdad, que son dos PDF grandes en el mismo correo.
 *
 * Los dos números van atados. Si algún día sube el de archivos, hay que volver
 * a mirar este, o vuelve a sobrar.
 */
export const MAX_BYTES_POR_CORREO = 6 * 1024 * 1024;

/**
 * Tope de archivos por correo.
 *
 * **Este número no es solo dinero de Anthropic: es cuota de Gmail.** Cada
 * archivo que se manda al modelo cuesta antes un `messages.attachments.get`, y
 * ese método se paga del mismo cubo por usuario que la ingesta. Cinco archivos
 * por correo eran cinco llamadas más por cada clasificación, justo mientras la
 * recuperación del atasco necesitaba ese cubo para bajar mensajes.
 *
 * **Bajado de 5 a 2 el 2026-09-14** (Fase 8.2), con la ingesta parada por 429
 * en producción y 258 pausas consecutivas. Junto con el recorte del limitador
 * del worker, el gasto máximo por minuto en adjuntos baja un ~88%.
 *
 * Dos y no uno porque el segundo archivo sigue teniendo valor real —el par
 * «contrato + anexo», «factura + comprobante» es corriente— y el reparto
 * respeta el orden del correo, así que los dos que entran son los que quien
 * escribió puso primero. Del tercero en adelante el valor cae rápido y el coste
 * no.
 */
export const MAX_ADJUNTOS_POR_CORREO = 2;

/** Un adjunto que sí se va a mandar. */
export interface AdjuntoElegido {
  candidato: AdjuntoCandidato;
  forma: FormaDeBloque;
}

/** Un adjunto que se queda fuera, con el motivo dicho en castellano. */
export interface AdjuntoDescartado {
  filename: string;
  motivo: string;
}

export interface Reparto {
  elegidos: AdjuntoElegido[];
  descartados: AdjuntoDescartado[];
}

/**
 * Decide qué adjuntos acompañan al correo en la llamada al modelo.
 *
 * **Los descartados importan tanto como los elegidos**, y por eso se devuelven
 * con su motivo: el prompt tiene que poder decirle al modelo «hay un PDF de 20
 * MB que no has visto». Callarlo es lo que le hace escribir «según el documento
 * adjunto…» sobre algo que nunca leyó.
 *
 * El orden es el del correo, no por tamaño: si hay que dejar algo fuera por
 * presupuesto, se queda lo primero que adjuntó quien escribió, que suele ser lo
 * principal. Ordenar por tamaño metería primero la miniatura y dejaría fuera el
 * contrato.
 */
export function repartirAdjuntos(candidatos: AdjuntoCandidato[]): Reparto {
  const elegidos: AdjuntoElegido[] = [];
  const descartados: AdjuntoDescartado[] = [];
  let bytesUsados = 0;

  for (const candidato of candidatos) {
    // Los incrustados primero: son el logo de la firma y la imagen citada, y
    // sin este filtro la clasificación pagaría tokens de imagen por mirar el
    // logotipo de la empresa en **cada** correo que llega.
    if (candidato.inline) continue;

    const forma = TIPOS_SOPORTADOS[candidato.mimeType.toLowerCase()];
    if (!forma) {
      descartados.push({
        filename: candidato.filename,
        motivo: `tipo no soportado (${candidato.mimeType})`,
      });
      continue;
    }

    if (candidato.size > MAX_BYTES_POR_ADJUNTO) {
      descartados.push({
        filename: candidato.filename,
        motivo: `demasiado grande (${mb(candidato.size)} MB)`,
      });
      continue;
    }

    if (elegidos.length >= MAX_ADJUNTOS_POR_CORREO) {
      descartados.push({ filename: candidato.filename, motivo: 'se superó el tope de archivos' });
      continue;
    }

    if (bytesUsados + candidato.size > MAX_BYTES_POR_CORREO) {
      descartados.push({ filename: candidato.filename, motivo: 'se superó el tamaño total' });
      continue;
    }

    elegidos.push({ candidato, forma });
    bytesUsados += candidato.size;
  }

  return { elegidos, descartados };
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
