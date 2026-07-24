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
