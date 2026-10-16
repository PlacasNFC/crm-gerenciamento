export class ErroValidacao extends Error {}

export const texto = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export const obrigatorio = (f: FormData, k: string, rotulo: string) => {
  const v = texto(f, k);
  if (!v) throw new ErroValidacao(`${rotulo} é obrigatório.`);
  return v;
};

// Inputs type=number chegam como "1234.56"; aceita também "1.234,56" digitado.
export function numero(f: FormData | string | null, k = "", { min = 0 } = {}) {
  const raw = (typeof f === "string" || f === null ? f ?? "" : String(f.get(k) ?? "")).trim();
  if (raw === "") return 0;
  const norm = /^-?\d+(\.\d+)?$/.test(raw) ? raw : raw.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  if (!Number.isFinite(n)) throw new ErroValidacao(`Número inválido: ${raw}`);
  if (n < min) throw new ErroValidacao(`Valor não pode ser menor que ${min}.`);
  return Math.round(n * 1000) / 1000;
}

export const dataISO = (f: FormData, k: string) => {
  const v = texto(f, k);
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroValidacao("Data inválida.");
  return v;
};

export const marcado = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

export type Resultado = { ok: true; msg?: string } | { ok: false; erro: string } | null;

// Envolve uma server action: erros de validação viram mensagem no formulário.
export async function tentar(fn: () => Promise<string | void>): Promise<Resultado> {
  try {
    const msg = await fn();
    return { ok: true, msg: msg ?? undefined };
  } catch (e) {
    if (e instanceof ErroValidacao) return { ok: false, erro: e.message };
    // redirect() do Next lança um erro especial que precisa subir
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, erro: "Erro inesperado ao salvar. Tente novamente." };
  }
}
