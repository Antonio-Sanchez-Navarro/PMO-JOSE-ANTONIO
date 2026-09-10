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
   * Cuántos de los cargados son no accionables, o **`null` si la API todavía no
   * manda `isActionable`**. No es lo mismo que cero, y la barra no los pinta
   * igual: un «0» ahí diría que el Jefe no tiene nada que limpiar, que es
   * justo lo contrario de lo que pasa.
   */
  noAccionables: number | null;
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

        {/* El atajo de los boletines. Deshabilitado —y diciendo por qué— cuando
            el campo no viaja: un botón que selecciona cero porque el dato no
            llega es peor que un botón apagado, porque se lee como "no hay". */}
        <button
          onClick={onSeleccionarNoAccionables}
          disabled={ocupado || noAccionables === null || noAccionables === 0}
          title={
            noAccionables === null
              ? "La API todavía no devuelve isActionable en el listado, así que no se puede distinguir un boletín de un correo sin analizar."
              : noAccionables === 0
                ? "Ninguno de los correos cargados está marcado como no accionable."
                : `Selecciona los ${noAccionables} correos que la IA marcó como no accionables.`
          }
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Solo no accionables
          {noAccionables !== null && noAccionables > 0 && ` (${noAccionables})`}
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
