import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { VendaForm, type Venda } from "@/components/VendaForm";
import { atualizarVenda } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditarVenda({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [venda] = (await sql`SELECT * FROM vendas WHERE id = ${id}`) as Venda[];
  if (!venda) notFound();

  return (
    <>
      <Link href="/vendas" className="text-sm text-accent hover:underline">← Voltar</Link>
      <h1 className="text-2xl font-semibold">Editar venda #{id}</h1>
      <section className="card">
        <VendaForm action={atualizarVenda.bind(null, id)} venda={venda} submitLabel="Salvar alterações" />
      </section>
    </>
  );
}
