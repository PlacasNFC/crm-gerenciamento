"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { CANAIS, STATUS_ENTREGA, brl } from "@/lib/constants";
import type { Resultado } from "@/lib/form";

export type ProdutoOpcao = { id: number; sku: string; nome: string; preco_venda: string };
export type ClienteOpcao = { id: number; nome: string };
export type VendaEdit = {
  id: number; data: string; canal: string; pedido_externo: string | null; cliente_id: number | null;
  taxa_plataforma: string; frete: string; custo_produto: string; status_entrega: string;
  codigo_rastreio: string | null; observacoes: string | null;
};
type Linha = { chave: number; produto_id: string; descricao: string; quantidade: string; valor_unitario: string };

let seq = 0;
const novaLinha = (p?: Partial<Linha>): Linha => ({ chave: ++seq, produto_id: "", descricao: "", quantidade: "1", valor_unitario: "", ...p });

export function VendaForm({ action, produtos, clientes, venda, itens, hoje }: {
  action: (prev: Resultado, f: FormData) => Promise<Resultado>;
  produtos: ProdutoOpcao[];
  clientes: ClienteOpcao[];
  venda?: VendaEdit;
  itens?: { produto_id: number | null; descricao: string; quantidade: string; valor_unitario: string }[];
  hoje: string;
}) {
  const [res, run, pending] = useActionState(action, null);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    itens?.length
      ? itens.map((i) => novaLinha({ produto_id: i.produto_id ? String(i.produto_id) : "", descricao: i.descricao, quantidade: String(Number(i.quantidade)), valor_unitario: i.valor_unitario }))
      : [novaLinha()],
  );
  const [taxa, setTaxa] = useState(venda?.taxa_plataforma ?? "0");
  const [frete, setFrete] = useState(venda?.frete ?? "0");
  const porId = useMemo(() => new Map(produtos.map((p) => [String(p.id), p])), [produtos]);

  const total = linhas.reduce((a, l) => a + (Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0), 0);
  const liquido = total - (Number(taxa) || 0) - (Number(frete) || 0);
  const muda = (chave: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...patch } : l)));

  const escolherProduto = (l: Linha, id: string) => {
    const p = porId.get(id);
    muda(l.chave, p ? { produto_id: id, descricao: p.nome, valor_unitario: l.valor_unitario || p.preco_venda } : { produto_id: "" });
  };

  const payload = JSON.stringify(
    linhas.map((l) => ({ produto_id: l.produto_id ? Number(l.produto_id) : null, descricao: l.descricao, quantidade: Number(l.quantidade), valor_unitario: Number(l.valor_unitario || 0) })),
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const dados = new FormData(e.currentTarget);
        startTransition(() => run(dados));
      }}
    >
      <input type="hidden" name="id" value={venda?.id ?? ""} />
      <input type="hidden" name="itens" value={payload} />
      <fieldset disabled={pending} className="space-y-5">
        <section className="card">
          <h2 className="secao">Pedido</h2>
          <div className="grid-form">
            <label className="field"><span>Data *</span><input type="date" name="data" defaultValue={venda?.data ?? hoje} required /></label>
            <label className="field"><span>Canal</span>
              <select name="canal" defaultValue={venda?.canal ?? "mercado_livre"}>
                {Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field"><span>Nº do pedido no canal</span><input name="pedido_externo" defaultValue={venda?.pedido_externo ?? ""} /></label>
            <label className="field"><span>Cliente <Link href={`/clientes/novo?voltar=${venda ? `/vendas/${venda.id}` : "/vendas/nova"}`} className="btn-link">+ novo</Link></span>
              <select name="cliente_id" defaultValue={venda?.cliente_id ?? ""}>
                <option value="">— sem cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="card">
          <h2 className="secao">Itens</h2>
          <div className="space-y-2">
            <div className="hidden md:grid md:grid-cols-[14rem_1fr_6rem_8rem_7rem_2rem] gap-2 text-xs text-muted">
              <span>Produto cadastrado</span><span>Descrição *</span><span>Qtd.</span><span>Valor unit. (R$)</span><span className="text-right">Total</span><span />
            </div>
            {linhas.map((l) => (
              <div key={l.chave} className="grid gap-2 md:grid-cols-[14rem_1fr_6rem_8rem_7rem_2rem] items-center border-b border-border pb-2 md:border-0 md:pb-0">
                <select value={l.produto_id} onChange={(e) => escolherProduto(l, e.target.value)} aria-label="Produto">
                  <option value="">— item avulso (sem estoque) —</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nome}</option>)}
                </select>
                <input value={l.descricao} onChange={(e) => muda(l.chave, { descricao: e.target.value })} placeholder="Descrição" aria-label="Descrição" required />
                <input type="number" min="0.001" step="any" value={l.quantidade} onChange={(e) => muda(l.chave, { quantidade: e.target.value })} aria-label="Quantidade" required />
                <input type="number" min="0" step="0.01" value={l.valor_unitario} onChange={(e) => muda(l.chave, { valor_unitario: e.target.value })} aria-label="Valor unitário" required />
                <span className="text-right text-sm tabular-nums">{brl((Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0))}</span>
                <button type="button" className="btn-perigo text-base" aria-label="Remover item"
                  onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.chave !== l.chave) : ls))}>×</button>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>+ Adicionar item</button>
          </div>
        </section>

        <section className="card">
          <h2 className="secao">Valores e entrega</h2>
          <div className="grid-form">
            <label className="field"><span>Taxa / comissão do canal (R$)</span>
              <input type="number" step="0.01" min={0} name="taxa_plataforma" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
            </label>
            <label className="field"><span>Frete pago por você (R$)</span>
              <input type="number" step="0.01" min={0} name="frete" value={frete} onChange={(e) => setFrete(e.target.value)} />
            </label>
            <label className="field"><span>Custo extra (R$)</span>
              <input type="number" step="0.01" min={0} name="custo_produto" defaultValue={venda?.custo_produto ?? "0"} />
            </label>
            <div className="text-sm self-end">
              <p>Total dos itens: <b>{brl(total)}</b></p>
              <p>Líquido a receber: <b className={liquido < 0 ? "text-neg" : ""}>{brl(liquido)}</b></p>
            </div>
            <label className="field"><span>Status da entrega</span>
              <select name="status_entrega" defaultValue={venda?.status_entrega ?? "a_enviar"}>
                {Object.entries(STATUS_ENTREGA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field"><span>Código de rastreio</span><input name="codigo_rastreio" defaultValue={venda?.codigo_rastreio ?? ""} /></label>
            <label className="field sm:col-span-2"><span>Observações</span><input name="observacoes" defaultValue={venda?.observacoes ?? ""} /></label>
          </div>
          <p className="text-xs text-muted mt-2">
            Custo extra: custo além do custo cadastrado dos produtos (ex.: brinde, embalagem especial). Venda cancelada ou devolvida devolve o estoque e remove a conta a receber em aberto.
          </p>
        </section>
      </fieldset>
      <div className="flex items-center justify-end gap-3">
        {res && !res.ok && <p className="msg-erro mt-0" role="alert">{res.erro}</p>}
        <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar pedido"}</button>
      </div>
    </form>
  );
}
