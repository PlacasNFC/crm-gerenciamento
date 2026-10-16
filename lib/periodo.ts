import { mesAtual } from "./constants";

export function mesValido(m: string | undefined, fallback = mesAtual()) {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : fallback;
}

// [primeiro dia do mês, primeiro dia do mês seguinte)
export function intervaloMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const ini = `${y}-${String(m).padStart(2, "0")}-01`;
  const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { ini, prox };
}
