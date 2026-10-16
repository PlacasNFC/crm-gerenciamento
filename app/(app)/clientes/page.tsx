import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { formatarDocumento } from "@/lib/fiscal";
import { BotaoLink, Cabecalho, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

type Linha = { id: number; nome: string; documento: string | null; email: string | null; telefone: string | null; municipio: string | null; uf: string | null; vendas: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await ensureSchema();
  const q = (await searchParams).q?.trim() ?? "";
  const like = `%${q}%`;
  const digitos = q.replace(/\D/g, "");
  const docLike = digitos ? `%${digitos}%` : null;
  const rows = (await sql`SELECT c.*, (SELECT COUNT(*) FROM vendas v WHERE v.cliente_id = c.id) AS vendas
    FROM clientes c
    WHERE ${q} = '' OR c.nome ILIKE ${like} OR c.email ILIKE ${like} OR (${docLike}::text IS NOT NULL AND c.documento LIKE ${docLike})
    ORDER BY c.nome LIMIT 500`) as Linha[];

  return (
    <>
      <Cabecalho titulo="Clientes" sub={`${rows.length} cadastrados${q ? " no filtro" : ""}`}>
        <BotaoLink href="/clientes/novo">+ Incluir cliente</BotaoLink>
      </Cabecalho>
      <form className="flex gap-2 max-w-md">
        <input name="q" defaultValue={q} placeholder="Buscar por nome, e-mail ou CPF/CNPJ" />
        <button className="btn-ghost">Buscar</button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Contato</th><th>Cidade</th><th className="num">Vendas</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/clientes/${c.id}`} className="text-accent hover:underline">{c.nome}</Link></td>
                <td className="whitespace-nowrap">{formatarDocumento(c.documento) || "—"}</td>
                <td>{[c.email, c.telefone].filter(Boolean).join(" · ") || "—"}</td>
                <td>{c.municipio ? `${c.municipio}/${c.uf ?? ""}` : "—"}</td>
                <td className="num">{c.vendas}</td>
              </tr>
            ))}
            {rows.length === 0 && <Vazio colunas={5}>Nenhum cliente encontrado.</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
