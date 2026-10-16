import Link from "next/link";
import { sql, linhas } from "@/lib/db";
import { brl } from "@/lib/constants";
import { formatarDocumento } from "@/lib/fiscal";
import { intervaloMes, mesValido } from "@/lib/periodo";
import { ImportarNotas } from "@/components/ImportarNotas";
import { Abas, Cabecalho, Tag, Vazio } from "@/components/ui";
import { importarLote } from "./actions";

export const dynamic = "force-dynamic";

type Nota = {
  id: number; numero: number; serie: number; data_emissao: Date; direcao: string; emit_nome: string; dest_nome: string;
  dest_documento: string; valor_total: string; status: string; venda_id: number | null;
};

const ABAS = { emitidas: "Emitidas", recebidas: "Recebidas (compras)" } as const;

export default async function Notas({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const sp = await searchParams;
  const aba = sp.aba === "recebidas" ? "recebidas" : "emitidas";
  const mes = mesValido(sp.mes);
  const { ini, prox } = intervaloMes(mes);
  const direcao = aba === "emitidas" ? "emitida" : "recebida";

  const [notas, [semNota]] = await Promise.all([
    linhas<Nota>(sql`SELECT id, numero, serie, data_emissao, direcao, emit_nome, dest_nome, dest_documento, valor_total, status, venda_id
      FROM notas_fiscais WHERE direcao = ${direcao}
        AND (data_emissao AT TIME ZONE 'America/Sao_Paulo')::date >= ${ini} AND (data_emissao AT TIME ZONE 'America/Sao_Paulo')::date < ${prox}
      ORDER BY data_emissao DESC, numero DESC`),
    linhas<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM vendas v WHERE v.status_entrega NOT IN ('cancelado','devolvido')
      AND NOT EXISTS (SELECT 1 FROM notas_fiscais n WHERE n.venda_id = v.id AND n.status = 'autorizada')`),
  ]);
  const autorizadas = notas.filter((n) => n.status === "autorizada");
  const total = autorizadas.reduce((a, n) => a + Number(n.valor_total), 0);

  return (
    <>
      <Cabecalho titulo="Notas fiscais" sub={`${autorizadas.length} autorizadas · ${brl(total)} no mês`}>
        <form className="flex gap-2 items-end">
          <input type="hidden" name="aba" value={aba} />
          <input type="month" name="mes" defaultValue={mes} aria-label="Mês" />
          <button className="btn-ghost">Filtrar</button>
        </form>
      </Cabecalho>
      {semNota.n > 0 && (
        <p className="text-sm">
          <Tag cor="amarela">{semNota.n} venda(s) ativa(s) sem nota</Tag>{" "}
          <Link href="/vendas?nf=sem" className="btn-link">ver vendas sem nota</Link>
        </p>
      )}
      <ImportarNotas action={importarLote} />
      <Abas atual={aba} itens={Object.entries(ABAS).map(([k, v]) => ({ chave: k, label: v, href: `/notas?aba=${k}&mes=${mes}` }))} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Número</th><th>Emissão</th><th>{aba === "emitidas" ? "Destinatário" : "Fornecedor"}</th><th className="num">Valor</th><th>Situação</th>{aba === "emitidas" && <th>Venda</th>}</tr>
          </thead>
          <tbody>
            {notas.map((n) => (
              <tr key={n.id}>
                <td><Link href={`/notas/${n.id}`} className="text-accent hover:underline">{n.numero}</Link> <span className="text-xs text-muted">série {n.serie}</span></td>
                <td className="whitespace-nowrap">{new Date(n.data_emissao).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td>{aba === "emitidas" ? <>{n.dest_nome} <span className="text-xs text-muted">{formatarDocumento(n.dest_documento)}</span></> : n.emit_nome}</td>
                <td className="num">{brl(n.valor_total)}</td>
                <td><Tag cor={n.status === "autorizada" ? "verde" : "vermelha"}>{n.status === "autorizada" ? "Autorizada" : "Cancelada"}</Tag></td>
                {aba === "emitidas" && <td>{n.venda_id ? <Link href={`/vendas/${n.venda_id}`} className="btn-link">#{n.venda_id}</Link> : <Tag cor="cinza">sem venda</Tag>}</td>}
              </tr>
            ))}
            {notas.length === 0 && <Vazio colunas={6}>Nenhuma nota neste mês.</Vazio>}
          </tbody>
        </table>
      </div>
    </>
  );
}
