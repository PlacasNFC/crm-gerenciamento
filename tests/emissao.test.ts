import { describe, expect, it } from "vitest";
import { montarEmissao } from "@/lib/emissao";

const empresa = { cnpj: "11222333000181", ie: "110042490114", uf: "SP", csosn_padrao: "102" };
const cliente = { nome: "Maria", documento: "52998224725", ie: null, contribuinte: false, cep: "20040002",
  logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Rio de Janeiro", uf: "RJ" };
const produto = { sku: "PL-1", ncm: "85235210", unidade: "UN", origem: 0, gtin: null, producao_propria: true };

describe("montarEmissao", () => {
  it("venda interestadual a consumidor final, produção própria", () => {
    const e = montarEmissao(empresa, cliente, [{ descricao: "Placa", quantidade: 2, valor_unitario: 45.5, produto }]);
    expect(e.pendencias).toEqual([]);
    expect(e.interestadual).toBe(true);
    expect(e.consumidorFinal).toBe(true);
    expect(e.indicadorIE).toMatch(/^9/);
    expect(e.itens[0]).toMatchObject({ cfop: "6107", csosn: "102", gtin: "SEM GTIN", total: 91 });
    expect(e.total).toBe(91);
  });

  it("venda dentro de SP, revenda", () => {
    const e = montarEmissao(empresa, { ...cliente, uf: "SP" }, [{ descricao: "Placa", quantidade: 1, valor_unitario: 10, produto: { ...produto, producao_propria: false } }]);
    expect(e.itens[0].cfop).toBe("5102");
    expect(e.interestadual).toBe(false);
  });

  it("lista pendências que fariam a nota ser rejeitada", () => {
    const e = montarEmissao({ ...empresa, cnpj: null, ie: null }, { ...cliente, documento: "123", numero: null },
      [{ descricao: "Avulso", quantidade: 1, valor_unitario: 5, produto: null },
       { descricao: "Sem NCM", quantidade: 1, valor_unitario: 5, produto: { ...produto, ncm: null } }]);
    expect(e.pendencias).toHaveLength(6);
    expect(e.pendencias.join(" ")).toMatch(/CNPJ da empresa/);
    expect(e.pendencias.join(" ")).toMatch(/numero/);
  });

  it("sem cliente", () => {
    const e = montarEmissao(empresa, null, [{ descricao: "Placa", quantidade: 1, valor_unitario: 10, produto }]);
    expect(e.pendencias).toEqual(["Vincule um cliente: a NF-e exige destinatário identificado."]);
    expect(e.itens[0].cfop).toBe("5101");
  });
});
