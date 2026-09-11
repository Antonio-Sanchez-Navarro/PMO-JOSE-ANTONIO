import type { ProposedTask } from "@pmo/shared";
import { apiFetch, apiFetchBlob } from "../../../lib/api";
import { getSocketId } from "../../kanban/hooks/useSocket";
import type { EmailSnippet, ThreadPage } from "../types";

/**
 * Lo que devuelve `GET /emails/:id`. Es el mismo correo del listado más el
 * cuerpo y —desde la Fase 6— la cuarentena.
 */
export interface EmailDetail extends EmailSnippet {
  bodyText?: string;
  isActionable?: boolean;
  /** ISO 8601, o `null` si el worker todavía no lo ha analizado. */
  processedAt?: string | null;
  /**
   * **La cuarentena.** Lo que la IA propuso para este correo y todavía no ha
   * aprobado nadie. Desde la Fase 6 el modelo ya no escribe en el tablero: deja
   * aquí su propuesta y espera.
   *
   * Ojo con las tres formas de "no hay nada", que no significan lo mismo:
   * `undefined` es un correo que la IA no ha mirado, `[]` es un correo que miró
   * y del que no sacó ninguna tarea, y `null` es un correo cuya propuesta ya se
   * aprobó y se limpió. Solo la segunda y la tercera dicen que el modelo hizo su
   * trabajo.
   */
  proposedTasks?: ProposedTask[] | null;
  /**
   * Las fichas de los adjuntos. Va en el detalle y no en el listado a propósito:
   * la bandeja ya sabe con `hasAttachments` si pintar el clip.
   *
   * ⚠️ **Vacío no quiere decir «sin adjuntos».** Las fichas se empezaron a
   * guardar en la Fase 8, así que un correo ingerido antes llega con `[]`
   * aunque tenga archivos. Cuando `hasAttachments` es `true` y esto está vacío,
   * la interfaz dice «no disponibles», que es lo que pasa de verdad.
   */
  attachments?: EmailAttachment[];
}

export async function fetchEmail(id: string): Promise<EmailDetail> {
  return apiFetch<EmailDetail>(`/emails/${id}`);
}

/**
 * Una ficha de adjunto. **El contenido no viaja aquí**: `size` son los bytes que
 * declara Gmail, para poder enseñar el peso sin bajarse el archivo.
 */
export interface EmailAttachment {
  /** Lo emite Gmail por mensaje: **solo sirve para este correo**. */
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  /**
   * Incrustado en el cuerpo —el logo de la firma, una imagen citada—, no
   * adjuntado por una persona. `verDescargables()` los esconde.
   */
  inline: boolean;
}

/**
 * Los adjuntos que merece la pena enseñar: los que alguien adjuntó de verdad.
 *
 * Sin este filtro, cada correo con firma corporativa enseña un «logo.png» que
 * nadie mandó, y el clip deja de significar «aquí hay un documento».
 */
export function verDescargables(attachments: EmailAttachment[] = []): EmailAttachment[] {
  return attachments.filter((a) => !a.inline);
}

/** Se pueden enseñar sin bajar: el backend los sirve con `Content-Disposition: inline`. */
export function sePuedeVerEnPantalla(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

/**
 * Baja un adjunto y lo entrega como `blob:` local.
 *
 * Quien lo llame es responsable de soltar la URL con `URL.revokeObjectURL`
 * cuando acabe: un `blob:` vivo retiene el archivo entero en memoria.
 */
export async function fetchAttachment(
  emailId: string,
  attachmentId: string,
): Promise<{ blob: Blob; url: string }> {
  const blob = await apiFetchBlob(`/emails/${emailId}/attachments/${attachmentId}`);
  return { blob, url: URL.createObjectURL(blob) };
}

/**
 * Por qué el lote no movió un id. Espeja `MOTIVO_OMISION` del backend.
 *
 * Los tres **no son el mismo suceso** y la interfaz no los cuenta juntos:
 * `ALREADY_DISMISSED` es una no-operación (el correo ya estaba donde se le
 * quería llevar), `NOT_PENDING` es el freno deliberado del lote sobre algo que
 * alguien ya despachó, y solo `NOT_FOUND` es una ausencia de verdad.
 *
 * El `(string & {})` deja pasar un motivo nuevo sin romper la compilación:
 * añadir un cuarto código es cosa del backend, y un cliente que no compila por
 * eso obligaría a desplegar los dos lados a la vez.
 */
export type BulkDismissReason =
  | "NOT_FOUND"
  | "ALREADY_DISMISSED"
  | "NOT_PENDING"
  | (string & {});

/**
 * La bandeja agrupada por hilo.
 *
 * ⚠️ **`skip` y `take` cuentan hilos, no correos.** `take=20` trae 20 hilos,
 * que pueden ser 20 correos o 300. Es justo el motivo de que exista la ruta:
 * con 728 correos en 401 hilos, paginar por correo obligaba a bajarse la
 * bandeja entera para saber cuántas filas había que pintar.
 */
export async function fetchEmailThreads(params: {
  status: string;
  take: number;
  skip?: number;
  /** Vocabulario cerrado (`EMPRESAS`): un valor de fuera da 400, no lista vacía. */
  company?: string;
  /** Vocabulario cerrado (`BANCOS`). Filtra por uno; no hay «cualquier banco». */
  bank?: string;
}): Promise<ThreadPage> {
  const query = new URLSearchParams({
    status: params.status,
    take: String(params.take),
  });
  if (params.skip) query.set("skip", String(params.skip));
  if (params.company) query.set("company", params.company);
  if (params.bank) query.set("bank", params.bank);
  return apiFetch<ThreadPage>(`/emails/threads?${query.toString()}`);
}

/** Un id que el lote no pudo mover, con el motivo que dio la API. */
export interface BulkDismissSkip {
  id: string;
  reason: BulkDismissReason;
}

/**
 * Resultado de `POST /emails/bulk-dismiss`, ya agregado sobre todos los lotes.
 *
 * **Un lote grande no es todo o nada.** 318 correos no pueden caerse enteros
 * porque uno de los ids haya dejado de existir entre que se pintó la lista y se
 * pulsó el botón, así que la API contesta 200 con el desglose y aquí se suma.
 */
export interface BulkDismissResult {
  requested: number;
  updated: number;
  skipped: BulkDismissSkip[];
}

/**
 * Cuántos ids van por llamada.
 *
 * **Es el tope real de la API**, no una precaución: `BulkDismissDto` valida
 * `@ArrayMaxSize(200)`, así que un envío de 318 de golpe sería un 400. Los no
 * accionables de producción salen en dos llamadas.
 *
 * Si ese número cambia al alza, este sigue siendo correcto —solo hace una
 * llamada de más—; lo que no puede es subir por delante del backend.
 */
const TAMANO_DE_LOTE = 200;

/**
 * Descarta correos en bloque: los mueve todos a `DISMISSED`.
 *
 * Los lotes van **en serie, no en paralelo**: el progreso que se enseña tiene
 * que corresponder con lo que la API ya escribió, y varias llamadas a la vez lo
 * convertirían en una animación que adelanta a los hechos.
 *
 * Manda `x-socket-id` por el mismo motivo que `PATCH /:id/status`: si el backend
 * respeta la cabecera, quien pulsó el botón no recibe el eco de su propio
 * cambio, que aquí serían cientos de repintados seguidos.
 */
export async function bulkDismissEmails(
  emailIds: string[],
  onProgress?: (procesados: number, total: number) => void,
): Promise<BulkDismissResult> {
  // Se manda **sin `force`**: el lote solo mueve lo que sigue en `PENDING`. Un
  // descarte masivo sale de una selección hecha sobre una lista que pudo
  // pintarse hace diez minutos, y un clic dirigido a los boletines no tiene por
  // qué llevarse por delante un correo que alguien completó mientras tanto.
  // Esos vuelven en `skipped` como `NOT_PENDING`, y la bandeja los nombra.
  const socketId = getSocketId();
  const total = emailIds.length;
  const agregado: BulkDismissResult = { requested: 0, updated: 0, skipped: [] };

  for (let inicio = 0; inicio < total; inicio += TAMANO_DE_LOTE) {
    const lote = emailIds.slice(inicio, inicio + TAMANO_DE_LOTE);

    const respuesta = await apiFetch<BulkDismissResult>("/emails/bulk-dismiss", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(socketId ? { "x-socket-id": socketId } : {}),
      },
      body: JSON.stringify({ emailIds: lote }),
    });

    agregado.requested += respuesta.requested ?? lote.length;
    agregado.updated += respuesta.updated ?? 0;
    if (respuesta.skipped?.length) agregado.skipped.push(...respuesta.skipped);

    onProgress?.(Math.min(inicio + TAMANO_DE_LOTE, total), total);
  }

  return agregado;
}
