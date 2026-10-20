import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { CORES, MODELOS, type Cor } from "@/lib/cores";
import { Cabecalho, Vazio } from "@/components/ui";
import { criarBoard } from "./actions";

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
      <Cabecalho titulo="Kanban" sub="Crie quantos boards quiser e monte as colunas do jeito que funciona para vocês." />

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
            <Vazio>Nenhum board ainda. Crie o primeiro abaixo — dá para começar de um modelo e mudar as colunas depois.</Vazio>
          </div>
        )}
      </div>

      <section className="card max-w-3xl">
        <h2 className="card-title mb-4">Novo board</h2>
        <form action={criarBoard} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span>Nome</span>
              <input name="nome" required maxLength={200} placeholder="Ex.: Pedidos da semana" />
            </label>
            <label className="field">
              <span>Descrição (opcional)</span>
              <input name="descricao" maxLength={500} />
            </label>
          </div>
          <div className="field">
            <span>Começar com as colunas</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(MODELOS).map(([k, m], i) => (
                <label key={k} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="modelo" value={k} defaultChecked={i === 0} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{m.nome}</span>
                    <span className="block text-xs text-muted">{m.colunas.length ? m.colunas.map((c) => c[0]).join(" → ") : "Você cria as colunas"}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Cor</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CORES) as Cor[]).map((c) => (
                <label key={c} className="cursor-pointer" title={CORES[c].nome}>
                  <input type="radio" name="cor" value={c} defaultChecked={c === "azul"} className="peer sr-only" />
                  <span className={`block size-6 rounded-full ${CORES[c].ponto} peer-checked:ring-2 peer-checked:ring-accent peer-checked:ring-offset-1 ring-offset-[var(--surface)]`} />
                </label>
              ))}
            </div>
          </div>
          <button className="btn">Criar board</button>
        </form>
      </section>
    </>
  );
}
