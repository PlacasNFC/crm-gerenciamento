"use client";

import { useState } from "react";
import { CANAIS, STATUS_ENTREGA, brl, dataISO, hoje, pct, r2, type Canal } from "@/lib/constants";
import { taxaEstimada, type CanalConfig, type ItemVenda, type ProdutoOpcao } from "@/lib/itens";

export type Venda = {
  id: number;
  data: string | Date;
  canal: string;
  pedido_externo: string | null;
  cliente: string | null;
  produto: string;
  quantidade: number;
  valor_bruto: string;
  taxa_plataforma: string;
  frete: string;
  reembolso_frete: string;
  frete_pendente: boolean;
  custo_produto: string;
  status_entrega: string;
  codigo_rastreio: string | null;
  observacoes: string | null;
};

// Campos numéricos como texto para permitir digitação livre; null = valor automático.
type Linha = {
  key: number;
  texto: string;
  produto_id: number | null;
  anuncio_id: string | null;
  variacao_id: string;
  quantidade: string;
  valor: string | null;
  custo: string;
  custo_manual: boolean;
};

const rotulo = (p: ProdutoOpcao) => (p.sku ? `${p.nome} (${p.sku})` : p.nome);
const n = (v: string | null | undefined) => Number(String(v ?? "").replace(",", ".")) || 0;
let seq = 0;

function linhaVazia(): Linha {
  return { key: ++seq, texto: "", produto_id: null, anuncio_id: null, variacao_id: "", quantidade: "1", valor: null, custo: "0", custo_manual: false };
}

export function VendaForm({
  action,
  venda,
  itens,
  produtos,
  canais,
  submitLabel = "Salvar venda",
}: {
  action: (f: FormData) => Promise<void>;
  venda?: Venda;
  itens?: ItemVenda[];
  produtos: ProdutoOpcao[];
  canais: Record<Canal, CanalConfig>;
  submitLabel?: string;
}) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const [canal, setCanal] = useState<Canal>((venda?.canal as Canal) ?? "mercado_livre");
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    if (itens?.length)
      return itens.map((i) => ({
        key: ++seq,
        texto: i.produto_id && porId.get(i.produto_id) ? rotulo(porId.get(i.produto_id)!) : i.descricao,
        produto_id: i.produto_id,
        anuncio_id: i.anuncio_id,
        variacao_id: i.variacao_id,
        quantidade: String(i.quantidade),
        valor: String(i.valor),
        custo: String(i.custo_unitario),
        custo_manual: i.custo_manual,
      }));
    // venda antiga, sem itens: vira um item avulso com o custo que já tinha
    if (venda)
      return [{
        ...linhaVazia(),
        texto: venda.produto,
        quantidade: String(venda.quantidade),
        valor: venda.valor_bruto,
        custo: String(r2(n(venda.custo_produto) / Math.max(1, venda.quantidade))),
        custo_manual: true,
      }];
    return [linhaVazia()];
  });
  // venda existente mantém taxa e frete gravados; nova usa a estimativa do canal até você editar
  const [taxa, setTaxa] = useState<string | null>(venda ? venda.taxa_plataforma : null);
  const [frete, setFrete] = useState<string | null>(venda ? venda.frete : null);
  const [reembolso, setReembolso] = useState(venda?.reembolso_frete ?? "0");

  const valorAuto = (l: Linha) => {
    const preco = l.produto_id ? porId.get(l.produto_id)?.precos[canal] : undefined;
    return preco === undefined ? null : r2(preco * n(l.quantidade));
  };
  const valorDe = (l: Linha) => (l.valor !== null ? n(l.valor) : (valorAuto(l) ?? 0));

  const validas = linhas.filter((l) => l.texto.trim());
  const total = r2(validas.reduce((a, l) => a + valorDe(l), 0));
  const unidades = validas.reduce((a, l) => a + Math.max(1, Math.round(n(l.quantidade))), 0);
  const custoTotal = r2(validas.reduce((a, l) => a + n(l.custo) * Math.max(1, Math.round(n(l.quantidade))), 0));
  const taxaAuto = taxaEstimada(canais[canal], total, unidades);
  const freteAuto = canais[canal].frete_estimado;
  const taxaV = taxa !== null ? n(taxa) : taxaAuto;
  const freteV = frete !== null ? n(frete) : freteAuto;
  const lucro = r2(total - taxaV - (freteV - n(reembolso)) - custoTotal);

  const mudar = (key: number, m: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...m } : l)));

  function escolher(l: Linha, texto: string) {
    const p = produtos.find((x) => rotulo(x) === texto);
    if (!p) return mudar(l.key, { texto, produto_id: null });
    mudar(l.key, { texto, produto_id: p.id, ...(l.custo_manual ? {} : { custo: String(p.custo) }), valor: null });
  }

  const json = JSON.stringify(
    validas.map((l) => {
      const p = l.produto_id ? porId.get(l.produto_id) : undefined;
      return {
        produto_id: l.produto_id,
        anuncio_id: l.anuncio_id,
        variacao_id: l.variacao_id,
        descricao: p && rotulo(p) === l.texto ? p.nome : l.texto.trim(),
        quantidade: Math.max(1, Math.round(n(l.quantidade))),
        valor: valorDe(l),
        custo_unitario: n(l.custo),
        custo_manual: l.custo_manual,
      };
    }),
  );

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="itens" value={json} />
      <label className="field">
        <span>Data</span>
        <input type="date" name="data" defaultValue={venda ? dataISO(venda.data) : hoje()} required />
      </label>
      <label className="field">
        <span>Canal</span>
        <select name="canal" value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
          {Object.entries(CANAIS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Nº do pedido</span>
        <input name="pedido_externo" defaultValue={venda?.pedido_externo ?? undefined} />
      </label>
      <label className="field">
        <span>Cliente</span>
        <input name="cliente" defaultValue={venda?.cliente ?? undefined} />
      </label>

      <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-border p-3 space-y-2">
        <datalist id="produtos-venda">
          {produtos.map((p) => <option key={p.id} value={rotulo(p)} />)}
        </datalist>
        {linhas.map((l, idx) => {
          const p = l.produto_id ? porId.get(l.produto_id) : undefined;
          const auto = valorAuto(l);
          return (
            <div key={l.key} className="grid gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_9rem_auto] items-end">
              <label className="field col-span-2 sm:col-span-1">
                <span>{idx === 0 ? "Produto" : `Produto ${idx + 1}`}</span>
                <input
                  list="produtos-venda"
                  value={l.texto}
                  placeholder="Busque um produto ou digite um item avulso"
                  onChange={(e) => escolher(l, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                  required={idx === 0}
                />
                {l.texto && !p && <small className="text-xs text-muted">Item avulso: informe valor e custo à mão.</small>}
              </label>
              <label className="field">
                <span>Qtd.</span>
                <input type="number" min={1} value={l.quantidade} onChange={(e) => mudar(l.key, { quantidade: e.target.value })} />
              </label>
              <label className="field">
                <span>Valor (R$)</span>
                <input
                  type="number" step="0.01" min={0}
                  value={l.valor ?? (auto !== null ? auto.toFixed(2) : "")}
                  onChange={(e) => mudar(l.key, { valor: e.target.value === "" ? null : e.target.value })}
                />
              </label>
              <label className="field">
                <span className="flex items-center gap-1">
                  Custo unit. (R$)
                  {l.custo_manual && p && (
                    <button
                      type="button"
                      title="Voltar ao custo do cadastro"
                      className="text-accent cursor-pointer"
                      onClick={() => mudar(l.key, { custo: String(p.custo), custo_manual: false })}
                    >
                      ↺
                    </button>
                  )}
                </span>
                <input
                  type="number" step="0.0001" min={0}
                  value={l.custo}
                  title={l.custo_manual ? "Custo ajustado à mão" : "Custo do cadastro"}
                  className={l.custo_manual ? "border-amber-400" : ""}
                  onChange={(e) => mudar(l.key, { custo: e.target.value, custo_manual: true })}
                />
              </label>
              <button
                type="button"
                className="btn-ghost h-[38px]"
                disabled={linhas.length === 1}
                title="Remover item"
                onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
              >
                ×
              </button>
            </div>
          );
        })}
        <button type="button" className="btn-ghost" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>+ item</button>
      </div>

      <div className="field">
        <span>Valor da venda</span>
        <p className="py-2 text-sm font-medium">{brl(total)}</p>
      </div>
      <label className="field">
        <span>Taxa da plataforma (R$)</span>
        <input type="number" step="0.01" min={0} name="taxa_plataforma"
          value={taxa ?? taxaAuto.toFixed(2)} onChange={(e) => setTaxa(e.target.value)} />
      </label>
      <label className="field">
        <span>Frete pago por você (R$)</span>
        <input type="number" step="0.01" min={0} name="frete"
          value={frete ?? freteAuto.toFixed(2)} onChange={(e) => setFrete(e.target.value)} />
        {venda?.frete_pendente && <small className="text-xs text-amber-800 dark:text-amber-300">Frete não obtido do ML: confira.</small>}
      </label>
      <label className="field">
        <span>Reembolso de frete (R$)</span>
        <input type="number" step="0.01" min={0} name="reembolso_frete" value={reembolso} onChange={(e) => setReembolso(e.target.value)} />
      </label>
      <label className="field">
        <span>Status da entrega</span>
        <select name="status_entrega" defaultValue={venda?.status_entrega ?? "a_enviar"}>
          {Object.entries(STATUS_ENTREGA).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Código de rastreio</span>
        <input name="codigo_rastreio" defaultValue={venda?.codigo_rastreio ?? undefined} />
      </label>
      <label className="field sm:col-span-2">
        <span>Observações</span>
        <input name="observacoes" defaultValue={venda?.observacoes ?? undefined} />
      </label>
      <div className="sm:col-span-2 lg:col-span-3 flex items-end text-sm text-muted">
        <p>
          Custo {brl(custoTotal)} · lucro previsto{" "}
          <b className={lucro < 0 ? "text-neg" : "text-pos"}>{brl(lucro)}</b> ({pct(lucro, total)} do valor)
        </p>
      </div>
      <div className="flex items-end">
        <button className="btn w-full">{submitLabel}</button>
      </div>
    </form>
  );
}
