import { describe, expect, it } from "vitest";
import { chaveValida, dvChave, lerXmlNfe, NfeErro } from "@/lib/nfe";
import { CHAVE, CNPJ_EMPRESA, nfeProc, procCancelamento } from "./fixtures";

describe("chave de acesso", () => {
  it("calcula o DV do exemplo do Manual de Orientação do Contribuinte", () => {
    expect(dvChave("5206043300991100250655012000000780026730161")).toBe(5);
  });
  it("rejeita chave com DV errado", () => {
    const errada = CHAVE.slice(0, 43) + ((Number(CHAVE[43]) + 1) % 10);
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida(errada)).toBe(false);
  });
});

describe("lerXmlNfe", () => {
  it("lê uma NF-e autorizada", () => {
    const n = lerXmlNfe(nfeProc());
    if (n.tipo !== "nfe") throw new Error("esperava nfe");
    expect(n.chave).toBe(CHAVE);
    expect(n.numero).toBe(123);
    expect(n.serie).toBe(1);
    expect(n.modelo).toBe("55");
    expect(n.tipoOperacao).toBe("saida");
    expect(n.emitente).toEqual({ documento: CNPJ_EMPRESA, nome: "PLACAS NFC LTDA", uf: "SP" });
    expect(n.destinatario).toEqual({ documento: "52998224725", nome: "Maria da Silva", uf: "RJ" });
    expect(n.valorTotal).toBe(129.9);
    expect(n.protocolo).toBe("135260000000001");
    expect(n.itens).toHaveLength(2);
    expect(n.itens[0]).toMatchObject({ codigo: "PL-001", ncm: "85235210", cfop: "6108", quantidade: 2, valorTotal: 90, gtin: "" });
    expect(n.itens[1].gtin).toBe("7891234567895");
  });

  it("lê nota com um único item como lista", () => {
    const xml = nfeProc().replace(/<det nItem="2">[\s\S]*?<\/det>/, "");
    const n = lerXmlNfe(xml);
    expect(n.tipo === "nfe" && n.itens.length).toBe(1);
  });

  it("aceita autorização fora de prazo (150)", () => {
    expect(lerXmlNfe(nfeProc({ cStat: "150" })).tipo).toBe("nfe");
  });

  it("recusa nota rejeitada/denegada", () => {
    expect(() => lerXmlNfe(nfeProc({ cStat: "302" }))).toThrow(NfeErro);
  });

  it("recusa XML sem protocolo", () => {
    const semProt = nfeProc().replace(/<nfeProc[^>]*>/, "").replace(/<protNFe[\s\S]*<\/nfeProc>/, "");
    expect(() => lerXmlNfe(semProt)).toThrow(/sem protocolo/);
  });

  it("recusa chave inválida", () => {
    const ruim = CHAVE.slice(0, 43) + ((Number(CHAVE[43]) + 1) % 10);
    expect(() => lerXmlNfe(nfeProc({ chave: ruim }))).toThrow(/Chave/);
  });

  it("recusa arquivo que não é XML de NF-e", () => {
    expect(() => lerXmlNfe("<foo/>")).toThrow(NfeErro);
    expect(() => lerXmlNfe("não é xml")).toThrow(NfeErro);
  });

  it("lê duplicatas da cobrança", () => {
    const dups = `<cobr><fat><nFat>1</nFat><vOrig>129.90</vOrig><vLiq>129.90</vLiq></fat>
      <dup><nDup>001</nDup><dVenc>2026-11-15</dVenc><vDup>64.95</vDup></dup>
      <dup><nDup>002</nDup><dVenc>2026-12-15</dVenc><vDup>64.95</vDup></dup></cobr>`;
    const n = lerXmlNfe(nfeProc({ dups }));
    expect(n.tipo === "nfe" && n.duplicatas).toEqual([
      { numero: "001", vencimento: "2026-11-15", valor: 64.95 },
      { numero: "002", vencimento: "2026-12-15", valor: 64.95 },
    ]);
    const sem = lerXmlNfe(nfeProc());
    expect(sem.tipo === "nfe" && sem.duplicatas).toEqual([]);
  });

  it("lê destinatário PJ", () => {
    const n = lerXmlNfe(nfeProc({ destDoc: "<CNPJ>11444777000161</CNPJ>" }));
    expect(n.tipo === "nfe" && n.destinatario.documento).toBe("11444777000161");
  });

  it("lê evento de cancelamento homologado", () => {
    expect(lerXmlNfe(procCancelamento())).toEqual({
      tipo: "cancelamento",
      chave: CHAVE,
      protocolo: "135260000000999",
      justificativa: "Pedido cancelado pelo comprador",
    });
  });

  it("recusa cancelamento não homologado", () => {
    expect(() => lerXmlNfe(procCancelamento({ cStat: "573" }))).toThrow(/não homologado/);
  });
});
