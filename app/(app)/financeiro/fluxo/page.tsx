import Link from "next/link";
import { linhas, sql } from "@/lib/db";
import { brl, dataBR, hoje } from "@/lib/constants";
import { intervaloMes, mesValido } from "@/lib/periodo";
import { Cabecalho, Kpi, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

type Dia = { dia: string; recebido: string; pago: string; a_receber: string; a_pagar: string };

export default async function Fluxo({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const mes = mesValido((await searchParams).mes);
  const { ini, prox } = intervaloMes(mes);
  const dia = hoje();

  // realizado entra pela data de pagamento; previsto pelo vencimento (vencidas em aberto contam como hoje)
  const [dias, [inicio], [atrasado]] = await Promise.all([
    linhas<Dia>(sql`WITH mov AS (
        SELECT pago_em AS dia, CASE WHEN tipo = 'receber' THEN valor ELSE 0 END AS recebido,
               CASE WHEN tipo = 'pagar' THEN valor ELSE 0 END AS pago, 0 AS a_receber, 0 AS a_pagar
          FROM contas WHERE pago_em >= ${ini} AND pago_em < ${prox}
        UNION ALL
        SELECT GREATEST(vencimento, ${dia}::date), 0, 0,
               CASE WHEN tipo = 'receber' THEN valor ELSE 0 END, CASE WHEN tipo = 'pagar' THEN valor ELSE 0 END
          FROM contas WHERE pago_em IS NULL AND GREATEST(vencimento, ${dia}::date) >= ${ini} AND GREATEST(vencimento, ${dia}::date) < ${prox})
      SELECT dia::text, SUM(recebido) AS recebido, SUM(pago) AS pago, SUM(a_receber) AS a_receber, SUM(a_pagar) AS a_pagar
      FROM mov GROUP BY dia ORDER BY dia`),
    // saldo no início do mês = tudo realizado antes + previsto entre hoje e o início (se o mês é futuro)
    linhas<{ saldo: string }>(sql`SELECT COALESCE(SUM(CASE WHEN tipo = 'receber' THEN valor ELSE -valor END), 0) AS saldo FROM contas
      WHERE (pago_em < ${ini}) OR (pago_em IS NULL AND GREATEST(vencimento, ${dia}::date) < ${ini})`),
    linhas<{ receber: string; pagar: string }>(sql`SELECT
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'receber'), 0) AS receber, COALESCE(SUM(valor) FILTER (WHERE tipo = 'pagar'), 0) AS pagar
      FROM contas WHERE pago_em IS NULL AND vencimento < ${dia}`),
  ]);

  let saldo = Number(inicio.saldo);
  const tot = { recebido: 0, pago: 0, aReceber: 0, aPagar: 0 };
  const rows = dias.map((d) => {
    const r = Number(d.recebido), p = Number(d.pago), ar = Number(d.a_receber), ap = Number(d.a_pagar);
    tot.recebido += r; tot.pago += p; tot.aReceber += ar; tot.aPagar += ap;
    saldo += r - p + ar - ap;
    return { ...d, r, p, ar, ap, saldo };
  });

  return (
    <>
      <Cabecalho titulo="Fluxo de caixa" sub="Realizado pela data de pagamento; previsto pelo vencimento. Vencidas em aberto aparecem em hoje.">
        <form className="flex gap-2 items-end">
          <input type="month" name="mes" defaultValue={mes} aria-label="Mês" />
          <button className="btn-ghost">Filtrar</button>
        </form>
      </Cabecalho>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Saldo no início do mês" valor={brl(inicio.saldo)} />
        <Kpi titulo="Entradas (realizado + previsto)" valor={brl(tot.recebido + tot.aReceber)} sub={`${brl(tot.recebido)} recebido`} tom="pos" />
        <Kpi titulo="Saídas (realizado + previsto)" valor={brl(tot.pago + tot.aPagar)} sub={`${brl(tot.pago)} pago`} tom="neg" />
        <Kpi titulo="Saldo projetado no fim do mês" valor={brl(saldo)} tom={saldo >= 0 ? "pos" : "neg"} />
      </div>
      {(Number(atrasado.receber) > 0 || Number(atrasado.pagar) > 0) && (
        <p className="text-sm">
          Em atraso: <Link href="/financeiro/receber?s=vencidas" className="btn-link">{brl(atrasado.receber)} a receber</Link> ·{" "}
          <Link href="/financeiro/pagar?s=vencidas" className="btn-link">{brl(atrasado.pagar)} a pagar</Link>
        </p>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Dia</th><th className="num">Recebido</th><th className="num">Pago</th><th className="num">A receber</th><th className="num">A pagar</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.dia} className={d.dia === dia ? "font-medium" : ""}>
                <td>{dataBR(d.dia)}{d.dia === dia && " (hoje)"}</td>
                <td className="num text-pos">{d.r ? brl(d.r) : ""}</td>
                <td className="num text-neg">{d.p ? brl(d.p) : ""}</td>
                <td className="num">{d.ar ? brl(d.ar) : ""}</td>
                <td className="num">{d.ap ? brl(d.ap) : ""}</td>
                <td className={`num ${d.saldo < 0 ? "text-neg" : ""}`}>{brl(d.saldo)}</td>
              </tr>
            ))}
            {rows.length === 0 && <Vazio colunas={6}>Sem movimento neste mês.</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
