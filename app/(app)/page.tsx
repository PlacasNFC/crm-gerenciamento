import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { brl, hoje } from "@/lib/constants";
import { Cabecalho, Kpi, Truncado, Vazio } from "@/components/ui";
import { BarrasHorizontais, GraficoDiario, type Dia } from "@/components/GraficoDiario";

export const dynamic = "force-dynamic";

const PERIODOS = { "7": "7 dias", "30": "30 dias", "90": "90 dias" } as const;
const CANAL = "mercado_livre";
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const somaDias = (d: string, n: number) => {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const variacao = (atual: number, anterior: number) => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);

export default async function Painel({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await ensureSchema();
  const pRaw = (await searchParams).p;
  const p = pRaw && pRaw in PERIODOS ? (pRaw as keyof typeof PERIODOS) : "30";
  const n = Number(p);
  const fim = hoje();
  const ini = somaDias(fim, -(n - 1));
  const iniAnt = somaDias(ini, -n);

  const [diasR, antR, cancR, topR, pendR, mlR] = await Promise.all([
    sql`WITH dias AS (SELECT generate_series(${ini}::date, ${fim}::date, interval '1 day')::date AS d)
        SELECT to_char(d, 'YYYY-MM-DD') AS dia, COUNT(v.id)::int AS pedidos, COALESCE(SUM(v.quantidade), 0)::int AS unidades,
          COALESCE(SUM(v.valor_bruto), 0)::float AS bruto, COALESCE(SUM(v.taxa_plataforma), 0)::float AS taxas,
          COALESCE(SUM(v.frete), 0)::float AS frete
        FROM dias LEFT JOIN vendas v ON v.data = dias.d AND v.canal = ${CANAL} AND v.status_entrega NOT IN ('cancelado','devolvido')
        GROUP BY d ORDER BY d`,
    sql`SELECT COUNT(*)::int AS pedidos, COALESCE(SUM(valor_bruto), 0)::float AS bruto,
          COALESCE(SUM(valor_bruto - taxa_plataforma - frete), 0)::float AS liquido
        FROM vendas WHERE canal = ${CANAL} AND data >= ${iniAnt} AND data < ${ini} AND status_entrega NOT IN ('cancelado','devolvido')`,
    sql`SELECT COUNT(*)::int AS n FROM vendas WHERE canal = ${CANAL} AND data >= ${ini} AND status_entrega IN ('cancelado','devolvido')`,
    sql`SELECT produto, SUM(quantidade)::int AS unidades, COUNT(*)::int AS pedidos, SUM(valor_bruto)::float AS bruto
        FROM vendas WHERE canal = ${CANAL} AND data >= ${ini} AND status_entrega NOT IN ('cancelado','devolvido')
        GROUP BY produto ORDER BY bruto DESC LIMIT 5`,
    sql`SELECT status_entrega, COUNT(*)::int AS n, MIN(data)::text AS mais_antiga FROM vendas
        WHERE status_entrega IN ('a_enviar','enviado') GROUP BY status_entrega`,
    sql`SELECT conta_nome, ultima_sync, ultimo_erro FROM integracoes WHERE provedor = ${CANAL}`,
  ]);
  const dias = diasR as Dia[];
  const ant = (antR as { pedidos: number; bruto: number; liquido: number }[])[0];
  const cancelados = (cancR as { n: number }[])[0].n;
  const top = topR as { produto: string; unidades: number; pedidos: number; bruto: number }[];
  const pend = pendR as { status_entrega: string; n: number; mais_antiga: string }[];
  const ml = (mlR as { conta_nome: string | null; ultima_sync: Date | null; ultimo_erro: string | null }[])[0];

  const tot = dias.reduce(
    (a, d) => ({ pedidos: a.pedidos + d.pedidos, unidades: a.unidades + d.unidades, bruto: a.bruto + d.bruto, taxas: a.taxas + d.taxas, frete: a.frete + d.frete }),
    { pedidos: 0, unidades: 0, bruto: 0, taxas: 0, frete: 0 },
  );
  const liquido = tot.bruto - tot.taxas - tot.frete;
  const ticket = tot.pedidos ? tot.bruto / tot.pedidos : 0;
  const tarifaPct = tot.bruto ? (tot.taxas / tot.bruto) * 100 : 0;
  const hojeD = dias[dias.length - 1];
  const ontem = dias[dias.length - 2];
  const melhor = dias.reduce((m, d) => (d.bruto > m.bruto ? d : m), dias[0]);

  // média de faturamento por dia da semana no período
  const semana = DIAS_SEMANA.map((rotulo, i) => {
    const ds = dias.filter((d) => new Date(d.dia + "T12:00:00").getDay() === i);
    const soma = ds.reduce((a, d) => a + d.bruto, 0);
    const ped = ds.reduce((a, d) => a + d.pedidos, 0);
    return { rotulo, valor: ds.length ? soma / ds.length : 0, sub: ds.length ? `${(ped / ds.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ped.` : undefined };
  });

  const aEnviar = pend.find((x) => x.status_entrega === "a_enviar");
  const emTransito = pend.find((x) => x.status_entrega === "enviado");
  const diasParado = aEnviar ? Math.floor((Date.now() - new Date(aEnviar.mais_antiga + "T12:00:00").getTime()) / 864e5) : 0;
  const dataCurta = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <>
      <Cabecalho
        titulo="Painel"
        sub={
          <span className="inline-flex items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "var(--ml)", color: "var(--ml-fg)" }}>
              Mercado Livre
            </span>
            {ml ? (
              <>
                {ml.conta_nome}
                {ml.ultima_sync && ` · atualizado ${new Date(ml.ultima_sync).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`}
              </>
            ) : (
              <Link href="/integracoes" className="text-accent hover:underline">conectar conta</Link>
            )}
          </span>
        }
      >
        <nav className="tabs">
          {Object.entries(PERIODOS).map(([k, v]) => (
            <Link key={k} href={`/?p=${k}`} data-ativo={p === k}>{v}</Link>
          ))}
        </nav>
      </Cabecalho>

      {ml?.ultimo_erro && (
        <p className="card border-red-300 text-sm text-neg">
          Última importação do Mercado Livre falhou: {ml.ultimo_erro} · <Link href="/integracoes" className="underline">ver integração</Link>
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          titulo="Hoje"
          valor={brl(hojeD.bruto)}
          sub={<>{hojeD.pedidos} pedido{hojeD.pedidos === 1 ? "" : "s"} · ontem {brl(ontem?.bruto ?? 0)}</>}
        />
        <Kpi titulo={`Faturamento · ${PERIODOS[p]}`} valor={brl(tot.bruto)} delta={variacao(tot.bruto, ant.bruto)} sub="vs. período anterior" />
        <Kpi
          titulo="Líquido (após tarifas e frete)"
          valor={brl(liquido)}
          delta={variacao(liquido, ant.liquido)}
          sub={`tarifa média ${tarifaPct.toFixed(1)}%`}
          destaque="pos"
        />
        <Kpi
          titulo="Pedidos"
          valor={String(tot.pedidos)}
          delta={variacao(tot.pedidos, ant.pedidos)}
          sub={`ticket médio ${brl(ticket)}${cancelados ? ` · ${cancelados} cancelado${cancelados === 1 ? "" : "s"}` : ""}`}
        />
      </section>

      <section className="card">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="card-title">Vendas por dia</h2>
          {melhor.bruto > 0 && (
            <p className="text-xs text-muted">
              Melhor dia: <b className="text-fg">{dataCurta(melhor.dia)}</b> com {brl(melhor.bruto)} ({melhor.pedidos} pedidos)
            </p>
          )}
        </div>
        <GraficoDiario dias={dias} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2 min-w-0">
          <h2 className="card-title mb-3">Mais vendidos · {PERIODOS[p]}</h2>
          {top.length === 0 ? (
            <Vazio>Nenhuma venda no período.</Vazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr><th>Produto</th><th className="text-right">Unid.</th><th className="text-right">Pedidos</th><th className="text-right">Faturamento</th><th className="text-right">% do total</th></tr>
                </thead>
                <tbody>
                  {top.map((t) => (
                    <tr key={t.produto}>
                      <td className="max-w-0 w-full"><Truncado texto={t.produto} className="block truncate" /></td>
                      <td className="text-right tabular-nums">{t.unidades}</td>
                      <td className="text-right tabular-nums">{t.pedidos}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{brl(t.bruto)}</td>
                      <td className="text-right tabular-nums">{tot.bruto ? ((t.bruto / tot.bruto) * 100).toFixed(0) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title mb-3">Média por dia da semana</h2>
          <BarrasHorizontais itens={semana} />
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/entregas" className="card block hover:border-accent">
          <p className="text-xs font-medium text-muted">A enviar</p>
          <p className="mt-1.5 text-2xl font-semibold">{aEnviar?.n ?? 0}</p>
          <p className={`mt-1 text-xs ${diasParado >= 2 ? "text-neg font-medium" : "text-muted"}`}>
            {aEnviar ? `mais antigo há ${diasParado} dia${diasParado === 1 ? "" : "s"}` : "tudo despachado"}
          </p>
        </Link>
        <Link href="/entregas" className="card block hover:border-accent">
          <p className="text-xs font-medium text-muted">Em trânsito</p>
          <p className="mt-1.5 text-2xl font-semibold">{emTransito?.n ?? 0}</p>
          <p className="mt-1 text-xs text-muted">aguardando entrega</p>
        </Link>
        <div className="card">
          <p className="text-xs font-medium text-muted">Unidades vendidas · {PERIODOS[p]}</p>
          <p className="mt-1.5 text-2xl font-semibold">{tot.unidades}</p>
          <p className="mt-1 text-xs text-muted">média de {(tot.unidades / n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia</p>
        </div>
      </section>
    </>
  );
}
