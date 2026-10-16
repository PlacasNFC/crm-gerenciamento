import Link from "next/link";
import { notFound } from "next/navigation";
import { linhas, sql, ensureSchema } from "@/lib/db";
import { brl } from "@/lib/constants";
import { formatarDocumento } from "@/lib/fiscal";
import { formatarChave, lerXmlNfe } from "@/lib/nfe";
import { ActionForm } from "@/components/ActionForm";
import { Copiar } from "@/components/Copiar";
import { Cabecalho, Campo, Tag } from "@/components/ui";
import { excluirNota, vincularVenda } from "../actions";

export const dynamic = "force-dynamic";

type Nota = {
  id: number; chave: string; numero: number; serie: number; modelo: string; direcao: string; data_emissao: Date;
  emit_nome: string; emit_documento: string; dest_nome: string; dest_documento: string; valor_total: string;
  status: string; protocolo: string; xml: string; xml_cancelamento: string | null; venda_id: number | null;
};

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [n] = await linhas<Nota>(sql`SELECT * FROM notas_fiscais WHERE id = ${Number(id)}`);
  if (!n) notFound();
  const doc = lerXmlNfe(n.xml);
  const itens = doc.tipo === "nfe" ? doc.itens : [];
  const contas = await linhas<{ id: number; descricao: string; valor: string; vencimento: string; pago_em: string | null }>(
    sql`SELECT id, descricao, valor, vencimento, pago_em FROM contas WHERE nota_id = ${n.id} ORDER BY vencimento`,
  );

  return (
    <>
      <Link href={`/notas?aba=${n.direcao === "emitida" ? "emitidas" : "recebidas"}`} className="btn-link">← Notas fiscais</Link>
      <Cabecalho titulo={`NF-e ${n.numero} · série ${n.serie}`} sub={n.direcao === "emitida" ? "Emitida pela empresa" : `Recebida de ${n.emit_nome}`}>
        <a href={`/api/notas/${n.id}/xml`} className="btn-ghost">Baixar XML</a>
        {n.xml_cancelamento && <a href={`/api/notas/${n.id}/xml?cancelamento=1`} className="btn-ghost">XML do cancelamento</a>}
      </Cabecalho>

      <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div><p className="text-xs text-muted">Situação</p><Tag cor={n.status === "autorizada" ? "verde" : "vermelha"}>{n.status === "autorizada" ? "Autorizada" : "Cancelada"}</Tag></div>
        <div><p className="text-xs text-muted">Emissão</p>{new Date(n.data_emissao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
        <div><p className="text-xs text-muted">Valor total</p><b>{brl(n.valor_total)}</b></div>
        <div><p className="text-xs text-muted">Protocolo</p>{n.protocolo}</div>
        <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs text-muted">Chave de acesso</p>
          <span className="font-mono break-all">{formatarChave(n.chave)}</span> <Copiar valor={n.chave} />{" "}
          <a href="https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx" target="_blank" rel="noreferrer" className="btn-link">consultar na SEFAZ ↗</a>
        </div>
        <div className="sm:col-span-2"><p className="text-xs text-muted">Emitente</p>{n.emit_nome} · {formatarDocumento(n.emit_documento)}</div>
        <div className="sm:col-span-2"><p className="text-xs text-muted">Destinatário</p>{n.dest_nome} · {formatarDocumento(n.dest_documento)}</div>
      </section>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th className="num">Qtd.</th><th className="num">Unit.</th><th className="num">Total</th></tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.numero}>
                <td>{i.numero}</td><td>{i.codigo}</td><td>{i.descricao}</td><td>{i.ncm}</td><td>{i.cfop}</td>
                <td className="num">{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                <td className="num">{brl(i.valorUnitario)}</td><td className="num">{brl(i.valorTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {n.direcao === "emitida" && (
        <section className="card">
          <h2 className="secao">Venda vinculada</h2>
          <ActionForm action={vincularVenda} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={n.id} />
            <Campo label="Nº do pedido de venda"><input type="number" min={1} name="venda_id" defaultValue={n.venda_id ?? ""} className="w-32" /></Campo>
            <button className="btn-ghost">Salvar vínculo</button>
            {n.venda_id && <Link href={`/vendas/${n.venda_id}`} className="btn-link self-center">abrir venda #{n.venda_id}</Link>}
          </ActionForm>
        </section>
      )}

      {contas.length > 0 && (
        <section className="card">
          <h2 className="secao">Contas a pagar desta nota</h2>
          <ul className="text-sm space-y-1">
            {contas.map((c) => (
              <li key={c.id}>{c.descricao} · {brl(c.valor)} · vence {c.vencimento.split("-").reverse().join("/")} {c.pago_em ? <Tag cor="verde">paga</Tag> : <Tag cor="amarela">em aberto</Tag>}</li>
            ))}
          </ul>
        </section>
      )}

      <ActionForm action={excluirNota} confirmar="Remover esta nota do sistema? Isso NÃO cancela a nota na SEFAZ; só apaga o registro e o XML daqui.">
        <input type="hidden" name="id" value={n.id} />
        <button className="btn-perigo">Remover registro da nota</button>
      </ActionForm>
    </>
  );
}
