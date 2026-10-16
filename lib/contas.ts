import { ErroValidacao } from "./form";

// Soma meses mantendo o dia; se o mês não tem o dia (31/02), usa o último dia do mês.
export function somarMeses(iso: string, meses: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// Divide em parcelas mensais; centavos que sobram vão na última.
export function parcelar(total: number, n: number, primeiroVencimento: string) {
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new ErroValidacao("Parcelas entre 1 e 60.");
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valor: (i === n - 1 ? centavos - base * (n - 1) : base) / 100,
    vencimento: somarMeses(primeiroVencimento, i),
  }));
}
