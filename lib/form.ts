// Leitura de campos de formulário (server actions).

export const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(v || 0);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido em ${k}`);
  return n;
};
// aceita "1234.56" (input number) e "1.234,56" (digitado)
export const valor = (f: FormData, k: string) => {
  const raw = String(f.get(k) ?? "").trim();
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return num(f, k);
};
