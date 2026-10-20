import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { brl } from "@/lib/constants";
import { STATUS_IDEIA, type StatusIdeia } from "@/lib/ideias";
import { Cabecalho, Vazio } from "@/components/ui";
import { Icone } from "@/components/Icone";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { atualizarIdeia, criarIdeia, excluirIdeia, ideiaParaKanban, mudarStatusIdeia, votarIdeia } from "./actions";

export const dynamic = "force-dynamic";

type Ideia = {
  id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: StatusIdeia;
  votos: number;
  custo_estimado: string | null;
  preco_estimado: string | null;
  link: string | null;
  autor: string | null;
  created_at: Date;
};

const ORDENS = { votos: "Mais votadas", recentes: "Mais recentes" } as const;

export default async function Ideias({ searchParams }: { searchParams: Promise<{ s?: string; o?: string; c?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const status = sp.s && sp.s in STATUS_IDEIA ? (sp.s as StatusIdeia) : sp.s === "todas" ? "todas" : "ativas";
  const ordem = sp.o === "recentes" ? "recentes" : "votos";
  const categoria = sp.c || null;

  const [todasR, boardsR] = await Promise.all([
    sql`SELECT * FROM ideias ORDER BY created_at DESC`,
    sql`SELECT id, nome FROM kanban_boards ORDER BY posicao, id`,
  ]);
  const todas = todasR as Ideia[];
  const boards = boardsR as { id: number; nome: string }[];

  const categorias = [...new Set(todas.map((i) => i.categoria).filter(Boolean))] as string[];
  const contagem = (s: string) => todas.filter((i) => (s === "ativas" ? i.status !== "descartada" : s === "todas" ? true : i.status === s)).length;
  const lista = todas
    .filter((i) => (status === "ativas" ? i.status !== "descartada" : status === "todas" ? true : i.status === status))
    .filter((i) => !categoria || i.categoria === categoria)
    .sort((a, b) => (ordem === "votos" ? b.votos - a.votos : 0) || +new Date(b.created_at) - +new Date(a.created_at));

  const url = (mud: Record<string, string | null>) => {
    const q = new URLSearchParams({ s: status, o: ordem, ...(categoria ? { c: categoria } : {}) });
    for (const [k, v] of Object.entries(mud)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    return `/ideias?${q}`;
  };

  return (
    <>
      <Cabecalho titulo="Ideias de produtos" sub="Joguem aqui qualquer ideia, sem filtro. Depois votem, avaliem a margem e mandem as boas para o kanban." />

      <section className="card">
        <form action={criarIdeia} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input name="titulo" required maxLength={200} placeholder="Nova ideia… ex.: placa NFC para cardápio de restaurante" className="flex-1 py-2.5 text-base" />
            <button className="btn">
              <Icone nome="mais" /> Adicionar ideia
            </button>
          </div>
          <details className="group">
            <summary className="cursor-pointer list-none text-sm text-muted hover:text-accent">
              <span className="group-open:hidden">+ Detalhes (descrição, custo, preço, link)</span>
              <span className="hidden group-open:inline">− Menos detalhes</span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field sm:col-span-2 lg:col-span-4">
                <span>Descrição</span>
                <textarea name="descricao" rows={3} maxLength={5000} placeholder="Para quem é, como seria, por que vende…" />
              </label>
              <label className="field">
                <span>Categoria</span>
                <input name="categoria" list="categorias-ideia" maxLength={60} placeholder="Ex.: restaurante" />
              </label>
              <label className="field">
                <span>Custo estimado (R$)</span>
                <input name="custo_estimado" inputMode="decimal" placeholder="0,00" />
              </label>
              <label className="field">
                <span>Preço de venda (R$)</span>
                <input name="preco_estimado" inputMode="decimal" placeholder="0,00" />
              </label>
              <label className="field">
                <span>Quem teve a ideia</span>
                <input name="autor" maxLength={60} />
              </label>
              <label className="field sm:col-span-2 lg:col-span-4">
                <span>Link de referência</span>
                <input name="link" maxLength={500} placeholder="Anúncio concorrente, foto, vídeo…" />
              </label>
            </div>
          </details>
          <datalist id="categorias-ideia">
            {categorias.map((c) => <option key={c} value={c} />)}
          </datalist>
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="tabs overflow-x-auto max-w-full">
          {[["ativas", "Ativas"], ...Object.entries(STATUS_IDEIA).map(([k, v]) => [k, v.nome]), ["todas", "Todas"]].map(([k, v]) => (
            <Link key={k} href={url({ s: k })} data-ativo={status === k}>
              {v} <span className="text-xs opacity-60">{contagem(k)}</span>
            </Link>
          ))}
        </nav>
        <nav className="tabs">
          {Object.entries(ORDENS).map(([k, v]) => (
            <Link key={k} href={url({ o: k })} data-ativo={ordem === k}>{v}</Link>
          ))}
        </nav>
        {categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categorias.map((c) => (
              <Link
                key={c}
                href={url({ c: categoria === c ? null : c })}
                className={`badge border ${categoria === c ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg"}`}
              >
                {c}
              </Link>
            ))}
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <Vazio>{todas.length ? "Nenhuma ideia neste filtro." : "Nenhuma ideia ainda. Escreva a primeira ali em cima!"}</Vazio>
      ) : (
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>*]:mb-4">
          {lista.map((i) => (
            <IdeiaCard key={i.id} ideia={i} boards={boards} />
          ))}
        </div>
      )}
    </>
  );
}

function IdeiaCard({ ideia: i, boards }: { ideia: Ideia; boards: { id: number; nome: string }[] }) {
  const custo = i.custo_estimado != null ? Number(i.custo_estimado) : null;
  const preco = i.preco_estimado != null ? Number(i.preco_estimado) : null;
  const margem = custo != null && preco != null && preco > 0 ? preco - custo : null;
  const longa = (i.descricao?.length ?? 0) > 240;
  const dominio = i.link ? new URL(i.link).hostname.replace(/^www\./, "") : null;

  return (
    <article className={`card break-inside-avoid space-y-3 ${i.status === "descartada" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <form action={votarIdeia.bind(null, i.id, 1)}>
          <button
            className="flex w-11 flex-col items-center rounded-lg border border-border py-1 text-sm hover:border-accent hover:text-accent cursor-pointer"
            title="Votar nesta ideia"
          >
            <Icone nome="seta_cima" className="size-3.5" />
            <span className="font-semibold tabular-nums">{i.votos}</span>
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <span className={`badge ${STATUS_IDEIA[i.status]?.classe ?? ""}`}>{STATUS_IDEIA[i.status]?.nome ?? i.status}</span>
            {i.categoria && <span className="badge bg-surface-2 text-muted">{i.categoria}</span>}
          </div>
          <h3 className="break-words font-semibold leading-snug">{i.titulo}</h3>
        </div>
      </div>

      {i.descricao &&
        (longa ? (
          <details className="group text-sm">
            <summary className="cursor-pointer list-none">
              <p className="line-clamp-4 whitespace-pre-line break-words text-muted group-open:hidden">{i.descricao}</p>
              <span className="text-xs text-accent group-open:hidden">Ler mais</span>
            </summary>
            <p className="whitespace-pre-line break-words text-muted">{i.descricao}</p>
          </details>
        ) : (
          <p className="whitespace-pre-line break-words text-sm text-muted">{i.descricao}</p>
        ))}

      {(custo != null || preco != null) && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-2.5 text-xs">
          <div>
            <dt className="text-muted">Custo</dt>
            <dd className="font-medium tabular-nums">{custo != null ? brl(custo) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Preço</dt>
            <dd className="font-medium tabular-nums">{preco != null ? brl(preco) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Margem bruta</dt>
            <dd className={`font-medium tabular-nums ${margem != null && margem < 0 ? "text-neg" : "text-pos"}`}>
              {margem != null ? `${brl(margem)} (${((margem / preco!) * 100).toFixed(0)}%)` : "—"}
            </dd>
          </div>
        </dl>
      )}

      {i.link && (
        <a href={i.link} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-accent hover:underline">
          <Icone nome="link" className="size-3 shrink-0" />
          <span className="truncate">{dominio}</span>
        </a>
      )}

      <p className="text-xs text-muted">
        {i.autor ? `${i.autor} · ` : ""}
        {new Date(i.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
      </p>

      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3">
        {(Object.keys(STATUS_IDEIA) as StatusIdeia[])
          .filter((s) => s !== i.status)
          .map((s) => (
            <form key={s} action={mudarStatusIdeia.bind(null, i.id, s)}>
              <button className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg cursor-pointer">→ {STATUS_IDEIA[s].nome}</button>
            </form>
          ))}
      </div>

      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-accent">Editar · enviar para o kanban · excluir</summary>
        <div className="mt-3 space-y-4">
          <form action={atualizarIdeia.bind(null, i.id)} className="grid gap-2 sm:grid-cols-2">
            <label className="field sm:col-span-2">
              <span>Título</span>
              <input name="titulo" defaultValue={i.titulo} required maxLength={200} />
            </label>
            <label className="field sm:col-span-2">
              <span>Descrição</span>
              <textarea name="descricao" defaultValue={i.descricao ?? ""} rows={4} maxLength={5000} />
            </label>
            <label className="field">
              <span>Categoria</span>
              <input name="categoria" defaultValue={i.categoria ?? ""} list="categorias-ideia" maxLength={60} />
            </label>
            <label className="field">
              <span>Quem teve a ideia</span>
              <input name="autor" defaultValue={i.autor ?? ""} maxLength={60} />
            </label>
            <label className="field">
              <span>Custo (R$)</span>
              <input name="custo_estimado" inputMode="decimal" defaultValue={i.custo_estimado ?? ""} />
            </label>
            <label className="field">
              <span>Preço (R$)</span>
              <input name="preco_estimado" inputMode="decimal" defaultValue={i.preco_estimado ?? ""} />
            </label>
            <label className="field sm:col-span-2">
              <span>Link</span>
              <input name="link" defaultValue={i.link ?? ""} maxLength={500} />
            </label>
            <div className="sm:col-span-2">
              <button className="btn py-1.5">Salvar</button>
            </div>
          </form>

          {boards.length > 0 ? (
            <form action={ideiaParaKanban.bind(null, i.id)} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="field min-w-0 flex-1">
                <span>Virar card no kanban</span>
                <select name="board" defaultValue={boards[0].id}>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </label>
              <button className="btn-ghost">
                <Icone nome="kanban_enviar" /> Enviar
              </button>
            </form>
          ) : (
            <p className="border-t border-border pt-3 text-xs text-muted">
              Crie um board no <Link href="/kanban" className="text-accent hover:underline">Kanban</Link> para enviar ideias para lá.
            </p>
          )}

          <div className="border-t border-border pt-3">
            <ExcluirBotao action={excluirIdeia.bind(null, i.id)} />
          </div>
        </div>
      </details>
    </article>
  );
}
