import Link from "next/link";
import { notFound } from "next/navigation";
import { linhas, sql, ensureSchema } from "@/lib/db";
import { brl, dataBR, hoje } from "@/lib/constants";
import { montarEmissao, type ClienteFiscal, type EmpresaFiscal, type ItemFiscal } from "@/lib/emissao";
import { formatarDocumento } from "@/lib/fiscal";
import { formatarChave } from "@/lib/nfe";
import { opcoesVenda } from "@/lib/opcoes";
import { ActionForm } from "@/components/ActionForm";
import { Copiar } from "@/components/Copiar";
import { Cabecalho, Tag } from "@/components/ui";
import { VendaForm, type VendaEdit } from "@/components/VendaForm";
import { excluirVenda, importarXmlDaVenda, salvarVenda } from "../actions";

export const dynamic = "force-dynamic";

type Item = { produto_id: number | null; descricao: string; quantidade: string; valor_unitario: string } & {
  sku: string | null; ncm: string | null; unidade: string | null; origem: number | null; gtin: string | null; producao_propria: boolean | null;
};
type Nota = { id: number; numero: number; serie: number; chave: string; status: string; data_emissao: Date };
type Conta = { id: number; valor: string; vencimento: string; pago_em: string | null };

export default async function VendaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  await ensureSchema();
  const { id: idStr } = await params;
  if (!/^\d+$/.test(idStr)) notFound();
  const id = Number(idStr);
  const [venda] = (await sql`SELECT id, data, canal, pedido_externo, cliente_id, taxa_plataforma, frete, custo_produto,
    status_entrega, codigo_rastreio, observacoes FROM vendas WHERE id = ${id}`) as VendaEdit[];
  if (!venda) notFound();

  const [itens, notas, contas, [empresa], clienteRows] = await Promise.all([
    linhas<Item>(sql`SELECT i.produto_id, i.descricao, i.quantidade, i.valor_unitario, p.sku, p.ncm, p.unidade, p.origem, p.gtin, p.producao_propria
      FROM venda_itens i LEFT JOIN produtos p ON p.id = i.produto_id WHERE i.venda_id = ${id} ORDER BY i.id`),
    linhas<Nota>(sql`SELECT id, numero, serie, chave, status, data_emissao FROM notas_fiscais WHERE venda_id = ${id} ORDER BY id DESC`),
    linhas<Conta>(sql`SELECT id, valor, vencimento, pago_em FROM contas WHERE venda_id = ${id}`),
    linhas<EmpresaFiscal>(sql`SELECT cnpj, ie, uf, csosn_padrao FROM empresa WHERE id = 1`),
    venda.cliente_id ? linhas<ClienteFiscal>(sql`SELECT * FROM clientes WHERE id = ${venda.cliente_id}`) : Promise.resolve([] as ClienteFiscal[]),
  ]);
  const { produtos, clientes } = await opcoesVenda(itens.map((i) => i.produto_id).filter((x): x is number => x != null));
  const cliente = clienteRows[0] ?? null;
  const notaAtiva = notas.find((n) => n.status === "autorizada");

  const fiscais: ItemFiscal[] = itens.map((i) => ({
    descricao: i.descricao,
    quantidade: Number(i.quantidade),
    valor_unitario: Number(i.valor_unitario),
    produto: i.produto_id && i.sku
      ? { sku: i.sku, ncm: i.ncm, unidade: i.unidade ?? "UN", origem: i.origem ?? 0, gtin: i.gtin, producao_propria: !!i.producao_propria }
      : null,
  }));
  const em = montarEmissao(empresa, cliente, fiscais);

  return (
    <>
      <Link href="/vendas" className="btn-link">← Pedidos de venda</Link>
      <Cabecalho titulo={`Pedido de venda #${id}`} sub={`Criado em ${dataBR(venda.data)}`} />
      {(await searchParams).salvo && <p className="msg-ok mt-0">Pedido salvo. Estoque e contas a receber atualizados.</p>}

      <VendaForm action={salvarVenda} produtos={produtos} clientes={clientes} venda={venda} itens={itens} hoje={hoje()} />

      <section className="card">
        <h2 className="secao">Financeiro</h2>
        {contas.length === 0 ? (
          <p className="text-sm text-muted">Sem conta a receber (venda cancelada/devolvida ou valor líquido zero).</p>
        ) : contas.map((c) => (
          <p key={c.id} className="text-sm">
            A receber {brl(c.valor)} · vencimento {dataBR(c.vencimento)} ·{" "}
            {c.pago_em ? <Tag cor="verde">recebido em {dataBR(c.pago_em)}</Tag> : <Tag cor="amarela">em aberto</Tag>}{" "}
            <Link href="/financeiro/receber" className="btn-link">ver contas</Link>
          </p>
        ))}
      </section>

      <section className="card space-y-4">
        <h2 className="secao mb-0">Nota fiscal</h2>
        {notas.map((n) => (
          <div key={n.id} className="text-sm flex flex-wrap items-center gap-2">
            <Link href={`/notas/${n.id}`} className="text-accent hover:underline font-medium">NF-e {n.numero} série {n.serie}</Link>
            <Tag cor={n.status === "autorizada" ? "verde" : "vermelha"}>{n.status}</Tag>
            <span className="text-xs text-muted break-all">{formatarChave(n.chave)}</span>
          </div>
        ))}

        {!notaAtiva && (
          <>
            <div>
              <h3 className="text-sm font-medium mb-1">1. Emita no emissor do Sebrae com estes dados</h3>
              <p className="text-xs text-muted mb-3">
                Sugestões calculadas para Simples Nacional em {empresa.uf}. Confira com seu contador antes da primeira emissão.{" "}
                <a href="https://sebrae.com.br/subsites/emissor-nf-e" target="_blank" rel="noreferrer" className="btn-link">Abrir emissor do Sebrae ↗</a>
              </p>
              {em.pendencias.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm mb-3">
                  <p className="font-medium mb-1">Corrija antes de emitir:</p>
                  <ul className="list-disc pl-5 space-y-0.5">{em.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              )}
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
                <Dado k="Natureza da operação" v={em.naturezaOperacao} />
                <Dado k="Finalidade" v={em.finalidade} />
                <Dado k="Consumidor final" v={em.consumidorFinal ? "Sim" : "Não"} />
                <Dado k="Destino" v={em.interestadual ? "2 – Interestadual" : "1 – Interna"} />
                {cliente && (
                  <>
                    <Dado k="Destinatário" v={cliente.nome} />
                    <Dado k="CPF/CNPJ" v={formatarDocumento(cliente.documento)} />
                    <Dado k="Indicador IE" v={em.indicadorIE} />
                    <Dado k="Endereço" v={[cliente.logradouro, cliente.numero, cliente.bairro, cliente.municipio, cliente.uf, cliente.cep].filter(Boolean).join(", ")} />
                  </>
                )}
              </dl>
              <div className="overflow-x-auto mt-3">
                <table className="tbl">
                  <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>CSOSN</th><th>Orig.</th><th>Un.</th><th>EAN</th><th className="num">Qtd.</th><th className="num">Unit.</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {em.itens.map((i) => (
                      <tr key={i.numero}>
                        <td>{i.numero}</td><td>{i.codigo || "—"}</td><td>{i.descricao}</td>
                        <td>{i.ncm || <Tag cor="vermelha">falta</Tag>}</td><td>{i.cfop}</td><td>{i.csosn}</td><td>{i.origem}</td>
                        <td>{i.unidade}</td><td className="whitespace-nowrap">{i.gtin}</td>
                        <td className="num">{i.quantidade.toLocaleString("pt-BR")}</td><td className="num">{brl(i.valorUnitario)}</td><td className="num">{brl(i.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-medium"><td colSpan={11}>Total da nota</td><td className="num">{brl(em.total)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm mt-3">
                Informações complementares: <span className="text-muted">{em.informacoesComplementares}</span> <Copiar valor={em.informacoesComplementares} />
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">2. Depois de autorizada, importe o XML aqui</h3>
              <ActionForm action={importarXmlDaVenda} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="venda_id" value={id} />
                <input type="file" name="xml" accept=".xml,text/xml,application/xml" required className="text-sm" />
                <button className="btn">Importar XML</button>
              </ActionForm>
            </div>
          </>
        )}
      </section>

      <ActionForm action={excluirVenda} confirmar="Excluir este pedido? O estoque volta e a conta a receber em aberto é removida.">
        <input type="hidden" name="id" value={id} />
        <button className="btn-perigo">Excluir pedido</button>
      </ActionForm>
    </>
  );
}

function Dado({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 py-0.5 border-b border-border">
      <dt className="text-muted shrink-0">{k}:</dt>
      <dd className="min-w-0 break-words">{v} {v && <Copiar valor={v} />}</dd>
    </div>
  );
}
