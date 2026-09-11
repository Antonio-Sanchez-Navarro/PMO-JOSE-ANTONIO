import { describe, expect, it } from "vitest";
import { sePuedeVerEnPantalla, verDescargables, type EmailAttachment } from "./api/emails.api";

function adjunto(over: Partial<EmailAttachment> = {}): EmailAttachment {
  return {
    attachmentId: "a1",
    filename: "Cotización.pdf",
    mimeType: "application/pdf",
    size: 1024,
    inline: false,
    ...over,
  };
}

describe("verDescargables", () => {
  /**
   * Los incrustados son el logo de la firma y las imágenes citadas. Vienen en la
   * respuesta porque son reales y descargables, no porque haya que enseñarlos:
   * un «logo.png» en cada correo hace que el clip deje de significar nada.
   */
  it("esconde los adjuntos incrustados", () => {
    const lista = [
      adjunto({ attachmentId: "a1", filename: "Contrato.pdf" }),
      adjunto({ attachmentId: "a2", filename: "logo.png", mimeType: "image/png", inline: true }),
    ];

    expect(verDescargables(lista).map((a) => a.filename)).toEqual(["Contrato.pdf"]);
  });

  it("no se rompe si el correo no trae la lista", () => {
    expect(verDescargables(undefined)).toEqual([]);
    expect(verDescargables([])).toEqual([]);
  });

  /** Un correo cuyos únicos archivos son la firma no tiene nada que ofrecer. */
  it("deja la lista vacía cuando todo es incrustado", () => {
    const soloFirma = [adjunto({ mimeType: "image/png", inline: true })];
    expect(verDescargables(soloFirma)).toEqual([]);
  });
});

describe("sePuedeVerEnPantalla", () => {
  it("enseña PDF e imágenes", () => {
    expect(sePuedeVerEnPantalla("application/pdf")).toBe(true);
    expect(sePuedeVerEnPantalla("image/png")).toBe(true);
    expect(sePuedeVerEnPantalla("image/jpeg")).toBe(true);
  });

  /**
   * Lo demás se descarga, y no es una limitación que convenga saltarse: un
   * adjunto HTML abierto en línea correría en **nuestro** origen, con la cookie
   * de sesión al alcance. El backend además lo sirve como `attachment`.
   */
  it("no enseña nada más, y el HTML es el motivo", () => {
    expect(sePuedeVerEnPantalla("text/html")).toBe(false);
    expect(sePuedeVerEnPantalla("application/octet-stream")).toBe(false);
    expect(sePuedeVerEnPantalla("application/vnd.ms-excel")).toBe(false);
    expect(sePuedeVerEnPantalla("text/plain")).toBe(false);
  });
});
