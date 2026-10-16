import Link from "next/link";
import { linhas, sql } from "@/lib/db";
import { CANAIS, STATUS_ENTREGA, dataBR, type Canal } from "@/lib/constants";
import { ActionForm } from "@/components/ActionForm";
import { Abas, Cabecalho, StatusBadge, Vazio } from "@/components/ui";
import { atualizarEntrega } from "./actions";

export const dynamic = "force-dynamic";

const FILTROS = { abertas: "Em aberto", entregue: "Entregues", todas: "Todas" } as const;
type Linha = { id: number; data: string; canal: Canal; pedido_externo: string | null; cliente: string | null; produto: string; status_entrega: string; codigo_rastreio: string | null; dias: number };

export default async function Entregas({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const raw = (await searchParams).f;
  const f: keyof typeof FILTROS = raw === "entregue" || raw === "todas" ? raw : "abertas";
  const rows = await linhas<Linha>(
    f === "abertas"
      ? sql`SELECT id, data, canal, pedido_externo, cliente, produto, status_entrega, codigo_rastreio,
          ((now() AT TIME ZONE 'America/Sao_Paulo')::date - data)::int AS dias
          FROM vendas WHERE status_entrega IN ('a_enviar','enviado') ORDER BY data, id`
      : sql`SELECT id, data, canal, pedido_externo, cliente, produto, status_entrega, codigo_rastreio,
          ((now() AT TIME ZONE 'America/Sao_Paulo')::date - data)::int AS dias
          FROM vendas WHERE ${f} = 'todas' OR status_entrega = 'entregue' ORDER BY data DESC, id DESC LIMIT 300`,
  );

  return (
    <>
      <Cabecalho titulo="Entregas" sub={f === "abertas" ? `${rows.length} pedidos para enviar ou em trânsito` : undefined} />
      <Abas atual={f} itens={Object.entries(FILTROS).map(([k, v]) => ({ chave: k, label: v, href: `/entregas?f=${k}` }))} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Pedido</th><th>Data</th><th>Canal</th><th>Cliente</th><th>Itens</th><th>Status</th><th>Atualizar</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/vendas/${v.id}`} className="text-accent hover:underline">#{v.id}</Link></td>
                <td className="whitespace-nowrap">
                  {dataBR(v.data)}
                  {v.status_entrega === "a_enviar" && v.dias >= 2 && <span className="block text-xs text-neg">há {v.dias} dias</span>}
                </td>
                <td className="whitespace-nowrap">{CANAIS[v.canal] ?? v.canal}{v.pedido_externo && <span className="block text-xs text-muted">{v.pedido_externo}</span>}</td>
                <td>{v.cliente ?? "—"}</td>
                <td>{v.produto}</td>
                <td><StatusBadge status={v.status_entrega} /></td>
                <td>
                  <ActionForm action={atualizarEntrega} className="flex gap-2 items-center min-w-[22rem]">
                    <input type="hidden" name="id" value={v.id} />
                    <select name="status_entrega" defaultValue={v.status_entrega} className="w-32" aria-label="Status">
                      {Object.entries(STATUS_ENTREGA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input name="codigo_rastreio" placeholder="Rastreio" defaultValue={v.codigo_rastreio ?? ""} aria-label="Código de rastreio" />
                    <button className="btn-ghost">OK</button>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <Vazio colunas={7}>Nenhuma entrega aqui.</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
