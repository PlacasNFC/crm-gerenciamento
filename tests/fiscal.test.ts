import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, documentoValido, formatarDocumento, ncmValido, sugerirCfop } from "@/lib/fiscal";

describe("documentos", () => {
  it("valida CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
  it("valida CNPJ", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.444.777/0001-61")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
  });
  it("documentoValido escolhe pelo tamanho", () => {
    expect(documentoValido("52998224725")).toBe(true);
    expect(documentoValido("11222333000181")).toBe(true);
    expect(documentoValido("123")).toBe(false);
  });
  it("formata", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("NCM tem 8 dígitos", () => {
    expect(ncmValido("8523.52.10")).toBe(true);
    expect(ncmValido("852352")).toBe(false);
  });
});

describe("sugerirCfop", () => {
  const sp = { ufEmitente: "SP" };
  it("dentro de SP", () => {
    expect(sugerirCfop({ ...sp, ufDestino: "SP", contribuinte: false, producaoPropria: false })).toBe("5102");
    expect(sugerirCfop({ ...sp, ufDestino: "SP", contribuinte: true, producaoPropria: true })).toBe("5101");
    expect(sugerirCfop({ ...sp, ufDestino: null, contribuinte: false, producaoPropria: false })).toBe("5102");
  });
  it("outro estado, consumidor final", () => {
    expect(sugerirCfop({ ...sp, ufDestino: "RJ", contribuinte: false, producaoPropria: false })).toBe("6108");
    expect(sugerirCfop({ ...sp, ufDestino: "rj", contribuinte: false, producaoPropria: true })).toBe("6107");
  });
  it("outro estado, contribuinte", () => {
    expect(sugerirCfop({ ...sp, ufDestino: "MG", contribuinte: true, producaoPropria: false })).toBe("6102");
    expect(sugerirCfop({ ...sp, ufDestino: "MG", contribuinte: true, producaoPropria: true })).toBe("6101");
  });
});
