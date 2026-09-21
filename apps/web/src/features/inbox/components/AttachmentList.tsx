import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fetchAttachment,
  sePuedeVerEnPantalla,
  verDescargables,
  type EmailAttachment,
} from "../api/emails.api";

/** Bytes a algo que se lee de un vistazo. */
function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoDe(mimeType: string): string {
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "🗜️";
  return "📄";
}

/**
 * Los adjuntos de un correo, con ver y descargar.
 *
 * **El contenido se le pide a Gmail al pulsar**, no está en nuestra base: por
 * eso cada archivo tiene su propio estado de carga y puede tardar.
 */
export function AttachmentList({
  emailId,
  attachments,
  hasAttachments,
}: {
  emailId: string;
  attachments: EmailAttachment[] | undefined;
  /** Lo que dice la fila. Es lo que permite distinguir «no hay» de «no tenemos». */
  hasAttachments: boolean;
}) {
  const descargables = verDescargables(attachments);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ url: string; adjunto: EmailAttachment } | null>(null);

  // Un `blob:` vivo retiene el archivo entero en memoria. Se sueltan todos al
  // desmontar, incluidos los de descargas que el usuario disparó y no cerró.
  const urlsVivas = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urlsVivas.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const traer = async (adjunto: EmailAttachment) => {
    setOcupado(adjunto.attachmentId);
    try {
      const { url } = await fetchAttachment(emailId, adjunto.attachmentId);
      urlsVivas.current.push(url);
      return url;
    } catch {
      // El contenido lo sirve Gmail en el momento: un fallo aquí suele ser suyo
      // o de la sesión, y en ninguno de los dos casos ayuda un mensaje genérico.
      toast.error(`No se pudo obtener «${adjunto.filename}». Vuelve a intentarlo.`);
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const descargar = async (adjunto: EmailAttachment) => {
    const url = await traer(adjunto);
    if (!url) return;
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = adjunto.filename;
    enlace.click();
  };

  const ver = async (adjunto: EmailAttachment) => {
    const url = await traer(adjunto);
    if (url) setVisor({ url, adjunto });
  };

  /**
   * El correo trae archivos pero no tenemos sus fichas: se ingirió antes de que
   * se guardaran y no hay relleno hacia atrás.
   *
   * Decir «sin adjuntos» aquí sería mentir, y es justo el caso de los correos
   * viejos de la bandeja — o sea, de casi todos los que quedan por despachar.
   */
  if (descargables.length === 0) {
    // Si tenemos fichas guardadas pero ninguna es descargable (todas son inline),
    // simplemente no enseñamos nada. El clip engañó en la lista, pero aquí no hay error.
    if (attachments && attachments.length > 0) return null;

    // Si dice que tiene adjuntos pero no hay fichas, ES un correo viejo.
    if (!hasAttachments) return null;
    return (
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span aria-hidden="true">📎</span>
        <p>
          <strong>Adjuntos no disponibles.</strong> Este correo trae archivos, pero se recibió
          antes de que empezáramos a guardar sus fichas, así que no se pueden listar ni
          descargar desde aquí. Siguen en el correo original de Gmail.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span aria-hidden="true">📎</span>
          {descargables.length} {descargables.length === 1 ? "adjunto" : "adjuntos"}
        </h3>

        <ul className="space-y-2">
          {descargables.map((adjunto) => {
            const cargando = ocupado === adjunto.attachmentId;
            const visible = sePuedeVerEnPantalla(adjunto.mimeType);

            return (
              <li
                key={adjunto.attachmentId}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
              >
                <span aria-hidden="true" className="text-lg">
                  {iconoDe(adjunto.mimeType)}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium text-slate-800"
                    title={adjunto.filename}
                  >
                    {adjunto.filename}
                  </p>
                  <p className="text-xs text-slate-500">{pesoLegible(adjunto.size)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Solo PDF e imágenes se enseñan. Todo lo demás se descarga, y
                      no es una limitación que convenga saltarse: un adjunto HTML
                      abierto en línea correría en nuestro origen, con la cookie
                      de sesión al alcance. */}
                  {visible && (
                    <button
                      onClick={() => void ver(adjunto)}
                      disabled={cargando}
                      className="rounded border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {cargando ? "Abriendo…" : "Ver"}
                    </button>
                  )}
                  <button
                    onClick={() => void descargar(adjunto)}
                    disabled={cargando}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    {cargando ? "Bajando…" : "Descargar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {visor && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/80 p-4 backdrop-blur-sm">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
            <p className="truncate text-sm font-medium text-white" title={visor.adjunto.filename}>
              {visor.adjunto.filename}
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => void descargar(visor.adjunto)}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
              >
                Descargar
              </button>
              <button
                onClick={() => setVisor(null)}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-white">
            {visor.adjunto.mimeType.startsWith("image/") ? (
              <img
                src={visor.url}
                alt={visor.adjunto.filename}
                className="mx-auto max-h-full max-w-full object-contain"
              />
            ) : (
              <iframe src={visor.url} title={visor.adjunto.filename} className="h-full w-full" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
