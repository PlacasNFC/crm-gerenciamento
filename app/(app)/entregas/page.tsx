import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, STATUS_ENTREGA, dataBR, type Canal, type StatusEntrega } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import type { Venda } from "@/components/VendaForm";
import { Cabecalho, Truncado } from "@/components/ui";
import { atualizarEntrega } from "../actions";

export const dynamic = "force-dynamic";

const FILTROS = { abertas: "Em aberto", entregue: "Entregues", todas: "Todas" } as const;

export default async function Entregas({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await ensureSchema();
  const f = ((await searchParams).f ?? "abertas") as keyof typeof FILTROS;
  const vendas = (await (f === "todas"
    ? sql`SELECT * FROM vendas ORDER BY data DESC, id DESC LIMIT 300`
    : f === "entregue"
      ? sql`SELECT * FROM vendas WHERE status_entrega = 'entregue' ORDER BY data DESC, id DESC LIMIT 300`
      : sql`SELECT * FROM vendas WHERE status_entrega IN ('a_enviar','enviado') ORDER BY data ASC, id ASC`)) as Venda[];

  return (
    <>
      <Cabecalho titulo="Entregas" sub="Pedidos do Mercado Livre atualizam sozinhos pelo status do envio.">
        <nav className="tabs">
          {Object.entries(FILTROS).map(([k, v]) => (
            <Link key={k} href={`/entregas?f=${k}`} data-ativo={f === k}>{v}</Link>
          ))}
        </nav>
      </Cabecalho>

      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Data</th><th>Canal</th><th>Pedido</th><th>Produto</th><th>Cliente</th><th>Status</th><th>Atualizar</th></tr>
          </thead>
          <tbody>
            {vendas.map((v) => {
              const dias = Math.floor((Date.now() - new Date(String(v.data).slice(0, 10) + "T12:00:00").getTime()) / 864e5);
              return (
                <tr key={v.id}>
                  <td className="whitespace-nowrap">
                    {dataBR(v.data)}
                    {v.status_entrega === "a_enviar" && dias >= 2 && (
                      <span className="block text-xs font-medium text-neg">há {dias} dias</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{CANAIS[v.canal as Canal]}</td>
                  <td className="whitespace-nowrap text-xs text-muted tabular-nums">{v.pedido_externo ?? "—"}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      {v.quantidade > 1 && <span className="badge shrink-0 bg-surface-2 text-muted">{v.quantidade}×</span>}
                      <Truncado texto={v.produto} />
                    </span>
                  </td>
                  <td><Truncado texto={v.cliente} className="block max-w-[10rem] truncate" /></td>
                  <td><StatusBadge status={v.status_entrega as StatusEntrega} /></td>
                  <td>
                    <form action={atualizarEntrega.bind(null, v.id)} className="flex gap-2 items-center">
                      <select name="status_entrega" defaultValue={v.status_entrega} className="py-1">
                        {Object.entries(STATUS_ENTREGA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <input name="codigo_rastreio" placeholder="Rastreio" defaultValue={v.codigo_rastreio ?? ""} className="py-1 w-36" />
                      <button className="btn-ghost">OK</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {vendas.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-6">Nenhuma entrega aqui.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
