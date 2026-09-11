/**
 * La barra flotante de selección múltiple.
 *
 * Aparece sola cuando hay algo seleccionado y se queda pegada al pie de la
 * bandeja. Dice **cuántos correos y cuántos hilos**, porque son dos números
 * distintos y el que importa para el descarte es el primero: el Jefe selecciona
 * conversaciones, pero lo que se mueve a `DISMISSED` son mensajes.
 */
export function BulkActionBar({
  correos,
  hilos,
  visibles,
  noAccionables,
  ocupado,
  progreso,
  onSeleccionarTodo,
  onSeleccionarNoAccionables,
  onLimpiar,
  onDescartar,
}: {
  correos: number;
  hilos: number;
  /** Correos cargados en pantalla. Es el techo de «seleccionar todo». */
  visibles: number;
  /**
   * Correos de los hilos que la IA despachó y declaró no accionables **enteros**.
   *
   * Sale de `allNonActionable`, nunca de `isActionable` de una fila: esa columna
   * nace en `false` y no distingue un boletín de un correo que nadie ha mirado.
   */
  noAccionables: number;
  ocupado: boolean;
  progreso: { hechos: number; total: number } | null;
  onSeleccionarTodo: () => void;
  onSeleccionarNoAccionables: () => void;
  onLimpiar: () => void;
  onDescartar: () => void;
}) {
  if (correos === 0) return null;

  const todoSeleccionado = correos >= visibles;

  return (
    <div
      role="region"
      aria-label="Acciones sobre la selección"
      className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-indigo-200 bg-indigo-50/95 px-6 py-3 backdrop-blur"
    >
      <span className="text-sm font-semibold text-indigo-900">
        {correos} {correos === 1 ? "correo" : "correos"}
        <span className="font-normal text-indigo-700">
          {" "}
          · {hilos} {hilos === 1 ? "conversación" : "conversaciones"}
        </span>
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={todoSeleccionado ? onLimpiar : onSeleccionarTodo}
          disabled={ocupado}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
        >
          {todoSeleccionado ? "Quitar selección" : `Seleccionar los ${visibles} cargados`}
        </button>

        {/* El atajo de los boletines: el quick-win de la fase. Solo entran hilos
            en los que la IA opinó sobre todos los mensajes y dijo que no. */}
        <button
          onClick={onSeleccionarNoAccionables}
          disabled={ocupado || noAccionables === 0}
          title={
            noAccionables === 0
              ? "Ninguna de las conversaciones cargadas es no accionable de principio a fin. Las que tienen correos sin analizar no entran aquí: puede haber trabajo dentro."
              : `Selecciona los ${noAccionables} correos de las conversaciones que la IA descartó enteras.`
          }
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Solo no accionables
          {noAccionables > 0 && ` (${noAccionables})`}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {progreso && (
          <span className="text-xs font-medium text-indigo-700" aria-live="polite">
            Descartando… {progreso.hechos}/{progreso.total}
          </span>
        )}
        <button
          onClick={onLimpiar}
          disabled={ocupado}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onDescartar}
          disabled={ocupado}
          className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:opacity-60"
        >
          {ocupado ? "Descartando…" : `Descartar ${correos}`}
        </button>
      </div>
    </div>
  );
}
