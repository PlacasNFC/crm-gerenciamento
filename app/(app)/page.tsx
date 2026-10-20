import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, brl, mesAtual, type Canal } from "@/lib/constants";
import { MesFiltro, intervaloMes, mesValido } from "@/components/MesFiltro";

export const dynamic = "force-dynamic";

type LinhaCanal = { canal: Canal; pedidos: string; bruto: string; taxas: string; frete: string; custo: string };

export default async function Resumo({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await ensureSchema();
  const mes = mesValido((await searchParams).mes, mesAtual());
  const { ini, prox } = intervaloMes(mes);

  const [porCanalR, movsR, pendentesR] = await Promise.all([
    sql`SELECT canal, COUNT(*) AS pedidos, SUM(valor_bruto) AS bruto, SUM(taxa_plataforma) AS taxas,
          SUM(frete) AS frete, SUM(custo_produto) AS custo
        FROM vendas
        WHERE data >= ${ini} AND data < ${prox} AND status_entrega NOT IN ('cancelado','devolvido')
        GROUP BY canal`,
    sql`SELECT tipo, categoria, SUM(valor) AS total FROM movimentacoes
        WHERE data >= ${ini} AND data < ${prox} GROUP BY tipo, categoria ORDER BY total DESC`,
    sql`SELECT status_entrega, COUNT(*) AS n FROM vendas
        WHERE status_entrega IN ('a_enviar','enviado') GROUP BY status_entrega`,
  ]);
  const porCanal = porCanalR as LinhaCanal[];
  const movs = movsR as { tipo: "entrada" | "saida"; categoria: string; total: string }[];
  const pendentes = pendentesR as { status_entrega: string; n: string }[];

  const n = (v: string | null | undefined) => Number(v ?? 0);
  const linhas = (Object.keys(CANAIS) as Canal[]).map((c) => {
    const r = porCanal.find((x) => x.canal === c);
    const bruto = n(r?.bruto), taxas = n(r?.taxas), frete = n(r?.frete), custo = n(r?.custo);
    return { canal: c, pedidos: n(r?.pedidos), bruto, taxas, frete, custo, liquido: bruto - taxas - frete, lucro: bruto - taxas - frete - custo };
  });
  const tot = linhas.reduce(
    (a, l) => ({ pedidos: a.pedidos + l.pedidos, bruto: a.bruto + l.bruto, liquido: a.liquido + l.liquido, lucro: a.lucro + l.lucro, taxas: a.taxas + l.taxas, frete: a.frete + l.frete, custo: a.custo + l.custo }),
    { pedidos: 0, bruto: 0, liquido: 0, lucro: 0, taxas: 0, frete: 0, custo: 0 },
  );
  const entradas = movs.filter((m) => m.tipo === "entrada").reduce((a, m) => a + n(m.total), 0);
  const saidas = movs.filter((m) => m.tipo === "saida").reduce((a, m) => a + n(m.total), 0);
  const resultado = tot.lucro + entradas - saidas;
  const aEnviar = n(pendentes.find((p) => p.status_entrega === "a_enviar")?.n);
  const enviados = n(pendentes.find((p) => p.status_entrega === "enviado")?.n);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Resumo</h1>
        <MesFiltro mes={mes} action="/" />
      </div>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Faturamento bruto" valor={brl(tot.bruto)} sub={`${tot.pedidos} pedidos`} />
        <Kpi titulo="Líquido (após taxas e frete)" valor={brl(tot.liquido)} />
        <Kpi titulo="Outras entradas − saídas" valor={brl(entradas - saidas)} sub={`+${brl(entradas)} / −${brl(saidas)}`} />
        <Kpi titulo="Resultado do mês" valor={brl(resultado)} destaque={resultado >= 0 ? "pos" : "neg"} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="font-medium mb-3">Vendas por canal</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Canal</th><th>Pedidos</th><th>Bruto</th><th>Taxas</th><th>Frete</th><th>Líquido</th><th>Custo prod.</th><th>Lucro</th><th>% do bruto</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.canal}>
                <td className="font-medium">{CANAIS[l.canal]}</td>
                <td>{l.pedidos}</td>
                <td>{brl(l.bruto)}</td>
                <td>{brl(l.taxas)}</td>
                <td>{brl(l.frete)}</td>
                <td>{brl(l.liquido)}</td>
                <td>{brl(l.custo)}</td>
                <td className={l.lucro < 0 ? "text-red-600" : ""}>{brl(l.lucro)}</td>
                <td>{tot.bruto ? ((l.bruto / tot.bruto) * 100).toFixed(1) + "%" : "—"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td><td>{tot.pedidos}</td><td>{brl(tot.bruto)}</td><td>{brl(tot.taxas)}</td><td>{brl(tot.frete)}</td>
              <td>{brl(tot.liquido)}</td><td>{brl(tot.custo)}</td><td>{brl(tot.lucro)}</td><td></td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted mt-2">Vendas canceladas ou devolvidas não entram nos totais.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-medium mb-3">Entregas em aberto</h2>
          <p className="text-sm">
            <b>{aEnviar}</b> a enviar · <b>{enviados}</b> em trânsito
          </p>
          <Link href="/entregas" className="text-sm text-accent hover:underline">Ver entregas →</Link>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="font-medium mb-3">Entradas e saídas por categoria</h2>
          {movs.length === 0 ? (
            <p className="text-sm text-muted">Nada lançado neste mês.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {movs.map((m) => (
                  <tr key={m.tipo + m.categoria}>
                    <td>{m.categoria}</td>
                    <td className={m.tipo === "saida" ? "text-red-600 text-right" : "text-green-700 text-right"}>
                      {m.tipo === "saida" ? "−" : "+"}{brl(m.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub?: string; destaque?: "pos" | "neg" }) {
  const cor = destaque === "pos" ? "text-green-700" : destaque === "neg" ? "text-red-600" : "";
  return (
    <div className="card">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`text-xl font-semibold mt-1 ${cor}`}>{valor}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}
