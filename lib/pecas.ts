// Quantas peças (placas, cartões…) vêm em cada anúncio, para contar "kit de 5 vendido 6× = 30 placas".
// Primeiro vale o que foi ajustado à mão (tabela pecas_produto); senão, tenta ler do título.

const PADROES = [
  /\bkit\s*(?:com|c\/|de|c)?\s*(\d{1,3})\b/, // "Kit 5", "Kit com 10", "Kit c/ 3"
  /\b(\d{1,3})\s*(?:unidades|unidade|unids?|un|pecas|peca|pcs?|placas|cartoes|adesivos|tags|chaveiros)\b/, // "05 Unidades", "3 Placas"
  /\b(?:pacote|combo|conjunto|lote)\s*(?:com|de|c\/)?\s*(\d{1,3})\b/, // "Combo 4"
  /\b(\d{1,3})\s*x\b(?!\s*\d)/, // "10x" (mas não "10x15")
];

export function pecasDoTitulo(titulo: string): number | null {
  const t = titulo.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  for (const re of PADROES) {
    const n = Number(re.exec(t)?.[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 500) return n;
  }
  return null;
}

export type Ajustes = Map<string, number>;

export const pecasPorUnidade = (produto: string, ajustes: Ajustes) => ajustes.get(produto) ?? pecasDoTitulo(produto) ?? 1;

// Total de peças de uma linha de venda. Pedidos com vários anúncios vêm como "2× Título A, 1× Título B".
export function pecasDaVenda(produto: string, quantidade: number, ajustes: Ajustes) {
  if (/^\d+× /.test(produto)) {
    const partes = produto.split(/, (?=\d+× )/);
    return partes.reduce((a, p) => {
      const m = /^(\d+)× (.*)$/.exec(p);
      return m ? a + Number(m[1]) * pecasPorUnidade(m[2], ajustes) : a;
    }, 0);
  }
  return quantidade * pecasPorUnidade(produto, ajustes);
}
