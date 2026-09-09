/** Utilidades de presentación para la bandeja de entrada. */

export interface Sender {
  name: string;
  email: string;
}

/**
 * Separa la cabecera `From` en nombre y correo.
 * Acepta `Juan Perez <juan@example.com>`, `"Juan Perez" <juan@…>` y `juan@example.com`.
 */
export function parseSender(from: string): Sender {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    const email = match[2].trim();
    return { name: name || email.split("@")[0], email };
  }
  const email = from.trim();
  return { name: email.split("@")[0] || email, email };
}

/** Inicial para el avatar; cae a "?" si el remitente viene vacío o es un símbolo. */
export function initialOf(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase();
  return /[A-ZÁÉÍÓÚÑ0-9]/.test(letter) ? letter : "?";
}

const timeFormat = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const fullFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Fecha compacta al estilo de un cliente de correo:
 * hoy → hora, mismo año → "24 jul", más antiguo → "24 jul 2025".
 */
export function formatEmailDate(raw: string, now = new Date()): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) return timeFormat.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayFormat.format(date);
  return fullFormat.format(date);
}

/** Fecha completa para el `title` del elemento (tooltip nativo). */
export function formatFullDate(raw: string): string {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("es-MX");
}

// ─── Etiquetas de Gmail ──────────────────────────────────────────────────

/** Nombres legibles de las etiquetas de sistema que sí aportan información. */
const LABEL_NAMES: Record<string, string> = {
  IMPORTANT: "Importante",
  STARRED: "Destacado",
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promociones",
  CATEGORY_UPDATES: "Novedades",
  CATEGORY_FORUMS: "Foros",
};

/**
 * Etiquetas que no vale la pena pintar: `INBOX` la tienen todas y `UNREAD` se
 * representa con el estilo de la fila, no con una píldora.
 */
const HIDDEN_LABELS = new Set(["INBOX", "UNREAD"]);

/**
 * Un nombre sin una sola letra no es un nombre.
 *
 * Las etiquetas propias del usuario llegan como identificadores numéricos de
 * Gmail (`5704178821214641997`), y `LABEL_NAMES` solo cubre las del sistema. La
 * barra de filtros los pintaba tal cual, al lado de «Importante» y «Personal»:
 * una píldora que ocupa sitio, invita a pulsarla y no dice nada.
 */
const SIN_NADA_LEGIBLE = /^[^\p{L}]+$/u;

/**
 * Etiquetas mostrables de un correo, ya con nombre legible.
 *
 * `nombres` es el diccionario de `GET /gmail/labels` (ver `useGmailLabels`).
 * Se pasa y no se importa para que esta función siga siendo pura: es la que se
 * puede probar sin levantar nada.
 *
 * El orden de resolución tiene un porqué en cada escalón:
 *
 * 1. **`LABEL_NAMES` manda sobre el diccionario.** Gmail devuelve las de
 *    sistema con `name` igual a su constante —`IMPORTANT` se llama
 *    «IMPORTANT»—, así que llamarla «Importante» es cosa nuestra, no suya.
 * 2. **Las de usuario van con su nombre tal cual lo escribió su dueño.** Aquí
 *    no se «embellece»: `prettifyLabelId` pasa a minúsculas todo menos la
 *    primera letra, y convertiría «PMO Clientes» en «Pmo clientes».
 * 3. **Las de sistema sin traducción** (`SENT`, `DRAFT`…) sí se embellecen,
 *    que es lo que se hacía antes de tener el diccionario.
 * 4. **Lo que siga sin una sola letra, no se pinta.** Sigue siendo la última
 *    defensa: una etiqueta borrada en Gmail, o el diccionario aún cargando,
 *    dejarían el identificador crudo en pantalla —el hallazgo C8—.
 */
export function visibleLabels(
  labels: string[],
  nombres?: Record<string, { name: string; type: "system" | "user" }>,
): { id: string; name: string }[] {
  return labels
    .filter((id) => !HIDDEN_LABELS.has(id))
    .map((id) => {
      const conocida = nombres?.[id];
      // `resuelta` distingue «sé cómo se llama» de «me lo he inventado a
      // partir del id». Solo lo segundo hay que vigilarlo.
      if (LABEL_NAMES[id]) return { id, name: LABEL_NAMES[id], resuelta: true };
      if (conocida?.type === "user") return { id, name: conocida.name, resuelta: true };
      return { id, name: prettifyLabelId(conocida?.name ?? id), resuelta: Boolean(conocida) };
    })
    .filter(({ name, resuelta }) => resuelta || !SIN_NADA_LEGIBLE.test(name))
    .map(({ id, name }) => ({ id, name }));
}

/** Convierte ids de etiquetas de usuario (`Label_12`, `TRABAJO/CLIENTES`) en algo legible. */
function prettifyLabelId(id: string): string {
  const leaf = id.split("/").pop() ?? id;
  const cleaned = leaf.replace(/^Label_/i, "").replace(/[_-]+/g, " ").trim();
  if (!cleaned) return id;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function isUnread(labels: string[]): boolean {
  return labels.includes("UNREAD");
}
