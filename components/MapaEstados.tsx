"use client";

import { useState } from "react";
import { ESTADOS, GRADE } from "@/lib/regioes";

export type PorUf = { uf: string; pedidos: number; bruto: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Mapa do Brasil em blocos: cada estado é um quadrado, mais escuro quanto mais vendeu.
export function MapaEstados({ dados }: { dados: PorUf[] }) {
  const [foco, setFoco] = useState<string | null>(null);
  const porUf = new Map(dados.map((d) => [d.uf, d]));
  const max = Math.max(...dados.map((d) => d.bruto), 0) || 1;
  const total = dados.reduce((a, d) => a + d.bruto, 0);
  const f = foco ? porUf.get(foco) : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid grid-cols-6 gap-1" onMouseLeave={() => setFoco(null)}>
        {Object.entries(GRADE).map(([uf, [c, r]]) => {
          const d = porUf.get(uf);
          const t = d ? d.bruto / max : 0;
          return (
            <button
              key={uf}
              type="button"
              style={{
                gridColumn: c + 1,
                gridRow: r + 1,
                background: d ? `color-mix(in srgb, var(--accent) ${Math.round(18 + t * 82)}%, var(--surface))` : undefined,
              }}
              className={`grid size-10 place-items-center rounded-md text-[11px] font-semibold sm:size-11 cursor-pointer ${
                d ? (t > 0.45 ? "text-white" : "text-fg") : "bg-surface-2 text-muted"
              } ${foco === uf ? "ring-2 ring-fg/60" : ""}`}
              onMouseEnter={() => setFoco(uf)}
              onFocus={() => setFoco(uf)}
              onClick={() => setFoco(uf)}
              title={`${ESTADOS[uf]}: ${d ? `${d.pedidos} pedidos · ${brl(d.bruto)}` : "sem vendas"}`}
            >
              {uf}
            </button>
          );
        })}
      </div>
      <p className="min-h-8 text-center text-xs text-muted">
        {foco ? (
          <>
            <b className="text-fg">{ESTADOS[foco]}</b>
            <br />
            {f ? `${f.pedidos} pedido${f.pedidos === 1 ? "" : "s"} · ${brl(f.bruto)} · ${((f.bruto / (total || 1)) * 100).toFixed(0)}% do total` : "sem vendas no período"}
          </>
        ) : (
          "Passe o mouse num estado"
        )}
      </p>
    </div>
  );
}
