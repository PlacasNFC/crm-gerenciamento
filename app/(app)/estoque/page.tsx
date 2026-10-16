import Link from "next/link";
import { linhas, sql, ensureSchema } from "@/lib/db";
import { brl } from "@/lib/constants";
import { Abas, Cabecalho, Kpi, Tag, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

type Linha = { id: number; sku: string; nome: string; unidade: string; custo: string; preco_venda: string; estoque_minimo: string; saldo: number; vendidos30: number };

export default async function Estoque({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await ensureSchema();
  const f = (await searchParams).f === "baixo" ? "baixo" : "todos";
  const rows = await linhas<Linha>(sql`SELECT p.id, p.sku, p.nome, p.unidade, p.custo, p.preco_venda, p.estoque_minimo,
      COALESCE((SELECT SUM(quantidade) FROM estoque_movs m WHERE m.produto_id = p.id), 0)::float AS saldo,
      COALESCE((SELECT -SUM(quantidade) FROM estoque_movs m WHERE m.produto_id = p.id AND m.venda_id IS NOT NULL
        AND m.data >= now() - interval '30 days'), 0)::float AS vendidos30
    FROM produtos p WHERE p.ativo ORDER BY p.nome`);
  const baixos = rows.filter((r) => r.saldo <= Number(r.estoque_minimo));
  const lista = f === "baixo" ? baixos : rows;
  const valorCusto = rows.reduce((a, r) => a + Math.max(r.saldo, 0) * Number(r.custo), 0);
  const valorVenda = rows.reduce((a, r) => a + Math.max(r.saldo, 0) * Number(r.preco_venda), 0);

  return (
    <>
      <Cabecalho titulo="Estoque" sub="Saldo atualizado a cada venda. Ajustes e entradas pelo cadastro do produto." />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Produtos ativos" valor={String(rows.length)} />
        <Kpi titulo="Abaixo do mínimo" valor={String(baixos.length)} tom={baixos.length ? "neg" : undefined} />
        <Kpi titulo="Estoque a custo" valor={brl(valorCusto)} />
        <Kpi titulo="Estoque a preço de venda" valor={brl(valorVenda)} />
      </div>
      <Abas atual={f} itens={[{ chave: "todos", label: "Todos", href: "/estoque" }, { chave: "baixo", label: `Estoque baixo (${baixos.length})`, href: "/estoque?f=baixo" }]} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Código</th><th>Produto</th><th className="num">Saldo</th><th className="num">Mínimo</th><th className="num">Vendidos 30d</th><th className="num">Cobertura</th></tr></thead>
          <tbody>
            {lista.map((r) => {
              const porDia = r.vendidos30 / 30;
              const dias = porDia > 0 ? Math.floor(Math.max(r.saldo, 0) / porDia) : null;
              return (
                <tr key={r.id}>
                  <td>{r.sku}</td>
                  <td><Link href={`/produtos/${r.id}`} className="text-accent hover:underline">{r.nome}</Link></td>
                  <td className={`num ${r.saldo < 0 ? "text-neg" : ""}`}>{r.saldo.toLocaleString("pt-BR")} {r.unidade}{r.saldo <= Number(r.estoque_minimo) && <> <Tag cor="vermelha">baixo</Tag></>}</td>
                  <td className="num">{Number(r.estoque_minimo).toLocaleString("pt-BR")}</td>
                  <td className="num">{r.vendidos30.toLocaleString("pt-BR")}</td>
                  <td className="num">{dias === null ? "—" : `${dias} dias`}</td>
                </tr>
              );
            })}
            {lista.length === 0 && <Vazio colunas={6}>{f === "baixo" ? "Nenhum produto abaixo do mínimo." : "Cadastre produtos para controlar o estoque."}</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
