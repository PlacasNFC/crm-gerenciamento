import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { brl } from "@/lib/constants";
import { ORIGENS } from "@/lib/fiscal";
import { ActionForm } from "@/components/ActionForm";
import { Cabecalho, Campo, Vazio } from "@/components/ui";
import { excluirProduto, lancarEstoque, salvarProduto } from "../actions";

export const dynamic = "force-dynamic";

type Produto = {
  id: number; sku: string; nome: string; gtin: string | null; ncm: string | null; cest: string | null; unidade: string;
  origem: number; producao_propria: boolean; preco_venda: string; custo: string; estoque_minimo: string; ativo: boolean;
};
type Mov = { id: number; data: Date; quantidade: string; motivo: string; venda_id: number | null; observacao: string | null };

export default async function ProdutoForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let p: Produto | undefined;
  let movs: Mov[] = [];
  let saldo = 0;
  if (id !== "novo") {
    if (!/^\d+$/.test(id)) notFound();
    [p] = (await sql`SELECT * FROM produtos WHERE id = ${Number(id)}`) as Produto[];
    if (!p) notFound();
    movs = (await sql`SELECT * FROM estoque_movs WHERE produto_id = ${p.id} ORDER BY data DESC, id DESC LIMIT 100`) as Mov[];
    [{ saldo }] = (await sql`SELECT COALESCE(SUM(quantidade), 0)::float AS saldo FROM estoque_movs WHERE produto_id = ${p.id}`) as { saldo: number }[];
  }

  return (
    <>
      <Link href="/produtos" className="btn-link">← Produtos</Link>
      <Cabecalho titulo={p ? p.nome : "Novo produto"} sub={p ? `Código ${p.sku}` : undefined} />
      <ActionForm action={salvarProduto} className="space-y-5">
        <input type="hidden" name="id" value={p?.id ?? ""} />
        <section className="card">
          <h2 className="secao">Dados básicos</h2>
          <div className="grid-form">
            <Campo label="Código (SKU) *"><input name="sku" defaultValue={p?.sku} required /></Campo>
            <Campo label="Descrição *" className="sm:col-span-2 lg:col-span-3"><input name="nome" defaultValue={p?.nome} required /></Campo>
            <Campo label="Unidade"><input name="unidade" defaultValue={p?.unidade ?? "UN"} maxLength={6} /></Campo>
            <Campo label="GTIN/EAN"><input name="gtin" inputMode="numeric" defaultValue={p?.gtin ?? ""} placeholder="vazio = SEM GTIN" /></Campo>
            <Campo label="Preço de venda (R$)"><input type="number" step="0.01" min={0} name="preco_venda" defaultValue={p?.preco_venda ?? "0"} /></Campo>
            <Campo label="Custo (R$)"><input type="number" step="0.01" min={0} name="custo" defaultValue={p?.custo ?? "0"} /></Campo>
          </div>
        </section>
        <section className="card">
          <h2 className="secao">Fiscal</h2>
          <div className="grid-form">
            <Campo label="NCM"><input name="ncm" inputMode="numeric" defaultValue={p?.ncm ?? ""} placeholder="8 dígitos" /></Campo>
            <Campo label="CEST"><input name="cest" inputMode="numeric" defaultValue={p?.cest ?? ""} placeholder="se houver ST" /></Campo>
            <Campo label="Origem" className="sm:col-span-2">
              <select name="origem" defaultValue={p?.origem ?? 0}>
                {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <input type="checkbox" name="producao_propria" defaultChecked={p?.producao_propria ?? false} />
              Produção própria (fabrico/personalizo) — muda o CFOP sugerido de 5102/6108 para 5101/6107
            </label>
          </div>
        </section>
        <section className="card">
          <h2 className="secao">Estoque</h2>
          <div className="grid-form">
            <Campo label="Estoque mínimo"><input type="number" step="any" min={0} name="estoque_minimo" defaultValue={p ? Number(p.estoque_minimo) : 0} /></Campo>
            {!p && <Campo label="Estoque inicial"><input type="number" step="any" min={0} name="estoque_inicial" defaultValue="0" /></Campo>}
            {p && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Produto ativo
              </label>
            )}
          </div>
        </section>
        <div className="flex justify-end"><button className="btn">Salvar produto</button></div>
      </ActionForm>

      {p && (
        <>
          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="secao mb-0">Movimentação de estoque</h2>
              <p className="text-sm">Saldo atual: <b>{saldo.toLocaleString("pt-BR")} {p.unidade}</b> · valor em custo {brl(saldo * Number(p.custo))}</p>
            </div>
            <ActionForm action={lancarEstoque} resetOnSuccess className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr_auto] items-end mb-4">
              <input type="hidden" name="id" value={p.id} />
              <Campo label="Lançamento">
                <select name="tipo" defaultValue="entrada">
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="balanco">Balanço (contagem)</option>
                </select>
              </Campo>
              <Campo label="Quantidade"><input type="number" step="any" min={0} name="quantidade" required /></Campo>
              <Campo label="Observação"><input name="observacao" placeholder="Ex.: compra fornecedor X, perda, contagem" /></Campo>
              <button className="btn">Lançar</button>
            </ActionForm>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Data</th><th>Motivo</th><th>Observação</th><th className="num">Qtd.</th></tr></thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{new Date(m.data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                      <td>{m.venda_id ? <Link href={`/vendas/${m.venda_id}`} className="text-accent hover:underline">{m.motivo}</Link> : m.motivo}</td>
                      <td>{m.observacao ?? ""}</td>
                      <td className={`num ${Number(m.quantidade) < 0 ? "text-neg" : "text-pos"}`}>
                        {Number(m.quantidade) > 0 ? "+" : ""}{Number(m.quantidade).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                  {movs.length === 0 && <Vazio colunas={4}>Sem movimentações.</Vazio>}
                </tbody>
              </table>
            </div>
          </section>
          <ActionForm action={excluirProduto} confirmar="Excluir este produto e todo o histórico de estoque dele?">
            <input type="hidden" name="id" value={p.id} />
            <button className="btn-perigo">Excluir produto</button>
          </ActionForm>
        </>
      )}
    </>
  );
}
