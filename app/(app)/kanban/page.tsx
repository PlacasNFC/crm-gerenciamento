import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CORES, type Cor } from "@/lib/cores";
import { Cabecalho, Vazio } from "@/components/ui";
import { NovoBoard } from "@/components/NovoBoard";

export const dynamic = "force-dynamic";

type BoardResumo = { id: number; nome: string; descricao: string | null; cor: Cor; colunas: { nome: string; cor: Cor; n: number }[]; total: number };

export default async function Kanban() {
  await ensureSchema();
  const boards = (await sql`SELECT b.id, b.nome, b.descricao, b.cor,
      COALESCE(json_agg(json_build_object('nome', c.nome, 'cor', c.cor, 'n',
        (SELECT COUNT(*) FROM kanban_cards k WHERE k.coluna_id = c.id)) ORDER BY c.posicao) FILTER (WHERE c.id IS NOT NULL), '[]') AS colunas,
      (SELECT COUNT(*)::int FROM kanban_cards k JOIN kanban_colunas c2 ON c2.id = k.coluna_id WHERE c2.board_id = b.id) AS total
    FROM kanban_boards b LEFT JOIN kanban_colunas c ON c.board_id = b.id
    GROUP BY b.id ORDER BY b.posicao, b.id`) as BoardResumo[];

  return (
    <>
      <Cabecalho titulo="Kanban" sub="Crie quantos boards quiser e monte as colunas do jeito que funciona para vocês.">
        <NovoBoard abrirDeCara={boards.length === 0} />
      </Cabecalho>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((b) => (
          <Link key={b.id} href={`/kanban/${b.id}`} className="card group block overflow-hidden p-0 hover:border-accent">
            <div className={`h-1.5 ${CORES[b.cor]?.faixa ?? "bg-slate-400"}`} />
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-semibold group-hover:text-accent">{b.nome}</h2>
                <span className="shrink-0 text-xs text-muted">{b.total} card{b.total === 1 ? "" : "s"}</span>
              </div>
              {b.descricao && <p className="mt-1 line-clamp-2 break-words text-sm text-muted">{b.descricao}</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {b.colunas.map((c, i) => (
                  <span key={i} className={`badge ${CORES[c.cor]?.suave ?? ""}`}>
                    {c.nome} · {c.n}
                  </span>
                ))}
                {b.colunas.length === 0 && <span className="text-xs text-muted">Sem colunas ainda</span>}
              </div>
            </div>
          </Link>
        ))}
        {boards.length === 0 && (
          <div className="sm:col-span-2 xl:col-span-3">
            <Vazio>Nenhum board ainda. Clique em “Novo board” — dá para começar de um modelo e mudar as colunas depois.</Vazio>
          </div>
        )}
      </div>

    </>
  );
}
