import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { formatarDocumento, UFS } from "@/lib/fiscal";
import { ActionForm } from "@/components/ActionForm";
import { Cabecalho, Campo } from "@/components/ui";
import { excluirCliente, salvarCliente } from "../actions";

export const dynamic = "force-dynamic";

type Cliente = Record<string, string | null> & { id: number; contribuinte: boolean };

export default async function ClienteForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const { id } = await params;
  const voltar = (await searchParams).voltar;
  let c: Cliente | undefined;
  if (id !== "novo") {
    if (!/^\d+$/.test(id)) notFound();
    [c] = (await sql`SELECT * FROM clientes WHERE id = ${Number(id)}`) as Cliente[];
    if (!c) notFound();
  }
  const v = (k: string) => (c?.[k] as string | null) ?? "";

  return (
    <>
      <Link href="/clientes" className="btn-link">← Clientes</Link>
      <Cabecalho titulo={c ? c.nome ?? "Cliente" : "Novo cliente"} />
      <ActionForm action={salvarCliente} className="space-y-5">
        <input type="hidden" name="id" value={c?.id ?? ""} />
        <input type="hidden" name="voltar" value={voltar?.startsWith("/") ? voltar : "/clientes"} />
        <section className="card">
          <h2 className="secao">Identificação</h2>
          <div className="grid-form">
            <Campo label="Nome / razão social *" className="sm:col-span-2"><input name="nome" defaultValue={v("nome")} required /></Campo>
            <Campo label="CPF ou CNPJ"><input name="documento" inputMode="numeric" defaultValue={formatarDocumento(v("documento"))} /></Campo>
            <Campo label="Inscrição estadual"><input name="ie" defaultValue={v("ie")} /></Campo>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="contribuinte" defaultChecked={c?.contribuinte ?? false} />
              Contribuinte de ICMS (empresa com IE que compra para revenda/industrialização)
            </label>
          </div>
        </section>
        <section className="card">
          <h2 className="secao">Contato e endereço</h2>
          <div className="grid-form">
            <Campo label="E-mail"><input type="email" name="email" defaultValue={v("email")} /></Campo>
            <Campo label="Telefone"><input name="telefone" defaultValue={v("telefone")} /></Campo>
            <Campo label="CEP"><input name="cep" inputMode="numeric" defaultValue={v("cep")} /></Campo>
            <Campo label="UF">
              <select name="uf" defaultValue={v("uf")}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
            </Campo>
            <Campo label="Logradouro" className="sm:col-span-2"><input name="logradouro" defaultValue={v("logradouro")} /></Campo>
            <Campo label="Número"><input name="numero" defaultValue={v("numero")} /></Campo>
            <Campo label="Complemento"><input name="complemento" defaultValue={v("complemento")} /></Campo>
            <Campo label="Bairro"><input name="bairro" defaultValue={v("bairro")} /></Campo>
            <Campo label="Município"><input name="municipio" defaultValue={v("municipio")} /></Campo>
          </div>
        </section>
        <div className="flex justify-end"><button className="btn">Salvar cliente</button></div>
      </ActionForm>
      {c && (
        <ActionForm action={excluirCliente} confirmar="Excluir este cliente? As vendas dele ficam sem cliente vinculado.">
          <input type="hidden" name="id" value={c.id} />
          <button className="btn-perigo">Excluir cliente</button>
        </ActionForm>
      )}
    </>
  );
}
