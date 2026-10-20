import { sql, ensureSchema } from "@/lib/db";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { ProdutosNav } from "@/components/ProdutosNav";
import { Cabecalho } from "@/components/ui";
import { criarInsumo, excluirInsumo, salvarInsumo } from "../actions";

export const dynamic = "force-dynamic";

type Insumo = { id: number; nome: string; unidade: string; custo_unitario: string; produtos: string };

export default async function Insumos() {
  await ensureSchema();
  const insumos = (await sql`SELECT i.*, (SELECT COUNT(*) FROM produto_insumos pi WHERE pi.insumo_id = i.id) AS produtos
    FROM insumos i ORDER BY nome`) as Insumo[];

  return (
    <>
      <Cabecalho titulo="Insumos">
        <ProdutosNav atual="/produtos/insumos" />
      </Cabecalho>
      <p className="text-sm text-muted">
        Materiais que entram nos produtos (chip NFC, placa, impressão, embalagem…). Ao mudar o custo de um insumo, o custo de todos os
        produtos que o usam muda junto. Vendas já feitas mantêm o custo da época.
      </p>

      <section className="card">
        <h2 className="card-title mb-3">Novo insumo</h2>
        <form action={criarInsumo} className="flex flex-wrap items-end gap-3">
          <label className="field grow">
            <span>Nome</span>
            <input name="nome" placeholder="Ex.: Chip NFC NTAG213" required />
          </label>
          <label className="field">
            <span>Unidade</span>
            <input name="unidade" defaultValue="un" className="w-24" />
          </label>
          <label className="field">
            <span>Custo por unidade (R$)</span>
            <input type="number" step="0.0001" min={0} name="custo_unitario" required className="w-36" />
          </label>
          <button className="btn">Adicionar</button>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Nome</th><th>Unidade</th><th>Custo por unidade (R$)</th><th>Usado em</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {insumos.map((i) => (
              <tr key={i.id}>
                <td colSpan={3}>
                  <form id={`insumo-${i.id}`} action={salvarInsumo.bind(null, i.id)} className="grid grid-cols-[minmax(0,1fr)_6rem_9rem] gap-2">
                    <input name="nome" defaultValue={i.nome} required />
                    <input name="unidade" defaultValue={i.unidade} />
                    <input type="number" step="0.0001" min={0} name="custo_unitario" defaultValue={i.custo_unitario} required />
                  </form>
                </td>
                <td className="whitespace-nowrap">{i.produtos} produtos</td>
                <td><button form={`insumo-${i.id}`} className="btn-ghost">Salvar</button></td>
                <td><ExcluirBotao action={excluirInsumo.bind(null, i.id)} /></td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-6">Nenhum insumo cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
