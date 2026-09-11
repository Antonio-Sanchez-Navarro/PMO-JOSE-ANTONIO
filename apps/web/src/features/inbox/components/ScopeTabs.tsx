import { BANCOS, EMPRESAS } from "@pmo/shared";

/**
 * Por qué lado está cortada la bandeja.
 *
 * `general` no es «sin clasificar»: es **toda** la bandeja, sin filtro. Un
 * correo con `bank: null` no es un correo pendiente de clasificar — es uno que
 * no menciona ninguno de los que nos importan, que es el caso mayoritario.
 */
export type Ambito =
  | { tipo: "general" }
  | { tipo: "empresa"; valor: string }
  | { tipo: "banco"; valor: string };

export function mismoAmbito(a: Ambito, b: Ambito): boolean {
  if (a.tipo !== b.tipo) return false;
  return a.tipo === "general" || a.valor === (b as { valor: string }).valor;
}

/**
 * Las pestañas de empresa y banco.
 *
 * **Las listas salen de `@pmo/shared`, no de aquí.** Son las mismas constantes
 * que usan el extractor y la validación del backend: el día que se añada un
 * banco aparece su pestaña sola, y una copia local habría sido justo lo que
 * impide que eso pase.
 *
 * «Bancos» abre una segunda fila con uno por banco porque el filtro del
 * servidor es `?bank=<uno>` y no existe un «cualquier banco»: una pestaña que
 * prometiera todos y enseñara uno mentiría, así que se enseña cuál está puesto.
 */
export function ScopeTabs({
  ambito,
  onChange,
}: {
  ambito: Ambito;
  onChange: (ambito: Ambito) => void;
}) {
  const pestañas: { clave: string; etiqueta: string; ambito: Ambito }[] = [
    { clave: "general", etiqueta: "General", ambito: { tipo: "general" } },
    // «Bancos» entra al primer banco de la lista, y la fila de abajo dice cuál.
    { clave: "bancos", etiqueta: "Bancos", ambito: { tipo: "banco", valor: BANCOS[0] } },
    ...EMPRESAS.map((empresa) => ({
      clave: `empresa:${empresa}`,
      etiqueta: empresa,
      ambito: { tipo: "empresa" as const, valor: empresa },
    })),
  ];

  const activa = (candidata: Ambito) =>
    candidata.tipo === "banco" ? ambito.tipo === "banco" : mismoAmbito(candidata, ambito);

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-6 py-2.5">
        <span className="mr-1 text-xs uppercase tracking-wide text-slate-400">Ámbito</span>
        {pestañas.map((pestaña) => (
          <button
            key={pestaña.clave}
            onClick={() => onChange(pestaña.ambito)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activa(pestaña.ambito)
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {pestaña.etiqueta}
          </button>
        ))}
      </div>

      {ambito.tipo === "banco" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-6 py-2.5">
          <span className="mr-1 text-xs uppercase tracking-wide text-slate-400">Banco</span>
          {BANCOS.map((banco) => (
            <button
              key={banco}
              onClick={() => onChange({ tipo: "banco", valor: banco })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                ambito.valor === banco
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {banco}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
