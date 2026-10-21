"use client";

import { useState } from "react";
import type { CanalCalc, Faixa } from "@/lib/calculadora";
import { parseNum } from "@/lib/form";
import { Icone } from "./Icone";

type FaixaTxt = Record<keyof Faixa, string>;

const txt = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const num = (s: string) => {
  const v = parseNum(s);
  return v == null || Number.isNaN(v) ? null : v;
};

// Canal com faixas de tarifa por preço (ex.: ML abaixo/acima de R$ 79). As faixas vão como JSON num campo oculto.
export function CanalForm({ canal, action }: { canal?: CanalCalc; action: (f: FormData) => Promise<void> }) {
  const [faixas, setFaixas] = useState<FaixaTxt[]>(() =>
    (canal?.faixas.length ? canal.faixas : [{ ate: null, pct: 0, fixo: 0, frete: 0 }]).map((f) => ({
      ate: txt(f.ate), pct: txt(f.pct), fixo: txt(f.fixo), frete: txt(f.frete),
    })),
  );
  const json = JSON.stringify(faixas.map((f) => ({ ate: num(f.ate), pct: num(f.pct) ?? 0, fixo: num(f.fixo) ?? 0, frete: num(f.frete) ?? 0 })));
  const mudar = (i: number, k: keyof Faixa, v: string) => setFaixas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="faixas" value={json} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="field min-w-48 flex-1">
          <span>Nome do canal</span>
          <input name="nome" defaultValue={canal?.nome} required maxLength={80} placeholder="Ex.: Shopee, Elo7, feira" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={canal?.ativo ?? true} className="size-4" /> Mostrar na calculadora
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl min-w-[34rem]">
          <thead>
            <tr>
              <th>Preço abaixo de (R$)</th>
              <th>Comissão (%)</th>
              <th>Tarifa fixa (R$)</th>
              <th>Frete pago por você (R$)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {faixas.map((f, i) => (
              <tr key={i}>
                <td>
                  <input value={f.ate} onChange={(e) => mudar(i, "ate", e.target.value)} inputMode="decimal" placeholder="sem limite" className="w-28" />
                </td>
                <td>
                  <input value={f.pct} onChange={(e) => mudar(i, "pct", e.target.value)} inputMode="decimal" className="w-20" />
                </td>
                <td>
                  <input value={f.fixo} onChange={(e) => mudar(i, "fixo", e.target.value)} inputMode="decimal" className="w-24" />
                </td>
                <td>
                  <input value={f.frete} onChange={(e) => mudar(i, "frete", e.target.value)} inputMode="decimal" className="w-24" />
                </td>
                <td className="text-right">
                  {faixas.length > 1 && (
                    <button type="button" className="btn-icon" onClick={() => setFaixas((fs) => fs.filter((_, j) => j !== i))} aria-label="Remover faixa">
                      <Icone nome="lixo" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn py-1.5">Salvar canal</button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setFaixas((fs) => [{ ate: "", pct: fs[0]?.pct ?? "", fixo: "", frete: "" }, ...fs])}
        >
          <Icone nome="mais" /> Faixa de preço
        </button>
        <span className="text-xs text-muted">A última faixa vale para qualquer preço acima das outras.</span>
      </div>
    </form>
  );
}
