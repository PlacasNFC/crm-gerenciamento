// Leitura de campos de formulário nas server actions.

export const txt = (f: FormData, k: string, max = 2000) => {
  const v = String(f.get(k) ?? "").trim().slice(0, max);
  return v === "" ? null : v;
};

// Aceita "1.234,56", "1234.56", "R$ 12,90"; vazio = null.
export const parseNum = (raw: string) => {
  const s = raw.trim().replace(/\s|R\$|%/g, "");
  if (!s) return null;
  const v = Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(v) ? v : NaN;
};

export const num = (f: FormData, k: string, rotulo = k, { min = 0 }: { min?: number } = {}) => {
  const v = parseNum(String(f.get(k) ?? ""));
  if (v == null) return null;
  if (Number.isNaN(v) || v < min) throw new Error(`Valor inválido em ${rotulo}`);
  return v;
};
