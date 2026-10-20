import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { pecasDaVenda, pecasDoTitulo } from "@/lib/pecas";
import { ajustesPecas } from "@/lib/pecas-db";
import { Cabecalho, Vazio } from "@/components/ui";
import { Icone } from "@/components/Icone";
import { salvarPecas } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Pecas({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  await ensureSchema();
  const salvo = (await searchParams).salvo;
  const [linhasR, ajustes] = await Promise.all([
    sql`SELECT produto, COUNT(*)::int AS pedidos, SUM(quantidade)::int AS unidades FROM vendas
        WHERE status_entrega NOT IN ('cancelado','devolvido') AND produto !~ '^[0-9]+× '
        GROUP BY produto ORDER BY pedidos DESC`,
    ajustesPecas(),
  ]);
  const linhas = linhasR as { produto: string; pedidos: number; unidades: number }[];

  return (
    <>
      <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <Icone nome="esquerda" className="size-3.5" /> Vendas
      </Link>
      <Cabecalho
        titulo="Peças por anúncio"
        sub="Quantas peças vêm em cada anúncio. O sistema lê do título (“Kit 5”, “01 Unidade”…); corrija aqui quando errar."
      />
      {salvo && <p className="card text-sm text-pos">Ajustes salvos.</p>}

      {linhas.length === 0 ? (
        <Vazio>Nenhuma venda ainda.</Vazio>
      ) : (
        <form action={salvarPecas} className="card space-y-4">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th className="text-right">Vendas</th>
                  <th className="text-right">Unid. vendidas</th>
                  <th>Peças por unidade</th>
                  <th className="text-right">Peças vendidas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const detectado = pecasDoTitulo(l.produto);
                  const ajuste = ajustes.get(l.produto);
                  return (
                    <tr key={l.produto}>
                      <td className="max-w-0 w-full">
                        <span className="block truncate" title={l.produto}>{l.produto}</span>
                      </td>
                      <td className="text-right tabular-nums">{l.pedidos}</td>
                      <td className="text-right tabular-nums">{l.unidades}</td>
                      <td className="whitespace-nowrap">
                        <input type="hidden" name="produto" value={l.produto} />
                        <input
                          type="number"
                          name="pecas"
                          min={1}
                          max={1000}
                          defaultValue={ajuste ?? detectado ?? 1}
                          className="w-20 py-1 text-right"
                        />
                        <span className="ml-2 text-xs text-muted">
                          {ajuste ? "ajustado" : detectado ? "do título" : "padrão"}
                        </span>
                      </td>
                      <td className="text-right font-medium tabular-nums">{pecasDaVenda(l.produto, l.unidades, ajustes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn">Salvar</button>
        </form>
      )}
    </>
  );
}
