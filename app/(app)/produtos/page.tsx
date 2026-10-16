import Link from "next/link";
import { sql } from "@/lib/db";
import { brl } from "@/lib/constants";
import { Abas, BotaoLink, Cabecalho, Tag, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

type Linha = { id: number; sku: string; nome: string; ncm: string | null; unidade: string; preco_venda: string; saldo: number; estoque_minimo: string; ativo: boolean };

export default async function Produtos({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const f = sp.f === "inativos" ? "inativos" : "ativos";
  const like = `%${q}%`;
  const rows = (await sql`SELECT p.*, COALESCE(s.saldo, 0)::float AS saldo
    FROM produtos p LEFT JOIN (SELECT produto_id, SUM(quantidade) AS saldo FROM estoque_movs GROUP BY produto_id) s ON s.produto_id = p.id
    WHERE p.ativo = ${f === "ativos"} AND (${q} = '' OR p.nome ILIKE ${like} OR p.sku ILIKE ${like} OR p.gtin = ${q})
    ORDER BY p.nome LIMIT 500`) as Linha[];

  return (
    <>
      <Cabecalho titulo="Produtos" sub={`${rows.length} produtos`}>
        <BotaoLink href="/produtos/novo">+ Incluir produto</BotaoLink>
      </Cabecalho>
      <Abas atual={f} itens={[{ chave: "ativos", label: "Ativos", href: "/produtos" }, { chave: "inativos", label: "Inativos", href: "/produtos?f=inativos" }]} />
      <form className="flex gap-2 max-w-md">
        <input type="hidden" name="f" value={f} />
        <input name="q" defaultValue={q} placeholder="Buscar por descrição, código ou EAN" />
        <button className="btn-ghost">Buscar</button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Código</th><th>Descrição</th><th>NCM</th><th className="num">Preço</th><th className="num">Estoque</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{p.sku}</td>
                <td><Link href={`/produtos/${p.id}`} className="text-accent hover:underline">{p.nome}</Link></td>
                <td>{p.ncm ?? <Tag cor="amarela">sem NCM</Tag>}</td>
                <td className="num">{brl(p.preco_venda)}</td>
                <td className="num">
                  {p.saldo.toLocaleString("pt-BR")} {p.unidade}
                  {p.saldo <= Number(p.estoque_minimo) && <> <Tag cor="vermelha">baixo</Tag></>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <Vazio colunas={5}>Nenhum produto. Cadastre para controlar estoque e ter NCM pronto na hora de emitir a nota.</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
