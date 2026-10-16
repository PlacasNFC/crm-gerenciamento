import Link from "next/link";
import { notFound } from "next/navigation";
import { linhas, sql, ensureSchema } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { Cabecalho, Campo } from "@/components/ui";
import { excluirConta, salvarConta } from "../../actions";

export const dynamic = "force-dynamic";

type Conta = { id: number; tipo: string; descricao: string; categoria: string; valor: string; vencimento: string; pago_em: string | null; venda_id: number | null };

export default async function ContaPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [c] = await linhas<Conta>(sql`SELECT * FROM contas WHERE id = ${Number(id)}`);
  if (!c) notFound();
  const daVenda = c.venda_id != null;
  return (
    <>
      <Link href={`/financeiro/${c.tipo}`} className="btn-link">← Contas a {c.tipo}</Link>
      <Cabecalho titulo={c.descricao} sub={daVenda ? `Gerada pela venda #${c.venda_id}: valor e descrição vêm do pedido.` : undefined} />
      <ActionForm action={salvarConta} className="card grid-form">
        <input type="hidden" name="id" value={c.id} />
        <Campo label="Descrição" className="sm:col-span-2"><input name="descricao" defaultValue={c.descricao} disabled={daVenda} required /></Campo>
        <Campo label="Categoria"><input name="categoria" defaultValue={c.categoria} disabled={daVenda} /></Campo>
        <Campo label="Valor (R$)"><input type="number" step="0.01" min="0.01" name="valor" defaultValue={c.valor} disabled={daVenda} required /></Campo>
        <Campo label="Vencimento"><input type="date" name="vencimento" defaultValue={c.vencimento} required /></Campo>
        <Campo label={c.tipo === "receber" ? "Recebido em" : "Pago em"}><input type="date" name="pago_em" defaultValue={c.pago_em ?? ""} /></Campo>
        <div className="self-end lg:col-start-4"><button className="btn w-full">Salvar</button></div>
        {daVenda && <input type="hidden" name="valor" value={c.valor} />}
      </ActionForm>
      {!daVenda && (
        <ActionForm action={excluirConta} confirmar="Excluir esta conta?">
          <input type="hidden" name="id" value={c.id} />
          <button className="btn-perigo">Excluir conta</button>
        </ActionForm>
      )}
    </>
  );
}
