import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, brl, mesAtual, pct, r2, type Canal } from "@/lib/constants";
import { taxaEstimada } from "@/lib/itens";
import { configCanais, custosProdutos } from "@/lib/produtos";
import { MesFiltro, intervaloMes, mesValido } from "@/components/MesFiltro";
import { ProdutosNav } from "@/components/ProdutosNav";
import { Cabecalho } from "@/components/ui";
import { criarProduto, recalcular } from "./actions";

export const dynamic = "force-dynamic";

type Real = { produto_id: number; unidades: string; valor: string; custo: string; taxas: string; frete: string };

export default async function Produtos({ searchParams }: { searchParams: Promise<{ mes?: string; recalculados?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const mes = mesValido(sp.mes, mesAtual());
  const { ini, prox } = intervaloMes(mes);

  const [prodsR, precosR, custos, canais, realR] = await Promise.all([
    sql`SELECT id, nome, sku, ativo FROM produtos ORDER BY ativo DESC, nome`,
    sql`SELECT produto_id, canal, preco FROM produto_precos`,
    custosProdutos(),
    configCanais(),
    // taxa e frete da venda são rateados entre os itens pelo valor de cada um
    sql`SELECT i.produto_id, SUM(i.quantidade) AS unidades, SUM(i.valor) AS valor, SUM(i.custo_unitario * i.quantidade) AS custo,
        SUM(v.taxa_plataforma * i.valor / NULLIF(t.total, 0)) AS taxas,
        SUM((v.frete - v.reembolso_frete) * i.valor / NULLIF(t.total, 0)) AS frete
      FROM venda_itens i
      JOIN vendas v ON v.id = i.venda_id
      JOIN (SELECT venda_id, SUM(valor) AS total FROM venda_itens GROUP BY venda_id) t ON t.venda_id = i.venda_id
      WHERE v.data >= ${ini} AND v.data < ${prox} AND v.status_entrega NOT IN ('cancelado','devolvido') AND i.produto_id IS NOT NULL
      GROUP BY i.produto_id`,
  ]);
  const prods = prodsR as { id: number; nome: string; sku: string | null; ativo: boolean }[];
  const precos = precosR as { produto_id: number; canal: Canal; preco: string }[];
  const real = realR as Real[];
  const canaisComPreco = (Object.keys(CANAIS) as Canal[]).filter((c) => precos.some((p) => p.canal === c));

  const linhas = prods.map((p) => {
    const custo = custos.get(p.id) ?? 0;
    const r = real.find((x) => x.produto_id === p.id);
    const valor = Number(r?.valor ?? 0);
    const lucro = valor - Number(r?.custo ?? 0) - Number(r?.taxas ?? 0) - Number(r?.frete ?? 0);
    return { ...p, custo, unidades: Number(r?.unidades ?? 0), valor, lucro };
  });
  const tot = linhas.reduce((a, l) => ({ unidades: a.unidades + l.unidades, valor: a.valor + l.valor, lucro: a.lucro + l.lucro }), {
    unidades: 0, valor: 0, lucro: 0,
  });

  return (
    <>
      <Cabecalho titulo="Produtos">
        <ProdutosNav atual="/produtos" />
      </Cabecalho>
      {sp.recalculados !== undefined && (
        <p className="card text-sm text-pos">Custos recalculados: {sp.recalculados} itens de venda atualizados.</p>
      )}

      <section className="card">
        <h2 className="card-title mb-3">Novo produto</h2>
        <form action={criarProduto} className="flex flex-wrap items-end gap-3">
          <label className="field grow">
            <span>Nome</span>
            <input name="nome" placeholder="Ex.: Placa NFC Instagram" required />
          </label>
          <label className="field">
            <span>SKU (opcional)</span>
            <input name="sku" />
          </label>
          <button className="btn">Criar e montar custo</button>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 className="font-medium">Custos e margens</h2>
          <MesFiltro mes={mes} action="/produtos" />
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th rowSpan={2}>Produto</th>
              <th rowSpan={2}>Custo</th>
              {canaisComPreco.length > 0 && <th colSpan={canaisComPreco.length}>Margem planejada (preço · margem)</th>}
              <th colSpan={4}>Realizado no mês</th>
            </tr>
            <tr>
              {canaisComPreco.map((c) => <th key={c}>{CANAIS[c]}</th>)}
              <th>Unid.</th><th>Faturamento</th><th>Lucro</th><th>Margem</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className={l.ativo ? "" : "opacity-50"}>
                <td>
                  <Link href={`/produtos/${l.id}`} className="font-medium text-accent hover:underline">{l.nome}</Link>
                  {l.sku && <span className="text-xs text-muted ml-1">{l.sku}</span>}
                  {!l.ativo && <span className="badge bg-surface-2 text-muted ml-1">arquivado</span>}
                </td>
                <td className="whitespace-nowrap">{brl(l.custo)}</td>
                {canaisComPreco.map((c) => {
                  const preco = precos.find((p) => p.produto_id === l.id && p.canal === c);
                  if (!preco) return <td key={c} className="text-muted">—</td>;
                  const pv = Number(preco.preco);
                  const margem = r2(pv - l.custo - taxaEstimada(canais[c], pv, 1) - canais[c].frete_estimado);
                  return (
                    <td key={c} className="whitespace-nowrap">
                      {brl(pv)} · <span className={margem < 0 ? "text-neg" : "text-pos"}>{brl(margem)} ({pct(margem, pv)})</span>
                    </td>
                  );
                })}
                <td>{l.unidades}</td>
                <td className="whitespace-nowrap">{brl(l.valor)}</td>
                <td className={`whitespace-nowrap ${l.lucro < 0 ? "text-neg" : ""}`}>{brl(l.lucro)}</td>
                <td>{pct(l.lucro, l.valor)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={6 + canaisComPreco.length} className="text-center text-muted py-6">Nenhum produto cadastrado.</td></tr>
            )}
            {linhas.length > 0 && (
              <tr className="font-semibold">
                <td colSpan={2 + canaisComPreco.length}>Total</td>
                <td>{tot.unidades}</td><td>{brl(tot.valor)}</td><td>{brl(tot.lucro)}</td><td>{pct(tot.lucro, tot.valor)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-xs text-muted mt-2">
          Margem planejada = preço − custo − taxa estimada do canal − frete estimado (ver Taxas por canal). Realizado = vendas do mês
          ligadas ao produto, com taxa e frete rateados pelo valor de cada item; canceladas e devolvidas ficam de fora.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title mb-1">Recalcular custos das vendas</h2>
        <p className="text-sm text-muted mb-3">
          Cada venda guarda o custo do momento em que foi feita. Use isto só para corrigir um custo cadastrado errado: aplica o custo atual
          dos produtos às vendas do mês escolhido (custos ajustados à mão na venda não mudam).
        </p>
        <form action={recalcular} className="flex flex-wrap items-end gap-2">
          <label className="field">
            <span>Mês</span>
            <input type="month" name="mes" defaultValue={mes} required />
          </label>
          <button className="btn-ghost">Recalcular</button>
        </form>
      </section>
    </>
  );
}
