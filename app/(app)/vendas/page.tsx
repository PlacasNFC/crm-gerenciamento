import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, brl, dataBR, mesAtual, type Canal, type StatusEntrega } from "@/lib/constants";
import { intervaloMes, mesValido } from "@/components/MesFiltro";
import { VendaForm, type Venda } from "@/components/VendaForm";
import { StatusBadge } from "@/components/StatusBadge";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { criarVenda, excluirVenda } from "../actions";

export const dynamic = "force-dynamic";

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string; canal?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const mes = mesValido(sp.mes, mesAtual());
  const canal = sp.canal && sp.canal in CANAIS ? sp.canal : null;
  const { ini, prox } = intervaloMes(mes);

  const vendas = (await sql`SELECT * FROM vendas
    WHERE data >= ${ini} AND data < ${prox} AND (${canal}::text IS NULL OR canal = ${canal})
    ORDER BY data DESC, id DESC`) as Venda[];

  return (
    <>
      <h1 className="text-2xl font-semibold">Vendas</h1>

      <section className="card">
        <h2 className="font-medium mb-3">Nova venda</h2>
        <VendaForm action={criarVenda} />
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 className="font-medium">{vendas.length} vendas no mês</h2>
          <form action="/vendas" className="flex flex-wrap items-end gap-2">
            <label className="field">
              <span>Mês</span>
              <input type="month" name="mes" defaultValue={mes} />
            </label>
            <label className="field">
              <span>Canal</span>
              <select name="canal" defaultValue={canal ?? ""}>
                <option value="">Todos</option>
                {Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="btn-ghost">Filtrar</button>
          </form>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Data</th><th>Canal</th><th>Pedido</th><th>Produto</th><th>Cliente</th><th>Valor</th><th>Líquido</th><th>Entrega</th><th></th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((v) => {
              const liquido = Number(v.valor_bruto) - Number(v.taxa_plataforma) - Number(v.frete);
              return (
                <tr key={v.id}>
                  <td className="whitespace-nowrap">{dataBR(v.data)}</td>
                  <td className="whitespace-nowrap">{CANAIS[v.canal as Canal]}</td>
                  <td>{v.pedido_externo ?? "—"}</td>
                  <td>{v.quantidade > 1 ? `${v.quantidade}× ` : ""}{v.produto}</td>
                  <td>{v.cliente ?? "—"}</td>
                  <td className="whitespace-nowrap">{brl(v.valor_bruto)}</td>
                  <td className="whitespace-nowrap">{brl(liquido)}</td>
                  <td><StatusBadge status={v.status_entrega as StatusEntrega} /></td>
                  <td className="whitespace-nowrap space-x-3">
                    <Link href={`/vendas/${v.id}`} className="text-xs text-accent hover:underline">Editar</Link>
                    <span className="inline-block"><ExcluirBotao action={excluirVenda.bind(null, v.id)} /></span>
                  </td>
                </tr>
              );
            })}
            {vendas.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted py-6">Nenhuma venda neste filtro.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
