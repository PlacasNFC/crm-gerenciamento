import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, brl, pct, r2, type Canal } from "@/lib/constants";
import { taxaEstimada } from "@/lib/itens";
import { configCanais } from "@/lib/produtos";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { Cabecalho } from "@/components/ui";
import { excluirProduto, removerDaComposicao, removerVinculo, salvarComposicao, salvarProduto, vincular } from "../actions";

export const dynamic = "force-dynamic";

type Produto = { id: number; nome: string; sku: string | null; custo_extra: string; ativo: boolean };
type Comp = { insumo_id: number; nome: string; unidade: string; quantidade: string; custo_unitario: string };

export default async function EditarProduto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vinculadas?: string }>;
}) {
  await ensureSchema();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const sp = await searchParams;

  const [prodR, compR, insumosR, precosR, vincR, canais] = await Promise.all([
    sql`SELECT * FROM produtos WHERE id = ${id}`,
    sql`SELECT pi.insumo_id, i.nome, i.unidade, pi.quantidade, i.custo_unitario FROM produto_insumos pi
      JOIN insumos i ON i.id = pi.insumo_id WHERE pi.produto_id = ${id} ORDER BY i.nome`,
    sql`SELECT id, nome, unidade, custo_unitario FROM insumos ORDER BY nome`,
    sql`SELECT canal, preco FROM produto_precos WHERE produto_id = ${id}`,
    sql`SELECT id, canal, anuncio_id, variacao_id, quantidade FROM anuncio_vinculos WHERE produto_id = ${id} ORDER BY canal, anuncio_id`,
    configCanais(),
  ]);
  const produto = (prodR as Produto[])[0];
  if (!produto) notFound();
  const comp = compR as Comp[];
  const insumos = insumosR as { id: number; nome: string; unidade: string; custo_unitario: string }[];
  const precos = precosR as { canal: Canal; preco: string }[];
  const vinculos = vincR as { id: number; canal: Canal; anuncio_id: string; variacao_id: string; quantidade: number }[];

  const custoInsumos = comp.reduce((a, c) => a + Number(c.quantidade) * Number(c.custo_unitario), 0);
  const custo = r2(custoInsumos + Number(produto.custo_extra));

  return (
    <>
      <Link href="/produtos" className="text-sm text-accent hover:underline">← Produtos</Link>
      <Cabecalho titulo={produto.nome} sub={<>Custo unitário: <b className="text-fg">{brl(custo)}</b></>} />
      {sp.vinculadas !== undefined && (
        <p className="card text-sm text-pos">Anúncio vinculado. {sp.vinculadas} vendas pendentes receberam o custo.</p>
      )}

      <section className="card">
        <h2 className="card-title mb-3">Composição do custo</h2>
        <table className="tbl mb-3">
          <thead>
            <tr><th>Insumo</th><th>Quantidade</th><th>Custo unit.</th><th>Subtotal</th><th></th></tr>
          </thead>
          <tbody>
            {comp.map((c) => (
              <tr key={c.insumo_id}>
                <td>{c.nome}</td>
                <td>{Number(c.quantidade).toLocaleString("pt-BR")} {c.unidade}</td>
                <td>{brl(c.custo_unitario)}</td>
                <td>{brl(Number(c.quantidade) * Number(c.custo_unitario))}</td>
                <td><ExcluirBotao action={removerDaComposicao.bind(null, id, c.insumo_id)} /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>Custo extra (mão de obra, outros)</td>
              <td>{brl(produto.custo_extra)}</td>
              <td></td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={3}>Total</td><td>{brl(custo)}</td><td></td>
            </tr>
          </tbody>
        </table>
        {insumos.length === 0 ? (
          <p className="text-sm text-muted">
            Cadastre os insumos primeiro em <Link href="/produtos/insumos" className="text-accent hover:underline">Insumos</Link>.
          </p>
        ) : (
          <form action={salvarComposicao.bind(null, id)} className="flex flex-wrap items-end gap-2">
            <label className="field">
              <span>Insumo</span>
              <select name="insumo_id" required>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome} ({brl(i.custo_unitario)}/{i.unidade})</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quantidade por unidade</span>
              <input type="number" step="0.0001" min={0} name="quantidade" defaultValue={1} className="w-32" required />
            </label>
            <button className="btn-ghost">Adicionar / atualizar</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2 className="card-title mb-3">Dados e preços</h2>
        <form action={salvarProduto.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field sm:col-span-2">
            <span>Nome</span>
            <input name="nome" defaultValue={produto.nome} required />
          </label>
          <label className="field">
            <span>SKU</span>
            <input name="sku" defaultValue={produto.sku ?? ""} />
          </label>
          <label className="field">
            <span>Custo extra por unidade (R$)</span>
            <input type="number" step="0.01" min={0} name="custo_extra" defaultValue={produto.custo_extra} />
          </label>
          {(Object.keys(CANAIS) as Canal[]).map((c) => {
            const preco = precos.find((p) => p.canal === c);
            const pv = Number(preco?.preco ?? 0);
            const margem = r2(pv - custo - taxaEstimada(canais[c], pv, 1) - canais[c].frete_estimado);
            return (
              <label key={c} className="field">
                <span>Preço {CANAIS[c]} (R$)</span>
                <input type="number" step="0.01" min={0} name={`preco_${c}`} defaultValue={preco?.preco ?? ""} placeholder="não vende" />
                {preco && (
                  <small className={`text-xs ${margem < 0 ? "text-neg" : "text-muted"}`}>Margem planejada {brl(margem)} ({pct(margem, pv)})</small>
                )}
              </label>
            );
          })}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ativo" defaultChecked={produto.ativo} /> Ativo (aparece na venda manual)
          </label>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button className="btn">Salvar</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title mb-1">Anúncios vinculados</h2>
        <p className="text-sm text-muted mb-3">
          Vendas importadas desses anúncios usam o custo deste produto. Quantidade maior que 1 = kit (ex.: anúncio &quot;Kit 5 placas&quot;).
        </p>
        {vinculos.length > 0 && (
          <table className="tbl mb-3">
            <thead><tr><th>Canal</th><th>Anúncio</th><th>Variação</th><th>Unid. por venda</th><th></th></tr></thead>
            <tbody>
              {vinculos.map((v) => (
                <tr key={v.id}>
                  <td>{CANAIS[v.canal] ?? v.canal}</td>
                  <td>{v.anuncio_id}</td>
                  <td>{v.variacao_id || "—"}</td>
                  <td>{v.quantidade}</td>
                  <td><ExcluirBotao action={removerVinculo.bind(null, v.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form action={vincular} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="canal" value="mercado_livre" />
          <input type="hidden" name="produto_1" value={id} />
          <input type="hidden" name="voltar" value={`/produtos/${id}`} />
          <label className="field">
            <span>Anúncio do ML</span>
            <input name="anuncio_id" placeholder="MLB1234567890" required />
          </label>
          <label className="field">
            <span>Variação (opcional)</span>
            <input name="variacao_id" />
          </label>
          <label className="field">
            <span>Unid. por venda</span>
            <input type="number" min={1} name="quantidade_1" defaultValue={1} className="w-24" />
          </label>
          <button className="btn-ghost">Vincular</button>
        </form>
      </section>

      <section className="flex justify-end">
        <ExcluirBotao action={excluirProduto.bind(null, id)} />
      </section>
      <p className="text-xs text-muted text-right">Produtos com vendas são arquivados em vez de excluídos.</p>
    </>
  );
}
