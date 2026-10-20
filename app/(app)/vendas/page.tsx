import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, brl, dataBR, mesAtual, type Canal, type StatusEntrega } from "@/lib/constants";
import { intervaloMes, mesValido } from "@/components/MesFiltro";
import { VendaForm, type Venda } from "@/components/VendaForm";
import { StatusBadge } from "@/components/StatusBadge";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { Cabecalho, Truncado } from "@/components/ui";
import { Icone } from "@/components/Icone";
import { configCanais, opcoesProdutos } from "@/lib/produtos";
import { criarVenda, excluirVenda } from "../actions";

export const dynamic = "force-dynamic";

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string; canal?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const mes = mesValido(sp.mes, mesAtual());
  const canal = sp.canal && sp.canal in CANAIS ? sp.canal : null;
  const { ini, prox } = intervaloMes(mes);

  const [vendasR, produtos, canais] = await Promise.all([
    sql`SELECT v.*, EXISTS (SELECT 1 FROM venda_itens i WHERE i.venda_id = v.id AND i.produto_id IS NULL AND i.anuncio_id IS NOT NULL)
        AS sem_produto
      FROM vendas v
      WHERE data >= ${ini} AND data < ${prox} AND (${canal}::text IS NULL OR canal = ${canal})
      ORDER BY data DESC, id DESC`,
    opcoesProdutos(),
    configCanais(),
  ]);
  const vendas = vendasR as (Venda & { sem_produto: boolean })[];

  const ativas = vendas.filter((v) => v.status_entrega !== "cancelado" && v.status_entrega !== "devolvido");
  const bruto = ativas.reduce((a, v) => a + Number(v.valor_bruto), 0);
  const liquidoTot = ativas.reduce((a, v) => a + Number(v.valor_bruto) - Number(v.taxa_plataforma) - Number(v.frete) + Number(v.reembolso_frete), 0);
  const lucroTot = ativas.reduce((a, v) => a + Number(v.valor_bruto) - Number(v.taxa_plataforma) - Number(v.frete) + Number(v.reembolso_frete) - Number(v.custo_produto), 0);

  return (
    <>
      <Cabecalho titulo="Vendas" sub="Pedidos do Mercado Livre entram sozinhos. Lance aqui as vendas dos outros canais." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo titulo="Vendas no mês" valor={String(ativas.length)} />
        <Resumo titulo="Faturamento" valor={brl(bruto)} />
        <Resumo titulo="Líquido" valor={brl(liquidoTot)} />
        <Resumo titulo="Lucro (após custo dos produtos)" valor={brl(lucroTot)} />
      </section>

      <details className="card group p-0">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium sm:px-5">
          <Icone nome="mais" className="size-4 text-accent transition-transform group-open:rotate-45" />
          Lançar venda manual
        </summary>
        <div className="border-t border-border px-4 py-4 sm:px-5">
          <VendaForm action={criarVenda} produtos={produtos} canais={canais} />
        </div>
      </details>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 className="card-title">{vendas.length} registro{vendas.length === 1 ? "" : "s"}</h2>
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
              <th>Data</th><th>Canal</th><th>Pedido</th><th>Produto</th><th>Cliente</th><th className="text-right">Valor</th><th className="text-right">Líquido</th><th className="text-right">Lucro</th><th>Entrega</th><th></th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((v) => {
              const liquido = Number(v.valor_bruto) - Number(v.taxa_plataforma) - Number(v.frete) + Number(v.reembolso_frete);
              const lucro = liquido - Number(v.custo_produto);
              return (
                <tr key={v.id}>
                  <td className="whitespace-nowrap">{dataBR(v.data)}</td>
                  <td className="whitespace-nowrap">{CANAIS[v.canal as Canal]}</td>
                  <td className="whitespace-nowrap text-xs text-muted tabular-nums">{v.pedido_externo ?? "—"}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      {v.quantidade > 1 && <span className="badge shrink-0 bg-surface-2 text-muted">{v.quantidade}×</span>}
                      <Truncado texto={v.produto} />
                      {v.sem_produto && (
                        <Link href="/produtos/anuncios" className="badge shrink-0 bg-amber-400/20 text-amber-800 dark:text-amber-300" title="Anúncio sem produto vinculado: custo zerado">
                          sem produto
                        </Link>
                      )}
                      {v.frete_pendente && (
                        <span className="badge shrink-0 bg-amber-400/20 text-amber-800 dark:text-amber-300" title="Não foi possível obter o frete no ML">frete?</span>
                      )}
                    </span>
                  </td>
                  <td><Truncado texto={v.cliente} className="block max-w-[10rem] truncate" /></td>
                  <td className="whitespace-nowrap text-right tabular-nums">{brl(v.valor_bruto)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{brl(liquido)}</td>
                  <td className={`whitespace-nowrap text-right tabular-nums ${lucro < 0 ? "text-neg" : ""}`}>{brl(lucro)}</td>
                  <td><StatusBadge status={v.status_entrega as StatusEntrega} /></td>
                  <td className="whitespace-nowrap space-x-3">
                    <Link href={`/vendas/${v.id}`} className="text-xs text-accent hover:underline">Editar</Link>
                    <span className="inline-block"><ExcluirBotao action={excluirVenda.bind(null, v.id)} /></span>
                  </td>
                </tr>
              );
            })}
            {vendas.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted py-6">Nenhuma venda neste filtro.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
