import { useEffect, useRef } from "react";

/**
 * La confirmación antes de descartar en bloque.
 *
 * Existe por la asimetría: descartar 318 correos es un clic y devolverlos son
 * 318. La bandeja tiene botón de «A Pendientes» por correo, pero no hay
 * deshacer del lote, así que el freno se pone antes.
 */
export function ConfirmDismissDialog({
  abierto,
  correos,
  hilos,
  onCancelar,
  onConfirmar,
}: {
  abierto: boolean;
  correos: number;
  hilos: number;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);

  // El foco arranca en «Cancelar», no en la acción destructiva: un Enter de
  // inercia no debe descartar trescientos correos.
  useEffect(() => {
    if (abierto) cancelarRef.current?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-descarte-masivo"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 id="titulo-descarte-masivo" className="text-lg font-semibold text-slate-800">
          ¿Descartar {correos} {correos === 1 ? "correo" : "correos"}?
        </h3>

        <p className="mt-3 text-sm text-slate-600">
          Se moverán a <strong>Descartados</strong>, repartidos en {hilos}{" "}
          {hilos === 1 ? "conversación" : "conversaciones"}. Seguirán ahí para
          consultarlos, pero <strong>no hay deshacer del lote</strong>: para
          devolverlos habría que volver a abrir cada uno.
        </p>

        <p className="mt-2 text-xs text-slate-500">
          Las tareas que alguno de estos correos ya hubiera generado{" "}
          <strong>no se tocan</strong>: viven en el tablero por su cuenta.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelarRef}
            onClick={onCancelar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900"
          >
            Descartar {correos}
          </button>
        </div>
      </div>
    </div>
  );
}
