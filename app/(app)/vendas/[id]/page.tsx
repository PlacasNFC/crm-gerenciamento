import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { VendaForm, type Venda } from "@/components/VendaForm";
import type { ItemVenda } from "@/lib/itens";
import { configCanais, opcoesProdutos } from "@/lib/produtos";
import { atualizarVenda } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditarVenda({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [vendaR, itensR, produtos, canais] = await Promise.all([
    sql`SELECT * FROM vendas WHERE id = ${id}`,
    sql`SELECT produto_id, anuncio_id, variacao_id, descricao, quantidade, valor::float8 AS valor,
        custo_unitario::float8 AS custo_unitario, custo_manual
      FROM venda_itens WHERE venda_id = ${id} ORDER BY id`,
    opcoesProdutos(),
    configCanais(),
  ]);
  const venda = (vendaR as Venda[])[0];
  if (!venda) notFound();

  return (
    <>
      <Link href="/vendas" className="text-sm text-accent hover:underline">← Voltar</Link>
      <h1 className="text-2xl font-semibold">Editar venda #{id}</h1>
      <section className="card">
        <VendaForm
          action={atualizarVenda.bind(null, id)}
          venda={venda}
          itens={itensR as ItemVenda[]}
          produtos={produtos}
          canais={canais}
          submitLabel="Salvar alterações"
        />
      </section>
    </>
  );
}
