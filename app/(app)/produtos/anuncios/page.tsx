import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, type Canal } from "@/lib/constants";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { ProdutosNav } from "@/components/ProdutosNav";
import { Cabecalho } from "@/components/ui";
import { removerVinculo, vincular } from "../actions";

export const dynamic = "force-dynamic";

type Pendente = { canal: Canal; anuncio_id: string; variacao_id: string; titulo: string; vendas: string; unidades: string };
type VinculoRow = { id: number; canal: Canal; anuncio_id: string; variacao_id: string; quantidade: number; produto_id: number; nome: string };

export default async function Anuncios({ searchParams }: { searchParams: Promise<{ vinculadas?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const [pendR, prodR, vincR] = await Promise.all([
    sql`SELECT v.canal, i.anuncio_id, i.variacao_id, MAX(i.descricao) AS titulo, COUNT(DISTINCT i.venda_id) AS vendas,
        SUM(i.quantidade) AS unidades
      FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
      WHERE i.produto_id IS NULL AND i.anuncio_id IS NOT NULL
      GROUP BY v.canal, i.anuncio_id, i.variacao_id ORDER BY COUNT(DISTINCT i.venda_id) DESC`,
    sql`SELECT id, nome FROM produtos WHERE ativo ORDER BY nome`,
    sql`SELECT a.id, a.canal, a.anuncio_id, a.variacao_id, a.quantidade, a.produto_id, p.nome
      FROM anuncio_vinculos a JOIN produtos p ON p.id = a.produto_id ORDER BY a.anuncio_id, a.variacao_id, a.id`,
  ]);
  const pendentes = pendR as Pendente[];
  const produtos = prodR as { id: number; nome: string }[];
  const vinculos = vincR as VinculoRow[];

  const Opcoes = () => (
    <>
      <option value="">—</option>
      {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </>
  );

  return (
    <>
      <Cabecalho titulo="Anúncios">
        <ProdutosNav atual="/produtos/anuncios" />
      </Cabecalho>
      {sp.vinculadas !== undefined && (
        <p className="card text-sm text-pos">Anúncio vinculado. {sp.vinculadas} vendas receberam o custo do produto.</p>
      )}

      <section className="card overflow-x-auto">
        <h2 className="card-title mb-1">Anúncios sem produto</h2>
        <p className="text-sm text-muted mb-3">
          Vendas importadas destes anúncios estão com custo zerado. Vincule cada um ao produto (ou produtos, se for um combo) e as vendas
          pendentes recebem o custo na hora. As próximas vendas já chegam com custo.
        </p>
        {produtos.length === 0 ? (
          <p className="text-sm text-muted">
            Cadastre os produtos primeiro em <Link href="/produtos" className="text-accent hover:underline">Produtos</Link>.
          </p>
        ) : pendentes.length === 0 ? (
          <p className="text-sm text-muted">Nenhum anúncio pendente.</p>
        ) : (
          <div className="space-y-4">
            {pendentes.map((a) => (
              <form key={`${a.anuncio_id}-${a.variacao_id}`} action={vincular} className="rounded-lg border border-border p-3 space-y-2">
                <input type="hidden" name="canal" value={a.canal} />
                <input type="hidden" name="anuncio_id" value={a.anuncio_id} />
                <input type="hidden" name="variacao_id" value={a.variacao_id} />
                <p className="text-sm">
                  <b>{a.titulo}</b>{" "}
                  <span className="text-muted">
                    · {a.anuncio_id}{a.variacao_id && ` · variação ${a.variacao_id}`} · {CANAIS[a.canal] ?? a.canal} · {a.vendas} vendas, {a.unidades} unid.
                  </span>
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  {[1, 2, 3].map((k) => (
                    <div key={k} className="flex items-end gap-1">
                      <label className="field">
                        <span>{k === 1 ? "Produto" : `+ produto ${k} (combo)`}</span>
                        <select name={`produto_${k}`} required={k === 1}><Opcoes /></select>
                      </label>
                      <label className="field">
                        <span>Unid.</span>
                        <input type="number" min={1} name={`quantidade_${k}`} defaultValue={1} className="w-20" />
                      </label>
                    </div>
                  ))}
                  <button className="btn">Vincular</button>
                </div>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="card-title mb-3">Vínculos</h2>
        <table className="tbl">
          <thead><tr><th>Canal</th><th>Anúncio</th><th>Variação</th><th>Produto</th><th>Unid. por venda</th><th></th></tr></thead>
          <tbody>
            {vinculos.map((v) => (
              <tr key={v.id}>
                <td>{CANAIS[v.canal] ?? v.canal}</td>
                <td>{v.anuncio_id}</td>
                <td>{v.variacao_id || "—"}</td>
                <td><Link href={`/produtos/${v.produto_id}`} className="text-accent hover:underline">{v.nome}</Link></td>
                <td>{v.quantidade}</td>
                <td><ExcluirBotao action={removerVinculo.bind(null, v.id)} /></td>
              </tr>
            ))}
            {vinculos.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-6">Nenhum vínculo ainda.</td></tr>
            )}
          </tbody>
        </table>
        <p className="text-xs text-muted mt-2">Remover um vínculo não altera vendas já feitas.</p>
      </section>
    </>
  );
}
