import Link from "next/link";
import { linhas, sql, ensureSchema } from "@/lib/db";
import { CANAIS, brl, hoje, mesAtual, type Canal } from "@/lib/constants";
import { intervaloMes, mesValido } from "@/lib/periodo";
import { Cabecalho, Kpi } from "@/components/ui";

export const dynamic = "force-dynamic";

type PorCanal = { canal: Canal; pedidos: number; bruto: string; taxas: string; frete: string; custo: string };

export default async function Inicio({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await ensureSchema();
  const mes = mesValido((await searchParams).mes, mesAtual());
  const { ini, prox } = intervaloMes(mes);
  const dia = hoje();

  const [porCanal, [fin], [ops], [despesas]] = await Promise.all([
    // custo = custo extra da venda + custo cadastrado dos produtos vendidos
    linhas<PorCanal>(sql`SELECT v.canal, COUNT(*)::int AS pedidos, SUM(v.valor_bruto) AS bruto, SUM(v.taxa_plataforma) AS taxas,
        SUM(v.frete) AS frete, SUM(v.custo_produto + COALESCE(ci.custo, 0)) AS custo
      FROM vendas v
      LEFT JOIN (SELECT i.venda_id, SUM(i.quantidade * p.custo) AS custo FROM venda_itens i JOIN produtos p ON p.id = i.produto_id GROUP BY i.venda_id) ci
        ON ci.venda_id = v.id
      WHERE v.data >= ${ini} AND v.data < ${prox} AND v.status_entrega NOT IN ('cancelado','devolvido')
      GROUP BY v.canal`),
    linhas<{ receber_hoje: string; pagar_hoje: string; receber_vencido: string; pagar_vencido: string; saldo: string }>(sql`SELECT
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'receber' AND pago_em IS NULL AND vencimento = ${dia}), 0) AS receber_hoje,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'pagar' AND pago_em IS NULL AND vencimento = ${dia}), 0) AS pagar_hoje,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'receber' AND pago_em IS NULL AND vencimento < ${dia}), 0) AS receber_vencido,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'pagar' AND pago_em IS NULL AND vencimento < ${dia}), 0) AS pagar_vencido,
        COALESCE(SUM(CASE WHEN tipo = 'receber' THEN valor ELSE -valor END) FILTER (WHERE pago_em IS NOT NULL), 0) AS saldo
      FROM contas`),
    linhas<{ a_enviar: number; atrasados: number; em_transito: number; sem_nota: number; estoque_baixo: number }>(sql`SELECT
        (SELECT COUNT(*) FROM vendas WHERE status_entrega = 'a_enviar')::int AS a_enviar,
        (SELECT COUNT(*) FROM vendas WHERE status_entrega = 'a_enviar' AND data <= ${dia}::date - 2)::int AS atrasados,
        (SELECT COUNT(*) FROM vendas WHERE status_entrega = 'enviado')::int AS em_transito,
        (SELECT COUNT(*) FROM vendas v WHERE v.status_entrega NOT IN ('cancelado','devolvido')
          AND NOT EXISTS (SELECT 1 FROM notas_fiscais n WHERE n.venda_id = v.id AND n.status = 'autorizada'))::int AS sem_nota,
        (SELECT COUNT(*) FROM produtos p WHERE p.ativo AND
          COALESCE((SELECT SUM(quantidade) FROM estoque_movs m WHERE m.produto_id = p.id), 0) <= p.estoque_minimo)::int AS estoque_baixo`),
    // despesas do mês = contas a pagar com vencimento no mês, exceto compras de mercadoria
    // (o custo da mercadoria já entra pelo custo cadastrado dos produtos vendidos)
    linhas<{ total: string }>(sql`SELECT COALESCE(SUM(valor), 0) AS total FROM contas
      WHERE tipo = 'pagar' AND categoria <> 'Compras' AND vencimento >= ${ini} AND vencimento < ${prox}`),
  ]);

  const n = (v: string | number | undefined) => Number(v ?? 0);
  const canais = (Object.keys(CANAIS) as Canal[]).map((c) => {
    const r = porCanal.find((x) => x.canal === c);
    const bruto = n(r?.bruto), taxas = n(r?.taxas), frete = n(r?.frete), custo = n(r?.custo);
    return { c, pedidos: n(r?.pedidos), bruto, taxas, frete, custo, liquido: bruto - taxas - frete, margem: bruto - taxas - frete - custo };
  });
  const t = canais.reduce((a, l) => ({ pedidos: a.pedidos + l.pedidos, bruto: a.bruto + l.bruto, taxas: a.taxas + l.taxas, frete: a.frete + l.frete, custo: a.custo + l.custo, liquido: a.liquido + l.liquido, margem: a.margem + l.margem }),
    { pedidos: 0, bruto: 0, taxas: 0, frete: 0, custo: 0, liquido: 0, margem: 0 });
  const resultado = t.margem - n(despesas.total);
  const ticket = t.pedidos ? t.bruto / t.pedidos : 0;

  return (
    <>
      <Cabecalho titulo="Início" sub="Visão geral do mês">
        <form className="flex gap-2 items-end">
          <input type="month" name="mes" defaultValue={mes} aria-label="Mês" />
          <button className="btn-ghost">Ver mês</button>
        </form>
      </Cabecalho>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Faturamento bruto" valor={brl(t.bruto)} sub={`${t.pedidos} pedidos · ticket ${brl(ticket)}`} />
        <Kpi titulo="Líquido dos canais" valor={brl(t.liquido)} sub={`−${brl(t.taxas)} taxas · −${brl(t.frete)} frete`} />
        <Kpi titulo="Despesas do mês" valor={brl(despesas.total)} sub="contas a pagar do mês, sem compras de mercadoria" />
        <Kpi titulo="Resultado estimado" valor={brl(resultado)} sub="líquido − custo dos produtos − despesas" tom={resultado >= 0 ? "pos" : "neg"} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Atalho href="/entregas" titulo="A enviar" valor={ops.a_enviar} alerta={ops.atrasados ? `${ops.atrasados} com 2+ dias` : undefined} />
        <Atalho href="/entregas" titulo="Em trânsito" valor={ops.em_transito} />
        <Atalho href="/vendas?nf=sem" titulo="Vendas sem nota" valor={ops.sem_nota} alerta={ops.sem_nota ? "emitir no Sebrae" : undefined} />
        <Atalho href="/estoque?f=baixo" titulo="Estoque baixo" valor={ops.estoque_baixo} alerta={ops.estoque_baixo ? "repor" : undefined} />
        <Link href="/financeiro/fluxo" className="card hover:border-accent">
          <p className="text-xs text-muted">Saldo em caixa (realizado)</p>
          <p className={`text-xl font-semibold mt-1 ${n(fin.saldo) < 0 ? "text-neg" : ""}`}>{brl(fin.saldo)}</p>
        </Link>
      </div>

      <section className="tbl-wrap">
        <div className="px-3 pt-3 secao">Vendas por canal</div>
        <table className="tbl">
          <thead><tr><th>Canal</th><th className="num">Pedidos</th><th className="num">Bruto</th><th className="num">Taxas</th><th className="num">Frete</th><th className="num">Líquido</th><th className="num">Custo</th><th className="num">Margem</th><th className="num">% bruto</th></tr></thead>
          <tbody>
            {canais.map((l) => (
              <tr key={l.c}>
                <td className="font-medium"><Link href={`/vendas?mes=${mes}&canal=${l.c}`} className="hover:underline">{CANAIS[l.c]}</Link></td>
                <td className="num">{l.pedidos}</td><td className="num">{brl(l.bruto)}</td><td className="num">{brl(l.taxas)}</td>
                <td className="num">{brl(l.frete)}</td><td className="num">{brl(l.liquido)}</td><td className="num">{brl(l.custo)}</td>
                <td className={`num ${l.margem < 0 ? "text-neg" : ""}`}>{brl(l.margem)}</td>
                <td className="num">{t.bruto ? `${((l.bruto / t.bruto) * 100).toFixed(1).replace(".", ",")}%` : "—"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td><td className="num">{t.pedidos}</td><td className="num">{brl(t.bruto)}</td><td className="num">{brl(t.taxas)}</td>
              <td className="num">{brl(t.frete)}</td><td className="num">{brl(t.liquido)}</td><td className="num">{brl(t.custo)}</td><td className="num">{brl(t.margem)}</td><td />
            </tr>
          </tbody>
        </table>
        <p className="px-3 pb-3 text-xs text-muted">Canceladas e devolvidas ficam fora. Custo = custo cadastrado dos produtos vendidos + custo extra do pedido.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/financeiro/receber" className="card hover:border-accent text-sm">
          <p className="secao mb-1">Recebimentos</p>
          <p>Hoje: <b>{brl(fin.receber_hoje)}</b></p>
          <p className={n(fin.receber_vencido) ? "text-neg" : "text-muted"}>Vencidos: {brl(fin.receber_vencido)}</p>
        </Link>
        <Link href="/financeiro/pagar" className="card hover:border-accent text-sm">
          <p className="secao mb-1">Pagamentos</p>
          <p>Hoje: <b>{brl(fin.pagar_hoje)}</b></p>
          <p className={n(fin.pagar_vencido) ? "text-neg" : "text-muted"}>Vencidos: {brl(fin.pagar_vencido)}</p>
        </Link>
      </section>
    </>
  );
}

function Atalho({ href, titulo, valor, alerta }: { href: string; titulo: string; valor: number; alerta?: string }) {
  return (
    <Link href={href} className="card hover:border-accent">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="text-xl font-semibold mt-1">{valor}</p>
      {alerta && <p className="text-xs text-neg mt-1">{alerta}</p>}
    </Link>
  );
}
