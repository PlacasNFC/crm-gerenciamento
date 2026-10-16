export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function cpfValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export function documentoValido(v: string) {
  const d = soDigitos(v);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

export function formatarDocumento(v: string | null | undefined) {
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v ?? "";
}

export const ncmValido = (v: string | null | undefined) => /^\d{8}$/.test(soDigitos(v));

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
  "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const ORIGENS: Record<number, string> = {
  0: "0 – Nacional",
  1: "1 – Estrangeira, importação direta",
  2: "2 – Estrangeira, adquirida no mercado interno",
  3: "3 – Nacional, conteúdo de importação > 40% e ≤ 70%",
  4: "4 – Nacional, processos produtivos básicos",
  5: "5 – Nacional, conteúdo de importação ≤ 40%",
  6: "6 – Estrangeira, importação direta, sem similar (CAMEX)",
  7: "7 – Estrangeira, mercado interno, sem similar (CAMEX)",
  8: "8 – Nacional, conteúdo de importação > 70%",
};

/**
 * CFOP sugerido para venda de mercadoria. É só uma sugestão: confirme com o contador.
 * - Mesmo estado: 5101 (produção própria) / 5102 (revenda)
 * - Outro estado, destinatário contribuinte de ICMS: 6101 / 6102
 * - Outro estado, consumidor final não contribuinte: 6107 / 6108
 */
export function sugerirCfop(p: { ufEmitente: string; ufDestino?: string | null; contribuinte: boolean; producaoPropria: boolean }) {
  const destino = (p.ufDestino || p.ufEmitente).toUpperCase();
  if (destino === p.ufEmitente.toUpperCase()) return p.producaoPropria ? "5101" : "5102";
  if (p.contribuinte) return p.producaoPropria ? "6101" : "6102";
  return p.producaoPropria ? "6107" : "6108";
}
