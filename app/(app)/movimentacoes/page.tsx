import { sql, ensureSchema } from "@/lib/db";
import { CATEGORIAS_ENTRADA, CATEGORIAS_INSUMO, CATEGORIAS_SAIDA, brl, dataBR, hoje, mesAtual } from "@/lib/constants";
import { MesFiltro, intervaloMes, mesValido } from "@/components/MesFiltro";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { Cabecalho, Kpi } from "@/components/ui";
import { criarMovimentacao, excluirMovimentacao } from "../actions";

export const dynamic = "force-dynamic";

type Mov = { id: number; data: string; tipo: "entrada" | "saida"; categoria: string; descricao: string | null; valor: string };

export default async function Movimentacoes({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await ensureSchema();
  const mes = mesValido((await searchParams).mes, mesAtual());
  const { ini, prox } = intervaloMes(mes);
  const [movsR, vendasR] = await Promise.all([
    sql`SELECT * FROM movimentacoes WHERE data >= ${ini} AND data < ${prox} ORDER BY data DESC, id DESC`,
    sql`SELECT COALESCE(SUM(valor_bruto - taxa_plataforma - (frete - reembolso_frete) - custo_produto), 0)::float AS liquido,
          COALESCE(SUM(valor_bruto - taxa_plataforma - (frete - reembolso_frete)), 0)::float AS caixa FROM vendas
        WHERE data >= ${ini} AND data < ${prox} AND status_entrega NOT IN ('cancelado','devolvido')`,
  ]);
  const movs = movsR as Mov[];
  const { liquido: vendasLiq, caixa: vendasCaixa } = (vendasR as { liquido: number; caixa: number }[])[0];
  const entradas = movs.filter((m) => m.tipo === "entrada").reduce((a, m) => a + Number(m.valor), 0);
  const saidas = movs.filter((m) => m.tipo === "saida").reduce((a, m) => a + Number(m.valor), 0);
  // compras de insumo já entram no resultado pelo custo dos produtos vendidos: ficam só no caixa
  const insumos = movs
    .filter((m) => m.tipo === "saida" && CATEGORIAS_INSUMO.includes(m.categoria))
    .reduce((a, m) => a + Number(m.valor), 0);
  const resultado = vendasLiq + entradas - (saidas - insumos);
  const caixa = vendasCaixa + entradas - saidas;

  return (
    <>
      <Cabecalho
        titulo="Entradas e saídas"
        sub={`Gastos e entradas que não são vendas. As vendas entram sozinhas no resultado, já com o custo dos produtos; por isso as compras de insumo (${CATEGORIAS_INSUMO.join(", ")}) contam só no caixa.`}
      >
        <MesFiltro mes={mes} action="/movimentacoes" />
      </Cabecalho>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Vendas (lucro)" valor={brl(vendasLiq)} sub="todas as lojas, após tarifas, frete e custo dos produtos" />
        <Kpi titulo="Outras entradas" valor={brl(entradas)} />
        <Kpi titulo="Saídas" valor={brl(saidas)} sub={insumos ? `${brl(insumos)} em insumos, fora do resultado` : undefined} />
        <Kpi titulo="Resultado do mês" valor={brl(resultado)} destaque={resultado >= 0 ? "pos" : "neg"} sub={`caixa do mês ${brl(caixa)}`} />
      </section>

      <section className="card">
        <h2 className="card-title mb-3">Novo lançamento</h2>
        <form action={criarMovimentacao} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="field">
            <span>Data</span>
            <input type="date" name="data" defaultValue={hoje()} required />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select name="tipo" defaultValue="saida">
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </select>
          </label>
          <label className="field">
            <span>Categoria</span>
            <input name="categoria" list="categorias" placeholder="Ex.: Embalagem" required />
            <datalist id="categorias">
              {[...CATEGORIAS_SAIDA, ...CATEGORIAS_ENTRADA].map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="field lg:col-span-2">
            <span>Descrição</span>
            <input name="descricao" />
          </label>
          <label className="field">
            <span>Valor (R$)</span>
            <input type="number" step="0.01" min="0.01" name="valor" required />
          </label>
          <div className="lg:col-span-6 flex justify-end">
            <button className="btn">Adicionar</button>
          </div>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="card-title mb-3">Lançamentos do mês</h2>
        <table className="tbl">
          <thead>
            <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th className="text-right">Valor</th><th></th></tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{dataBR(m.data)}</td>
                <td>{m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
                <td className="whitespace-nowrap">
                  {m.categoria}
                  {m.tipo === "saida" && CATEGORIAS_INSUMO.includes(m.categoria) && (
                    <span className="badge bg-surface-2 text-muted ml-1" title="Fora do resultado do mês (só caixa)">insumo</span>
                  )}
                </td>
                <td className="max-w-0 w-full"><span className="block truncate" title={m.descricao ?? ""}>{m.descricao ?? "—"}</span></td>
                <td className={`text-right whitespace-nowrap ${m.tipo === "saida" ? "text-neg" : "text-pos"}`}>
                  {m.tipo === "saida" ? "−" : "+"}{brl(m.valor)}
                </td>
                <td><ExcluirBotao action={excluirMovimentacao.bind(null, m.id)} /></td>
              </tr>
            ))}
            {movs.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-6">Nenhum lançamento neste mês.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
