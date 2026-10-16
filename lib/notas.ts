import { sql } from "./db";
import { ErroValidacao } from "./form";
import { lerXmlNfe, NfeErro } from "./nfe";

export type ResultadoImportacao = { arquivo: string; ok: boolean; msg: string; notaId?: number };

/**
 * Importa um XML autorizado (nfeProc) ou um evento de cancelamento (procEventoNFe).
 * - Nota emitida pela empresa: vincula à venda informada ou procura a venda pelo valor/cliente/data.
 * - Nota recebida (compra): opcionalmente gera contas a pagar a partir das duplicatas.
 */
export async function importarXml(
  arquivo: string,
  xml: string,
  opts: { vendaId?: number | null; gerarContasPagar?: boolean } = {},
): Promise<ResultadoImportacao> {
  try {
    const [empresa] = (await sql`SELECT cnpj FROM empresa WHERE id = 1`) as { cnpj: string | null }[];
    if (!empresa?.cnpj) throw new ErroValidacao("Cadastre o CNPJ da empresa em Configurações antes de importar notas.");

    const doc = lerXmlNfe(xml);

    if (doc.tipo === "cancelamento") {
      const [nota] = (await sql`UPDATE notas_fiscais SET status = 'cancelada', xml_cancelamento = ${xml}
        WHERE chave = ${doc.chave} RETURNING id, numero, venda_id`) as { id: number; numero: number; venda_id: number | null }[];
      if (!nota) throw new ErroValidacao("Cancelamento de uma nota que ainda não foi importada. Importe a nota primeiro.");
      const aviso = nota.venda_id ? ` Confira a venda #${nota.venda_id}: ela continua com o status atual.` : "";
      return { arquivo, ok: true, notaId: nota.id, msg: `NF ${nota.numero} marcada como cancelada.${aviso}` };
    }

    if (doc.modelo !== "55" && doc.modelo !== "65") throw new ErroValidacao(`Modelo ${doc.modelo} não suportado.`);
    const direcao =
      doc.emitente.documento === empresa.cnpj ? "emitida" : doc.destinatario.documento === empresa.cnpj ? "recebida" : null;
    if (!direcao) throw new ErroValidacao("Esta nota não foi emitida nem recebida pelo CNPJ cadastrado em Configurações.");

    const ja = await sql`SELECT id FROM notas_fiscais WHERE chave = ${doc.chave}`;
    if (ja.length) throw new ErroValidacao(`NF ${doc.numero} já foi importada.`);

    let vendaId = opts.vendaId ?? null;
    let vinculo = "";
    if (direcao === "emitida") {
      if (vendaId) {
        const v = await sql`SELECT id FROM vendas WHERE id = ${vendaId}`;
        if (!v.length) throw new ErroValidacao("Venda informada não existe.");
        vinculo = ` Vinculada à venda #${vendaId}.`;
      } else {
        // mesma soma, até 15 dias antes da emissão, sem nota autorizada, e cliente compatível
        const cands = (await sql`SELECT v.id FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id
          WHERE abs(v.valor_bruto - ${doc.valorTotal}) < 0.01
            AND v.data BETWEEN (${doc.dataEmissao}::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date - 15
                           AND (${doc.dataEmissao}::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date
            AND NOT EXISTS (SELECT 1 FROM notas_fiscais n WHERE n.venda_id = v.id AND n.status = 'autorizada')
            AND (c.documento IS NULL OR c.documento = ${doc.destinatario.documento})`) as { id: number }[];
        if (cands.length === 1) {
          vendaId = cands[0].id;
          vinculo = ` Vinculada automaticamente à venda #${vendaId}.`;
        } else if (cands.length > 1) {
          vinculo = ` ${cands.length} vendas compatíveis: vincule manualmente.`;
        } else {
          vinculo = " Nenhuma venda compatível: vincule manualmente se quiser.";
        }
      }
    }

    // nota e contas a pagar entram juntas (ou nada entra)
    const [{ id: notaId }] = (await sql`SELECT nextval('notas_fiscais_id_seq')::int AS id`) as { id: number }[];
    const parcelas =
      direcao === "recebida" && opts.gerarContasPagar
        ? doc.duplicatas.length
          ? doc.duplicatas
          : [{ numero: "", vencimento: doc.dataEmissao.slice(0, 10), valor: doc.valorTotal }]
        : [];
    await sql.transaction([
      sql`INSERT INTO notas_fiscais (id, chave, numero, serie, modelo, direcao, data_emissao, emit_nome, emit_documento,
          dest_nome, dest_documento, dest_uf, valor_total, status, protocolo, xml, venda_id)
        VALUES (${notaId}, ${doc.chave}, ${doc.numero}, ${doc.serie}, ${doc.modelo}, ${direcao}, ${doc.dataEmissao}, ${doc.emitente.nome},
          ${doc.emitente.documento}, ${doc.destinatario.nome}, ${doc.destinatario.documento}, ${doc.destinatario.uf || null},
          ${doc.valorTotal}, 'autorizada', ${doc.protocolo}, ${xml}, ${vendaId})`,
      ...parcelas.map(
        (p) => sql`INSERT INTO contas (tipo, descricao, categoria, valor, vencimento, nota_id)
          VALUES ('pagar', ${`NF ${doc.numero} · ${doc.emitente.nome}${p.numero ? ` · parc. ${p.numero}` : ""}`}, 'Compras',
          ${p.valor}, ${p.vencimento}, ${notaId})`,
      ),
    ]);
    const contas = parcelas.length ? ` ${parcelas.length} conta(s) a pagar lançada(s).` : "";

    const tipo = direcao === "emitida" ? "emitida" : `de compra (${doc.emitente.nome})`;
    return { arquivo, ok: true, notaId, msg: `NF ${doc.numero} ${tipo} importada.${vinculo}${contas}` };
  } catch (e) {
    if (e instanceof NfeErro || e instanceof ErroValidacao) return { arquivo, ok: false, msg: e.message };
    if ((e as { code?: string })?.code === "23505") return { arquivo, ok: false, msg: "Nota já importada." };
    console.error(e);
    return { arquivo, ok: false, msg: "Erro inesperado ao importar." };
  }
}
