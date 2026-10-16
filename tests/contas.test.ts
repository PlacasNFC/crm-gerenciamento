import { describe, expect, it } from "vitest";
import { parcelar, somarMeses } from "@/lib/contas";

describe("contas", () => {
  it("soma meses respeitando fim de mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-11-15", 2)).toBe("2027-01-15");
    expect(somarMeses("2026-10-10", 0)).toBe("2026-10-10");
  });
  it("parcela sem perder centavos", () => {
    const p = parcelar(100, 3, "2026-10-31");
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(parcelar(10, 1, "2026-10-01")).toEqual([{ numero: 1, valor: 10, vencimento: "2026-10-01" }]);
  });
  it("recusa parcelas inválidas", () => {
    expect(() => parcelar(10, 0, "2026-10-01")).toThrow();
    expect(() => parcelar(10, 61, "2026-10-01")).toThrow();
  });
});
