import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEmailSelection } from "./useEmailSelection";
import type { EmailSnippet, EmailThread } from "./types";

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

function hilo(threadId: string, mensajes: EmailSnippet[]): EmailThread {
  return { threadId, messages: mensajes, latest: mensajes[0] };
}

describe("useEmailSelection", () => {
  it("selecciona y deselecciona correos sueltos", () => {
    const emails = [correo("a", "t1"), correo("b", "t1")];
    const { result } = renderHook(() => useEmailSelection(emails));

    act(() => result.current.alternar(["a"], true));
    expect(result.current.total).toBe(1);
    expect(result.current.estaSeleccionado("a")).toBe(true);
    expect(result.current.estaSeleccionado("b")).toBe(false);

    act(() => result.current.alternar(["a"], false));
    expect(result.current.total).toBe(0);
  });

  it("marca un hilo como parcial cuando solo van algunos de sus mensajes", () => {
    const a = correo("a", "t1");
    const b = correo("b", "t1");
    const { result } = renderHook(() => useEmailSelection([a, b]));
    const t1 = hilo("t1", [a, b]);

    expect(result.current.estadoDelHilo(t1)).toBe("vacio");

    act(() => result.current.alternar(["a"], true));
    expect(result.current.estadoDelHilo(t1)).toBe("parcial");

    act(() => result.current.alternar(["b"], true));
    expect(result.current.estadoDelHilo(t1)).toBe("lleno");
  });

  /**
   * La regla que sostiene la honestidad de la barra: lo que se cuenta es lo que
   * se puede ver. Sin esto, cambiar de pestaña dejaría la selección anterior
   * viva y el botón ofrecería descartar correos que ya no están en pantalla.
   */
  it("poda de la selección los correos que dejan de estar cargados", () => {
    const a = correo("a", "t1");
    const b = correo("b", "t2");
    const { result, rerender } = renderHook(({ emails }) => useEmailSelection(emails), {
      initialProps: { emails: [a, b] },
    });

    act(() => result.current.alternar(["a", "b"], true));
    expect(result.current.total).toBe(2);

    // La lista se recarga y "b" ya no viene (otra pestaña, otro filtro).
    rerender({ emails: [a] });

    expect(result.current.total).toBe(1);
    expect(result.current.seleccionados).toEqual(["a"]);
  });

  it("reemplazar cambia la selección entera, no la suma", () => {
    const emails = [correo("a", "t1"), correo("b", "t2"), correo("c", "t3")];
    const { result } = renderHook(() => useEmailSelection(emails));

    act(() => result.current.alternar(["a"], true));
    act(() => result.current.reemplazar(["b", "c"]));

    expect(result.current.seleccionados.sort()).toEqual(["b", "c"]);
  });

  it("limpiar deja la selección vacía", () => {
    const emails = [correo("a", "t1"), correo("b", "t1")];
    const { result } = renderHook(() => useEmailSelection(emails));

    act(() => result.current.reemplazar(["a", "b"]));
    act(() => result.current.limpiar());

    expect(result.current.total).toBe(0);
  });
});
