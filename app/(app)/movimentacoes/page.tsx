import { sql, ensureSchema } from "@/lib/db";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, brl, dataBR, hoje, mesAtual } from "@/lib/constants";
import { MesFiltro, intervaloMes, mesValido } from "@/components/MesFiltro";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { criarMovimentacao, excluirMovimentacao } from "../actions";

export const dynamic = "force-dynamic";

type Mov = { id: number; data: string; tipo: "entrada" | "saida"; categoria: string; descricao: string | null; valor: string };

export default async function Movimentacoes({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await ensureSchema();
  const mes = mesValido((await searchParams).mes, mesAtual());
  const { ini, prox } = intervaloMes(mes);
  const movs = (await sql`SELECT * FROM movimentacoes WHERE data >= ${ini} AND data < ${prox}
    ORDER BY data DESC, id DESC`) as Mov[];
  const entradas = movs.filter((m) => m.tipo === "entrada").reduce((a, m) => a + Number(m.valor), 0);
  const saidas = movs.filter((m) => m.tipo === "saida").reduce((a, m) => a + Number(m.valor), 0);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Entradas e saídas</h1>
        <p className="text-sm text-muted">
          Gastos (material, embalagem, anúncios…) e entradas que não são vendas dos marketplaces. Vendas ficam na aba Vendas.
        </p>
      </div>

      <section className="card">
        <h2 className="font-medium mb-3">Novo lançamento</h2>
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
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <p className="text-sm">
            <span className="text-green-700">+{brl(entradas)}</span> · <span className="text-red-600">−{brl(saidas)}</span> · saldo <b>{brl(entradas - saidas)}</b>
          </p>
          <MesFiltro mes={mes} action="/movimentacoes" />
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th className="text-right">Valor</th><th></th></tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{dataBR(m.data)}</td>
                <td>{m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
                <td>{m.categoria}</td>
                <td>{m.descricao ?? "—"}</td>
                <td className={`text-right whitespace-nowrap ${m.tipo === "saida" ? "text-red-600" : "text-green-700"}`}>
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
