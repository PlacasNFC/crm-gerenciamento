"use client";

import { useState } from "react";

export type Dia = { dia: string; pedidos: number; unidades: number; pecas: number; bruto: number; taxas: number; frete: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlCurto = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const rotulo = (d: string) => {
  const dt = new Date(d + "T12:00:00");
  return `${DIAS_SEMANA[dt.getDay()]} ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
};

const METRICAS = {
  bruto: "Faturamento",
  liquido: "Líquido",
  pedidos: "Pedidos",
  pecas: "Peças",
} as const;
type Metrica = keyof typeof METRICAS;

// Escala "redonda" para o eixo Y (1, 2, 2.5, 5 × 10^n).
function teto(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

export function GraficoDiario({ dias }: { dias: Dia[] }) {
  const [metrica, setMetrica] = useState<Metrica>("bruto");
  const [foco, setFoco] = useState<number | null>(null);

  const valor = (d: Dia) =>
    metrica === "pedidos" ? d.pedidos : metrica === "pecas" ? d.pecas : metrica === "liquido" ? d.bruto - d.taxas - d.frete : d.bruto;
  const contagem = metrica === "pedidos" || metrica === "pecas";
  const max = teto(Math.max(...dias.map(valor), 0));
  const fmt = contagem ? (v: number) => String(Math.round(v)) : brlCurto;
  const passo = Math.ceil(dias.length / 10); // no máximo ~10 rótulos no eixo X
  const d = foco != null ? dias[foco] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="tabs" role="tablist">
          {(Object.keys(METRICAS) as Metrica[]).map((m) => (
            <button key={m} type="button" data-ativo={metrica === m} onClick={() => setMetrica(m)}>
              {METRICAS[m]}
            </button>
          ))}
        </div>
        <div className="min-h-10 text-right text-xs text-muted">
          {d ? (
            <>
              <p className="font-medium text-fg">{rotulo(d.dia)}</p>
              <p>
                {d.pedidos} pedido{d.pedidos === 1 ? "" : "s"} · {d.pecas} peça{d.pecas === 1 ? "" : "s"} · {brl(d.bruto)} bruto · {brl(d.bruto - d.taxas - d.frete)} líquido
              </p>
            </>
          ) : (
            <p className="pt-3">Passe o mouse (ou toque) numa barra para ver o dia</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {/* eixo Y */}
        <div className="flex h-56 flex-col justify-between pb-0 text-right text-[11px] text-muted tabular-nums">
          {[1, 0.75, 0.5, 0.25, 0].map((f) => (
            <span key={f} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0 leading-none">
              {fmt(max * f)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56">
            {[0, 0.25, 0.5, 0.75].map((f) => (
              <div key={f} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${f * 100}%` }} />
            ))}
            <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          </div>

          <div className="relative flex h-56 items-end gap-[2px]" onMouseLeave={() => setFoco(null)}>
            {dias.map((dia, i) => {
              const v = valor(dia);
              const liquido = Math.max(0, dia.bruto - dia.taxas - dia.frete);
              const ativo = foco === i;
              return (
                <button
                  key={dia.dia}
                  type="button"
                  className="group relative flex h-full flex-1 cursor-pointer items-end justify-center"
                  onMouseEnter={() => setFoco(i)}
                  onFocus={() => setFoco(i)}
                  onClick={() => setFoco(i)}
                  aria-label={`${rotulo(dia.dia)}: ${contagem ? v : brl(v)}`}
                >
                  <span className={`absolute inset-0 rounded-sm ${ativo ? "bg-accent/5" : ""}`} />
                  {metrica === "bruto" ? (
                    <span className="relative flex w-full max-w-7 flex-col justify-end overflow-hidden rounded-t-[3px]" style={{ height: `${(v / max) * 100}%` }}>
                      <span className="w-full bg-accent/30" style={{ height: dia.bruto ? `${((dia.bruto - liquido) / dia.bruto) * 100}%` : 0 }} />
                      <span className={`w-full flex-1 ${ativo ? "bg-accent" : "bg-accent/85"}`} />
                    </span>
                  ) : (
                    <span
                      className={`relative w-full max-w-7 rounded-t-[3px] ${ativo ? "bg-accent" : "bg-accent/85"}`}
                      style={{ height: `${(Math.max(0, v) / max) * 100}%` }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* eixo X */}
          <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted">
            {dias.map((dia, i) => (
              <span key={dia.dia} className="flex-1 overflow-visible whitespace-nowrap text-center">
                {i % passo === 0 ? dia.dia.slice(8, 10) + "/" + dia.dia.slice(5, 7) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {metrica === "bruto" && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent/85" /> Líquido (fica com você)</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent/30" /> Tarifas e frete do ML</span>
        </div>
      )}
    </div>
  );
}

// Barras horizontais simples (ex.: média por dia da semana).
export function BarrasHorizontais({
  itens,
  formato = "brl",
  larguraRotulo = "2.5rem",
}: {
  itens: { rotulo: string; valor: number; sub?: string }[];
  formato?: "brl" | "num";
  larguraRotulo?: string;
}) {
  const max = Math.max(...itens.map((i) => i.valor), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.rotulo} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: `${larguraRotulo} 1fr auto` }}>
          <span className="text-muted">{i.rotulo}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(i.valor / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-xs">
            {formato === "brl" ? brl(i.valor) : i.valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            {i.sub && <span className="text-muted"> · {i.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
