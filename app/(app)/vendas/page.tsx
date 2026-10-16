import Link from "next/link";
import { sql } from "@/lib/db";
import { CANAIS, brl, dataBR, type Canal } from "@/lib/constants";
import { intervaloMes, mesValido } from "@/lib/periodo";
import { BotaoLink, Cabecalho, StatusBadge, Tag, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

type Linha = {
  id: number; data: string; canal: Canal; pedido_externo: string | null; cliente: string | null; produto: string;
  valor_bruto: string; liquido: string; status_entrega: string; nota_numero: number | null; nota_id: number | null;
};

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string; canal?: string; nf?: string; q?: string }> }) {
  const sp = await searchParams;
  const mes = mesValido(sp.mes);
  const canal = sp.canal && sp.canal in CANAIS ? sp.canal : null;
  const nf = sp.nf === "sem" || sp.nf === "com" ? sp.nf : null;
  const q = sp.q?.trim() ?? "";
  const { ini, prox } = intervaloMes(mes);

  const rows = (await sql`SELECT v.id, v.data, v.canal, v.pedido_externo, v.cliente, v.produto, v.valor_bruto,
      v.valor_bruto - v.taxa_plataforma - v.frete AS liquido, v.status_entrega, n.numero AS nota_numero, n.id AS nota_id
    FROM vendas v
    LEFT JOIN LATERAL (SELECT id, numero FROM notas_fiscais WHERE venda_id = v.id AND status = 'autorizada' ORDER BY id DESC LIMIT 1) n ON true
    WHERE v.data >= ${ini} AND v.data < ${prox}
      AND (${canal}::text IS NULL OR v.canal = ${canal})
      AND (${nf}::text IS NULL OR (${nf} = 'com') = (n.id IS NOT NULL))
      AND (${q} = '' OR v.produto ILIKE ${"%" + q + "%"} OR v.cliente ILIKE ${"%" + q + "%"} OR v.pedido_externo = ${q} OR v.id::text = ${q})
    ORDER BY v.data DESC, v.id DESC`) as Linha[];

  const ativos = rows.filter((r) => !["cancelado", "devolvido"].includes(r.status_entrega));
  const total = ativos.reduce((a, r) => a + Number(r.valor_bruto), 0);

  return (
    <>
      <Cabecalho titulo="Pedidos de venda" sub={`${rows.length} pedidos · ${brl(total)} em vendas ativas`}>
        <BotaoLink href="/vendas/nova">+ Incluir pedido</BotaoLink>
      </Cabecalho>
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <label className="field"><span>Mês</span><input type="month" name="mes" defaultValue={mes} /></label>
        <label className="field"><span>Canal</span>
          <select name="canal" defaultValue={canal ?? ""}>
            <option value="">Todos</option>
            {Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Nota fiscal</span>
          <select name="nf" defaultValue={nf ?? ""}>
            <option value="">Todas</option>
            <option value="sem">Sem nota</option>
            <option value="com">Com nota</option>
          </select>
        </label>
        <label className="field"><span>Busca</span><input name="q" defaultValue={q} placeholder="Produto, cliente, nº" /></label>
        <button className="btn-ghost">Filtrar</button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Nº</th><th>Data</th><th>Canal</th><th>Cliente</th><th>Itens</th><th className="num">Total</th><th className="num">Líquido</th><th>Entrega</th><th>NF</th></tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/vendas/${v.id}`} className="text-accent hover:underline">#{v.id}</Link></td>
                <td className="whitespace-nowrap">{dataBR(v.data)}</td>
                <td className="whitespace-nowrap">{CANAIS[v.canal] ?? v.canal}{v.pedido_externo && <span className="block text-xs text-muted">{v.pedido_externo}</span>}</td>
                <td>{v.cliente ?? "—"}</td>
                <td>{v.produto}</td>
                <td className="num">{brl(v.valor_bruto)}</td>
                <td className="num">{brl(v.liquido)}</td>
                <td><StatusBadge status={v.status_entrega} /></td>
                <td>{v.nota_id ? <Link href={`/notas/${v.nota_id}`} className="btn-link">{v.nota_numero}</Link> : <Tag cor="cinza">sem NF</Tag>}</td>
              </tr>
            ))}
            {rows.length === 0 && <Vazio colunas={9}>Nenhum pedido neste filtro.</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
