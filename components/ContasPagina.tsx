import Link from "next/link";
import { linhas, sql, ensureSchema } from "@/lib/db";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, brl, dataBR, hoje } from "@/lib/constants";
import { intervaloMes, mesValido } from "@/lib/periodo";
import { baixarConta, criarConta, estornarConta } from "@/app/(app)/financeiro/actions";
import { ActionForm } from "./ActionForm";
import { Abas, Cabecalho, Campo, Kpi, Tag, Vazio } from "./ui";

type Conta = { id: number; descricao: string; categoria: string; valor: string; vencimento: string; pago_em: string | null; venda_id: number | null; nota_id: number | null };
const SITUACOES = { abertas: "Em aberto", vencidas: "Vencidas", pagas: "Liquidadas", todas: "Todas" } as const;
type Situacao = keyof typeof SITUACOES;

export async function ContasPagina({ tipo, sp }: { tipo: "pagar" | "receber"; sp: { mes?: string; s?: string } }) {
  await ensureSchema();
  const receber = tipo === "receber";
  const mes = mesValido(sp.mes);
  const s: Situacao = sp.s && sp.s in SITUACOES ? (sp.s as Situacao) : "abertas";
  const { ini, prox } = intervaloMes(mes);
  const dia = hoje();

  // vencidas ignoram o mês: mostram tudo que passou do prazo
  const [contas, [resumo]] = await Promise.all([
    linhas<Conta>(sql`SELECT id, descricao, categoria, valor, vencimento, pago_em, venda_id, nota_id FROM contas
      WHERE tipo = ${tipo} AND (
        (${s} = 'vencidas' AND pago_em IS NULL AND vencimento < ${dia}) OR
        (${s} = 'abertas' AND pago_em IS NULL AND vencimento >= ${ini} AND vencimento < ${prox}) OR
        (${s} = 'pagas' AND pago_em >= ${ini} AND pago_em < ${prox}) OR
        (${s} = 'todas' AND vencimento >= ${ini} AND vencimento < ${prox}))
      ORDER BY COALESCE(pago_em, vencimento), id`),
    linhas<{ aberto: string; vencido: string; liquidado: string }>(sql`SELECT
        COALESCE(SUM(valor) FILTER (WHERE pago_em IS NULL AND vencimento >= ${ini} AND vencimento < ${prox}), 0) AS aberto,
        COALESCE(SUM(valor) FILTER (WHERE pago_em IS NULL AND vencimento < ${dia}), 0) AS vencido,
        COALESCE(SUM(valor) FILTER (WHERE pago_em >= ${ini} AND pago_em < ${prox}), 0) AS liquidado
      FROM contas WHERE tipo = ${tipo}`),
  ]);
  const total = contas.reduce((a, c) => a + Number(c.valor), 0);
  const href = (k: string) => `/financeiro/${tipo}?s=${k}&mes=${mes}`;

  return (
    <>
      <Cabecalho titulo={receber ? "Contas a receber" : "Contas a pagar"}>
        <form className="flex gap-2 items-end">
          <input type="hidden" name="s" value={s} />
          <input type="month" name="mes" defaultValue={mes} aria-label="Mês" />
          <button className="btn-ghost">Filtrar</button>
        </form>
      </Cabecalho>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Kpi titulo={`Em aberto no mês`} valor={brl(resumo.aberto)} />
        <Kpi titulo="Vencido (todos os meses)" valor={brl(resumo.vencido)} tom={Number(resumo.vencido) > 0 ? "neg" : undefined} />
        <Kpi titulo={receber ? "Recebido no mês" : "Pago no mês"} valor={brl(resumo.liquidado)} tom="pos" />
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">+ Lançar conta a {tipo}</summary>
        <ActionForm action={criarConta} resetOnSuccess className="grid-form mt-3">
          <input type="hidden" name="tipo" value={tipo} />
          <Campo label="Descrição *" className="sm:col-span-2"><input name="descricao" required placeholder={receber ? "Ex.: venda avulsa, reembolso" : "Ex.: fornecedor de NFC, anúncios"} /></Campo>
          <Campo label="Categoria">
            <input name="categoria" list={`cat-${tipo}`} defaultValue="Outros" />
            <datalist id={`cat-${tipo}`}>{(receber ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA).map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
          <Campo label="Valor total (R$) *"><input type="number" step="0.01" min="0.01" name="valor" required /></Campo>
          <Campo label="1º vencimento"><input type="date" name="vencimento" defaultValue={dia} required /></Campo>
          <Campo label="Parcelas"><input type="number" min={1} max={60} step={1} name="parcelas" defaultValue={1} /></Campo>
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" name="ja_pago" /> Já {receber ? "recebida" : "paga"}</label>
          <div className="self-end"><button className="btn w-full">Lançar</button></div>
        </ActionForm>
      </details>

      <Abas atual={s} itens={Object.entries(SITUACOES).map(([k, v]) => ({ chave: k, label: v, href: href(k) }))} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {contas.map((c) => {
              const vencida = !c.pago_em && c.vencimento < dia;
              return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{dataBR(c.vencimento)}</td>
                  <td>
                    <Link href={`/financeiro/conta/${c.id}`} className="text-accent hover:underline">{c.descricao}</Link>
                    {c.venda_id && <Link href={`/vendas/${c.venda_id}`} className="block text-xs text-muted hover:underline">venda #{c.venda_id}</Link>}
                    {c.nota_id && <Link href={`/notas/${c.nota_id}`} className="block text-xs text-muted hover:underline">nota fiscal</Link>}
                  </td>
                  <td>{c.categoria}</td>
                  <td className="num">{brl(c.valor)}</td>
                  <td>
                    {c.pago_em ? <Tag cor="verde">{receber ? "recebida" : "paga"} {dataBR(c.pago_em)}</Tag> : vencida ? <Tag cor="vermelha">vencida</Tag> : <Tag cor="amarela">em aberto</Tag>}
                  </td>
                  <td className="whitespace-nowrap">
                    {c.pago_em ? (
                      <ActionForm action={estornarConta}><input type="hidden" name="id" value={c.id} /><button className="btn-link">estornar</button></ActionForm>
                    ) : (
                      <ActionForm action={baixarConta} className="flex gap-1 items-center">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="date" name="pago_em" defaultValue={dia} className="w-36 py-1" aria-label="Data do pagamento" />
                        <button className="btn-ghost py-1">{receber ? "Receber" : "Pagar"}</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
            {contas.length === 0 && <Vazio colunas={6}>Nada aqui.</Vazio>}
          </tbody>
          {contas.length > 0 && <tfoot><tr><td colSpan={3} className="px-3 py-2 text-sm font-medium">Total</td><td className="num px-3 font-medium">{brl(total)}</td><td colSpan={2} /></tr></tfoot>}
        </table>
      </div>
    </>
  );
}
