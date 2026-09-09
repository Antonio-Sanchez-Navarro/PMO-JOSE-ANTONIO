import { apiFetch } from "../../../lib/api";

/**
 * Una etiqueta del buzón, tal y como la devuelve `GET /gmail/labels`.
 *
 * El `type` no es decoración: las de sistema llegan con `name` igual a su
 * propia constante (`INBOX` se llama «INBOX»), así que traducirlas a castellano
 * es una decisión de presentación y vive en el frontend. Las de usuario son las
 * que traen un nombre que escribió una persona, y son las únicas que no se
 * pueden adivinar desde aquí.
 */
export interface GmailLabel {
  /** Lo que viene dentro de `Email.labels`. */
  id: string;
  name: string;
  type: "system" | "user";
}

export async function fetchGmailLabels(): Promise<GmailLabel[]> {
  return apiFetch<GmailLabel[]>("/gmail/labels");
}
