import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { KanbanBoard, type Board, type Card, type Coluna } from "@/components/KanbanBoard";
import { Icone } from "@/components/Icone";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [boardR, colunasR, cardsR, outrosR] = await Promise.all([
    sql`SELECT id, nome, descricao, cor FROM kanban_boards WHERE id = ${id}`,
    sql`SELECT id, nome, cor, limite FROM kanban_colunas WHERE board_id = ${id} ORDER BY posicao, id`,
    sql`SELECT k.id, k.coluna_id, k.titulo, k.descricao, k.etiqueta, k.cor, to_char(k.prazo, 'YYYY-MM-DD') AS prazo, k.responsavel
        FROM kanban_cards k JOIN kanban_colunas c ON c.id = k.coluna_id
        WHERE c.board_id = ${id} ORDER BY k.posicao, k.id`,
    sql`SELECT id, nome FROM kanban_boards ORDER BY posicao, id`,
  ]);
  const board = (boardR as Board[])[0];
  if (!board) notFound();
  const cards = cardsR as Card[];
  const colunas: Coluna[] = (colunasR as Omit<Coluna, "cards">[]).map((c) => ({ ...c, cards: cards.filter((k) => k.coluna_id === c.id) }));
  const outros = outrosR as { id: number; nome: string }[];

  return (
    <>
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/kanban" className="inline-flex items-center gap-1 text-muted hover:text-accent">
          <Icone nome="esquerda" className="size-3.5" /> Boards
        </Link>
        {outros.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {outros.map((o) => (
              <Link
                key={o.id}
                href={`/kanban/${o.id}`}
                className={`max-w-48 truncate rounded-md px-2 py-1 text-xs ${o.id === id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface"}`}
              >
                {o.nome}
              </Link>
            ))}
          </div>
        )}
      </nav>
      <KanbanBoard board={board} colunas={colunas} />
    </>
  );
}
