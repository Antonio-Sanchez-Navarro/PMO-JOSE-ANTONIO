import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEmailSelection } from "./useEmailSelection";
import type { EmailSnippet, InboxThread } from "./types";

function correo(id: string, threadId: string): EmailSnippet {
  return {
    id,
    threadId,
    snippet: "",
    from: "alguien@example.test",
    subject: `Asunto ${id}`,
    date: "2026-09-10T10:00:00.000Z",
    labels: [],
  };
}

function hilo(threadId: string, ids: string[], allNonActionable = false): InboxThread {
  return {
    threadId,
    messageCount: ids.length,
    emailIds: ids,
    latest: correo(ids[0], threadId),
    allNonActionable,
    proposedTaskCount: 0,
    hasAttachments: false,
  };
}

describe("useEmailSelection", () => {
  it("selecciona y deselecciona correos sueltos", () => {
    const hilos = [hilo("t1", ["a", "b"])];
    const { result } = renderHook(() => useEmailSelection(hilos));

    act(() => result.current.alternar(["a"], true));
    expect(result.current.total).toBe(1);
    expect(result.current.estaSeleccionado("a")).toBe(true);
    expect(result.current.estaSeleccionado("b")).toBe(false);

    act(() => result.current.alternar(["a"], false));
    expect(result.current.total).toBe(0);
  });

  it("marca el hilo como parcial cuando solo van algunos de sus correos", () => {
    const t1 = hilo("t1", ["a", "b"]);
    const { result } = renderHook(() => useEmailSelection([t1]));

    expect(result.current.estadoDelHilo(t1)).toBe("vacio");

    act(() => result.current.alternar(["a"], true));
    expect(result.current.estadoDelHilo(t1)).toBe("parcial");

    act(() => result.current.alternar(["b"], true));
    expect(result.current.estadoDelHilo(t1)).toBe("lleno");
  });

  /**
   * La casilla del hilo es lo que hace que despachar 401 conversaciones no
   * obligue a abrir 728 correos: marca todos sus ids de una vez, incluidos los
   * que la bandeja no pinta.
   */
  it("la casilla del hilo arrastra los correos que no se ven", () => {
    const t1 = hilo("t1", ["a", "b", "c"]);
    const { result } = renderHook(() => useEmailSelection([t1]));

    act(() => result.current.alternar(t1.emailIds, true));

    expect(result.current.total).toBe(3);
    expect(result.current.estadoDelHilo(t1)).toBe("lleno");
  });

  /**
   * La regla que sostiene la honestidad de la barra: lo que se cuenta es lo que
   * se puede ver. Sin esto, cambiar de pestaña dejaría viva la selección
   * anterior y el botón ofrecería descartar correos que ya no están en pantalla.
   */
  it("poda de la selección los correos que dejan de estar cargados", () => {
    const t1 = hilo("t1", ["a"]);
    const t2 = hilo("t2", ["b"]);
    const { result, rerender } = renderHook(({ hilos }) => useEmailSelection(hilos), {
      initialProps: { hilos: [t1, t2] },
    });

    act(() => result.current.alternar(["a", "b"], true));
    expect(result.current.total).toBe(2);

    // La lista se recarga y "t2" ya no viene (otra pestaña, otro filtro).
    rerender({ hilos: [t1] });

    expect(result.current.total).toBe(1);
    expect(result.current.seleccionados).toEqual(["a"]);
  });

  it("reemplazar cambia la selección entera, no la suma", () => {
    const hilos = [hilo("t1", ["a"]), hilo("t2", ["b"]), hilo("t3", ["c"])];
    const { result } = renderHook(() => useEmailSelection(hilos));

    act(() => result.current.alternar(["a"], true));
    act(() => result.current.reemplazar(["b", "c"]));

    expect(result.current.seleccionados.sort()).toEqual(["b", "c"]);
  });

  it("limpiar deja la selección vacía", () => {
    const hilos = [hilo("t1", ["a", "b"])];
    const { result } = renderHook(() => useEmailSelection(hilos));

    act(() => result.current.reemplazar(["a", "b"]));
    act(() => result.current.limpiar());

    expect(result.current.total).toBe(0);
  });
});
