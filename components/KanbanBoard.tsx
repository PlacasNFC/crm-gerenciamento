"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CORES, type Cor } from "@/lib/cores";
import { Icone } from "./Icone";
import {
  atualizarBoard,
  atualizarCard,
  atualizarColuna,
  criarCard,
  criarColuna,
  excluirBoard,
  excluirCard,
  excluirColuna,
  moverCards,
  ordenarColunas,
} from "@/app/(app)/kanban/actions";

export type Card = {
  id: number;
  coluna_id: number;
  titulo: string;
  descricao: string | null;
  etiqueta: string | null;
  cor: Cor | null;
  prazo: string | null;
  responsavel: string | null;
};
export type Coluna = { id: number; nome: string; cor: Cor; limite: number | null; cards: Card[] };
export type Board = { id: number; nome: string; descricao: string | null; cor: Cor };

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dataCurta = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const iniciais = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export function SeletorCor({ nome, valor, vazio }: { nome: string; valor: Cor | null; vazio?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {vazio && (
        <label className="cursor-pointer" title="Sem cor">
          <input type="radio" name={nome} value="" defaultChecked={!valor} className="peer sr-only" />
          <span className="grid size-6 place-items-center rounded-full border border-border text-[10px] text-muted peer-checked:ring-2 peer-checked:ring-accent peer-checked:ring-offset-1">
            ∅
          </span>
        </label>
      )}
      {(Object.keys(CORES) as Cor[]).map((c) => (
        <label key={c} className="cursor-pointer" title={CORES[c].nome}>
          <input type="radio" name={nome} value={c} defaultChecked={valor === c} className="peer sr-only" />
          <span className={`block size-6 rounded-full ${CORES[c].ponto} peer-checked:ring-2 peer-checked:ring-accent peer-checked:ring-offset-1 ring-offset-[var(--surface)]`} />
        </label>
      ))}
    </div>
  );
}

export function Modal({ aberto, fechar, titulo, children }: { aberto: boolean; fechar: () => void; titulo: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      onClose={fechar}
      onClick={(e) => e.target === ref.current && fechar()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        <button type="button" className="btn-icon" onClick={fechar} aria-label="Fechar">
          <Icone nome="fechar" />
        </button>
      </div>
      <div className="p-5">{aberto && children}</div>
    </dialog>
  );
}

export function KanbanBoard({ board, colunas: inicial }: { board: Board; colunas: Coluna[] }) {
  const router = useRouter();
  const [colunas, setColunas] = useState(inicial);
  useEffect(() => setColunas(inicial), [inicial]);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<{ coluna: number; indice: number } | null>(null);
  const [cardAberto, setCardAberto] = useState<Card | null>(null);
  const [colunaAberta, setColunaAberta] = useState<Coluna | null>(null);
  const [boardAberto, setBoardAberto] = useState(false);
  const [novaColuna, setNovaColuna] = useState(false);
  const [novoCardEm, setNovoCardEm] = useState<number | null>(null);

  const executar = (fn: () => Promise<unknown>, depois?: () => void) =>
    startTransition(async () => {
      setErro(null);
      try {
        await fn();
        depois?.();
      } catch (e) {
        setErro((e as Error).message || "Não foi possível salvar.");
        setColunas(inicial);
      }
    });

  // ---- mover card (arrastar ou "mover para")
  function mover(cardId: number, destino: number, indice: number) {
    const card = colunas.flatMap((c) => c.cards).find((c) => c.id === cardId);
    if (!card) return;
    const novas = colunas.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== cardId) }));
    const dest = novas.find((c) => c.id === destino)!;
    dest.cards.splice(Math.min(indice, dest.cards.length), 0, { ...card, coluna_id: destino });
    setColunas(novas);
    executar(() => moverCards(destino, dest.cards.map((c) => c.id)));
  }

  function indiceNoPonto(lista: HTMLElement, y: number) {
    const cards = [...lista.querySelectorAll<HTMLElement>("[data-card]")].filter((el) => Number(el.dataset.card) !== arrastando);
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? cards.length : i;
  }

  function moverColuna(id: number, passo: -1 | 1) {
    const i = colunas.findIndex((c) => c.id === id);
    const j = i + passo;
    if (j < 0 || j >= colunas.length) return;
    const novas = [...colunas];
    [novas[i], novas[j]] = [novas[j], novas[i]];
    setColunas(novas);
    executar(() => ordenarColunas(board.id, novas.map((c) => c.id)));
  }

  const hoje = hojeSP();
  const total = colunas.reduce((a, c) => a + c.cards.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`size-3 rounded-full ${CORES[board.cor].ponto}`} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{board.nome}</h1>
          {board.descricao && <p className="text-sm text-muted break-words">{board.descricao}</p>}
        </div>
        <span className="text-sm text-muted">{total} card{total === 1 ? "" : "s"}</span>
        <div className="ml-auto flex items-center gap-2">
          {pendente && <span className="text-xs text-muted">Salvando…</span>}
          <button className="btn-ghost" onClick={() => setBoardAberto(true)}>
            <Icone nome="editar" /> Editar board
          </button>
        </div>
      </div>

      {erro && <p className="card text-sm text-neg">{erro}</p>}

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-start gap-4">
          {colunas.map((col, ci) => {
            const cheia = col.limite != null && col.cards.length > col.limite;
            return (
              <section
                key={col.id}
                className={`flex max-h-[calc(100vh-13rem)] w-72 shrink-0 flex-col rounded-xl border bg-surface-2 ${
                  alvo?.coluna === col.id ? "border-accent" : "border-border"
                }`}
                onDragOver={(e) => {
                  if (arrastando == null) return;
                  e.preventDefault();
                  const lista = e.currentTarget.querySelector<HTMLElement>("[data-lista]")!;
                  const indice = indiceNoPonto(lista, e.clientY);
                  if (alvo?.coluna !== col.id || alvo.indice !== indice) setAlvo({ coluna: col.id, indice });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastando != null && alvo) mover(arrastando, alvo.coluna, alvo.indice);
                  setArrastando(null);
                  setAlvo(null);
                }}
              >
                <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <span className={`size-2.5 shrink-0 rounded-full ${CORES[col.cor].ponto}`} />
                  <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={col.nome}>{col.nome}</h2>
                  <span className={`rounded-full px-1.5 text-xs tabular-nums ${cheia ? "bg-red-500/15 font-semibold text-neg" : "text-muted"}`}>
                    {col.cards.length}
                    {col.limite != null && `/${col.limite}`}
                  </span>
                  <button className="btn-icon p-1" title="Mover coluna para a esquerda" disabled={ci === 0} onClick={() => moverColuna(col.id, -1)}>
                    <Icone nome="esquerda" className="size-3.5" />
                  </button>
                  <button className="btn-icon p-1" title="Mover coluna para a direita" disabled={ci === colunas.length - 1} onClick={() => moverColuna(col.id, 1)}>
                    <Icone nome="direita" className="size-3.5" />
                  </button>
                  <button className="btn-icon p-1" title="Editar coluna" onClick={() => setColunaAberta(col)}>
                    <Icone nome="editar" className="size-3.5" />
                  </button>
                </header>

                <div data-lista className="min-h-12 flex-1 space-y-2 overflow-y-auto px-3 pb-2">
                  {col.cards.map((card, i) => (
                    <div key={card.id}>
                      {alvo?.coluna === col.id && alvo.indice === i && arrastando !== card.id && <Marcador />}
                      <CardItem
                        card={card}
                        hoje={hoje}
                        arrastando={arrastando === card.id}
                        onAbrir={() => setCardAberto(card)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(card.id));
                          setArrastando(card.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setAlvo(null);
                        }}
                      />
                    </div>
                  ))}
                  {alvo?.coluna === col.id && alvo.indice >= col.cards.filter((c) => c.id !== arrastando).length && <Marcador />}
                  {col.cards.length === 0 && alvo?.coluna !== col.id && (
                    <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted">Arraste cards para cá</p>
                  )}
                </div>

                <div className="px-3 pb-3">
                  {novoCardEm === col.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const fd = new FormData(form);
                        if (!String(fd.get("titulo")).trim()) return;
                        executar(() => criarCard(col.id, fd), () => {
                          form.reset();
                          form.querySelector("textarea")?.focus();
                        });
                      }}
                      className="space-y-2"
                    >
                      <textarea
                        name="titulo"
                        rows={2}
                        autoFocus
                        placeholder="O que precisa ser feito?"
                        className="w-full"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                          if (e.key === "Escape") setNovoCardEm(null);
                        }}
                      />
                      <div className="flex gap-2">
                        <button className="btn py-1.5" disabled={pendente}>Adicionar</button>
                        <button type="button" className="btn-ghost" onClick={() => setNovoCardEm(null)}>Cancelar</button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface hover:text-fg cursor-pointer"
                      onClick={() => setNovoCardEm(col.id)}
                    >
                      <Icone nome="mais" /> Adicionar card
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          <div className="w-72 shrink-0">
            {novaColuna ? (
              <form
                className="card space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  executar(() => criarColuna(board.id, fd), () => setNovaColuna(false));
                }}
              >
                <input name="nome" placeholder="Nome da coluna" autoFocus required maxLength={80} className="w-full" />
                <SeletorCor nome="cor" valor="cinza" />
                <div className="flex gap-2">
                  <button className="btn py-1.5" disabled={pendente}>Criar coluna</button>
                  <button type="button" className="btn-ghost" onClick={() => setNovaColuna(false)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <button
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm text-muted hover:border-accent hover:text-accent cursor-pointer"
                onClick={() => setNovaColuna(true)}
              >
                <Icone nome="mais" /> Nova coluna
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- editar card */}
      <Modal aberto={!!cardAberto} fechar={() => setCardAberto(null)} titulo="Card">
        {cardAberto && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const destino = Number(fd.get("coluna"));
              const card = cardAberto;
              executar(async () => {
                await atualizarCard(card.id, fd);
                if (destino !== card.coluna_id) {
                  const dest = colunas.find((c) => c.id === destino)!;
                  await moverCards(destino, [...dest.cards.map((c) => c.id), card.id]);
                }
              }, () => setCardAberto(null));
            }}
          >
            <label className="field">
              <span>Título</span>
              <textarea name="titulo" defaultValue={cardAberto.titulo} required rows={2} maxLength={300} />
            </label>
            <label className="field">
              <span>Descrição</span>
              <textarea name="descricao" defaultValue={cardAberto.descricao ?? ""} rows={5} maxLength={5000} placeholder="Detalhes, links, checklist…" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">
                <span>Coluna</span>
                <select name="coluna" defaultValue={cardAberto.coluna_id}>
                  {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Prazo</span>
                <input type="date" name="prazo" defaultValue={cardAberto.prazo ?? ""} />
              </label>
              <label className="field">
                <span>Responsável</span>
                <input name="responsavel" defaultValue={cardAberto.responsavel ?? ""} maxLength={60} />
              </label>
              <label className="field">
                <span>Etiqueta</span>
                <input name="etiqueta" defaultValue={cardAberto.etiqueta ?? ""} maxLength={40} placeholder="Ex.: urgente" />
              </label>
            </div>
            <div className="field">
              <span>Cor</span>
              <SeletorCor nome="cor" valor={cardAberto.cor} vazio />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button className="btn" disabled={pendente}>Salvar</button>
              <button type="button" className="btn-ghost" onClick={() => setCardAberto(null)}>Cancelar</button>
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-sm text-neg hover:underline cursor-pointer"
                onClick={() => {
                  if (!confirm("Excluir este card?")) return;
                  const id = cardAberto.id;
                  setColunas(colunas.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== id) })));
                  setCardAberto(null);
                  executar(() => excluirCard(id));
                }}
              >
                <Icone nome="lixo" /> Excluir
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---- editar coluna */}
      <Modal aberto={!!colunaAberta} fechar={() => setColunaAberta(null)} titulo="Coluna">
        {colunaAberta && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const id = colunaAberta.id;
              executar(() => atualizarColuna(id, fd), () => setColunaAberta(null));
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input name="nome" defaultValue={colunaAberta.nome} required maxLength={80} />
            </label>
            <div className="field">
              <span>Cor</span>
              <SeletorCor nome="cor" valor={colunaAberta.cor} />
            </div>
            <label className="field">
              <span>Limite de cards (opcional)</span>
              <input type="number" name="limite" min={1} defaultValue={colunaAberta.limite ?? ""} placeholder="Sem limite" className="w-40" />
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button className="btn" disabled={pendente}>Salvar</button>
              <button type="button" className="btn-ghost" onClick={() => setColunaAberta(null)}>Cancelar</button>
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-sm text-neg hover:underline cursor-pointer"
                onClick={() => {
                  const n = colunaAberta.cards.length;
                  if (!confirm(n ? `Excluir a coluna e os ${n} cards dela?` : "Excluir esta coluna?")) return;
                  const id = colunaAberta.id;
                  setColunas(colunas.filter((c) => c.id !== id));
                  setColunaAberta(null);
                  executar(() => excluirColuna(id));
                }}
              >
                <Icone nome="lixo" /> Excluir coluna
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---- editar board */}
      <Modal aberto={boardAberto} fechar={() => setBoardAberto(false)} titulo="Board">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            executar(() => atualizarBoard(board.id, fd), () => setBoardAberto(false));
          }}
        >
          <label className="field">
            <span>Nome</span>
            <input name="nome" defaultValue={board.nome} required maxLength={200} />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea name="descricao" defaultValue={board.descricao ?? ""} rows={2} maxLength={500} />
          </label>
          <div className="field">
            <span>Cor</span>
            <SeletorCor nome="cor" valor={board.cor} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button className="btn" disabled={pendente}>Salvar</button>
            <button type="button" className="btn-ghost" onClick={() => setBoardAberto(false)}>Cancelar</button>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-sm text-neg hover:underline cursor-pointer"
              onClick={() => {
                if (!confirm(`Excluir o board "${board.nome}" com todas as colunas e cards?`)) return;
                executar(() => excluirBoard(board.id), () => router.push("/kanban"));
              }}
            >
              <Icone nome="lixo" /> Excluir board
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Marcador() {
  return <div className="my-1 h-1 rounded-full bg-accent" />;
}

function CardItem({
  card,
  hoje,
  arrastando,
  onAbrir,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  hoje: string;
  arrastando: boolean;
  onAbrir: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const atrasado = card.prazo && card.prazo < hoje;
  const ehHoje = card.prazo === hoje;
  return (
    <article
      data-card={card.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onAbrir}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir())}
      tabIndex={0}
      className={`group relative cursor-grab overflow-hidden rounded-lg border border-border bg-surface p-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:border-accent/60 active:cursor-grabbing ${
        arrastando ? "opacity-40" : ""
      }`}
    >
      {card.cor && <span className={`absolute inset-y-0 left-0 w-1 ${CORES[card.cor].faixa}`} />}
      {card.etiqueta && (
        <span className={`badge mb-1.5 ${card.cor ? CORES[card.cor].suave : "bg-surface-2 text-muted"}`}>{card.etiqueta}</span>
      )}
      <p className="line-clamp-3 break-words font-medium leading-snug">{card.titulo}</p>
      {card.descricao && <p className="mt-1 line-clamp-2 break-words text-xs text-muted">{card.descricao}</p>}
      {(card.prazo || card.responsavel) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {card.prazo && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                atrasado ? "bg-red-500/12 text-neg font-medium" : ehHoje ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted"
              }`}
            >
              <Icone nome="calendario" className="size-3" />
              {ehHoje ? "hoje" : dataCurta(card.prazo)}
            </span>
          )}
          {card.responsavel && (
            <span
              className="ml-auto grid size-6 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent"
              title={card.responsavel}
            >
              {iniciais(card.responsavel)}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
