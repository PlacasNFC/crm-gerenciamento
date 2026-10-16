import { XMLParser } from "fast-xml-parser";
import { soDigitos } from "./fiscal";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false, // mantém tudo como texto (zeros à esquerda, chaves, NCM)
  trimValues: true,
  isArray: (name) => name === "det" || name === "dup",
});

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const s = (v: unknown) => (v == null ? "" : String(v));

export type ItemNfe = {
  numero: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  gtin: string;
};

export type NfeAutorizada = {
  tipo: "nfe";
  chave: string;
  numero: number;
  serie: number;
  modelo: string;
  dataEmissao: string;
  tipoOperacao: "entrada" | "saida";
  naturezaOperacao: string;
  emitente: { documento: string; nome: string; uf: string };
  destinatario: { documento: string; nome: string; uf: string };
  valorTotal: number;
  protocolo: string;
  itens: ItemNfe[];
  duplicatas: { numero: string; vencimento: string; valor: number }[];
};

export type EventoCancelamento = { tipo: "cancelamento"; chave: string; protocolo: string; justificativa: string };

export class NfeErro extends Error {}

// Dígito verificador da chave de acesso (módulo 11, pesos 2..9 da direita para a esquerda)
export function dvChave(chave43: string) {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

export const chaveValida = (c: string) => /^\d{44}$/.test(c) && dvChave(c.slice(0, 43)) === Number(c[43]);

// cStat de autorização: 100 (autorizado) e 150 (autorizado fora de prazo)
const AUTORIZADA = new Set(["100", "150"]);
// cStat de evento registrado: 135 e 155 (cancelamento fora de prazo)
const EVENTO_OK = new Set(["135", "136", "155"]);

export function lerXmlNfe(xml: string): NfeAutorizada | EventoCancelamento {
  let doc: Obj;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new NfeErro("Arquivo não é um XML válido.");
  }

  if (doc.procEventoNFe) return lerEvento(o(doc.procEventoNFe));

  const proc = o(doc.nfeProc);
  if (!doc.nfeProc) {
    if (doc.NFe) throw new NfeErro("XML sem protocolo de autorização. Importe o XML autorizado (nfeProc), não o XML enviado.");
    throw new NfeErro("XML não é de NF-e.");
  }

  const inf = o(o(proc.NFe).infNFe);
  const prot = o(o(proc.protNFe).infProt);
  const cStat = s(prot.cStat);
  if (!AUTORIZADA.has(cStat)) throw new NfeErro(`NF-e não autorizada (cStat ${cStat || "ausente"}: ${s(prot.xMotivo)}).`);

  const chave = s(prot.chNFe) || s(inf["@Id"]).replace(/^NFe/, "");
  if (!chaveValida(chave)) throw new NfeErro("Chave de acesso inválida.");
  if (s(inf["@Id"]).replace(/^NFe/, "") !== chave) throw new NfeErro("Chave do protocolo não confere com a nota.");

  const ide = o(inf.ide);
  const emit = o(inf.emit);
  const dest = o(inf.dest);
  const total = o(o(inf.total).ICMSTot);

  const itens = (inf.det as unknown[] | undefined ?? []).map((d) => {
    const det = o(d);
    const prod = o(det.prod);
    return {
      numero: Number(det["@nItem"]),
      codigo: s(prod.cProd),
      descricao: s(prod.xProd),
      ncm: s(prod.NCM),
      cfop: s(prod.CFOP),
      unidade: s(prod.uCom),
      quantidade: Number(s(prod.qCom)),
      valorUnitario: Number(s(prod.vUnCom)),
      valorTotal: Number(s(prod.vProd)),
      gtin: /^\d+$/.test(s(prod.cEAN)) ? s(prod.cEAN) : "",
    };
  });

  const duplicatas = ((o(inf.cobr).dup as unknown[] | undefined) ?? []).map((d) => {
    const dup = o(d);
    return { numero: s(dup.nDup), vencimento: s(dup.dVenc), valor: Number(s(dup.vDup)) };
  }).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) && d.valor > 0);

  return {
    tipo: "nfe",
    chave,
    numero: Number(s(ide.nNF)),
    serie: Number(s(ide.serie)),
    modelo: s(ide.mod),
    dataEmissao: s(ide.dhEmi) || s(ide.dEmi),
    tipoOperacao: s(ide.tpNF) === "0" ? "entrada" : "saida",
    naturezaOperacao: s(ide.natOp),
    emitente: { documento: soDigitos(s(emit.CNPJ) || s(emit.CPF)), nome: s(emit.xNome), uf: s(o(emit.enderEmit).UF) },
    destinatario: {
      documento: soDigitos(s(dest.CNPJ) || s(dest.CPF) || s(dest.idEstrangeiro)),
      nome: s(dest.xNome),
      uf: s(o(dest.enderDest).UF),
    },
    valorTotal: Number(s(total.vNF)),
    protocolo: s(prot.nProt),
    itens,
    duplicatas,
  };
}

function lerEvento(proc: Obj): EventoCancelamento {
  const ev = o(o(proc.evento).infEvento);
  const ret = o(o(proc.retEvento).infEvento);
  if (s(ev.tpEvento) !== "110111") throw new NfeErro(`Evento ${s(ev.tpEvento)} não suportado (só cancelamento, 110111).`);
  if (!EVENTO_OK.has(s(ret.cStat))) throw new NfeErro(`Cancelamento não homologado (cStat ${s(ret.cStat)}: ${s(ret.xMotivo)}).`);
  const chave = s(ev.chNFe);
  if (!chaveValida(chave)) throw new NfeErro("Chave de acesso inválida no evento.");
  return { tipo: "cancelamento", chave, protocolo: s(ret.nProt), justificativa: s(o(ev.detEvento).xJust) };
}

export const formatarChave = (c: string) => c.replace(/(\d{4})(?=\d)/g, "$1 ");
