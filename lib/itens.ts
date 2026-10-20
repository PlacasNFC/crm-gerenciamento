// Regras puras dos itens de venda (sem acesso ao banco).
import { r2, type Canal } from "./constants";

export type ItemVenda = {
  produto_id: number | null;
  anuncio_id: string | null;
  variacao_id: string;
  descricao: string;
  quantidade: number;
  valor: number;
  custo_unitario: number;
  custo_manual: boolean;
};

// Uma linha vendida num marketplace (anúncio + variação), antes de virar produto.
export type LinhaAnuncio = { anuncio_id: string; variacao_id: string; descricao: string; quantidade: number; valor: number };

export type Vinculo = { produto_id: number; quantidade: number };

// Converte a linha em itens de produto pelos vínculos do anúncio. Sem vínculo = item "sem produto" (custo 0).
// Kit: a quantidade é multiplicada. Combo: o valor é rateado pelo custo de cada produto (ou por igual, se sem custo).
export function expandirLinha(linha: LinhaAnuncio, vinculos: Vinculo[], custos: Map<number, number>): ItemVenda[] {
  if (!vinculos.length) return [{ ...linha, produto_id: null, custo_unitario: 0, custo_manual: false }];
  const pesos = vinculos.map((v) => (custos.get(v.produto_id) ?? 0) * v.quantidade);
  const soma = pesos.reduce((a, b) => a + b, 0);
  let resto = linha.valor;
  return vinculos.map((v, i) => {
    const valor = i === vinculos.length - 1 ? r2(resto) : r2(linha.valor * (soma ? pesos[i] / soma : 1 / vinculos.length));
    resto -= valor;
    return {
      produto_id: v.produto_id,
      anuncio_id: linha.anuncio_id,
      variacao_id: linha.variacao_id,
      descricao: linha.descricao,
      quantidade: linha.quantidade * v.quantidade,
      valor,
      custo_unitario: custos.get(v.produto_id) ?? 0,
      custo_manual: false,
    };
  });
}

export const custoDosItens = (itens: Pick<ItemVenda, "custo_unitario" | "quantidade">[]) =>
  r2(itens.reduce((a, i) => a + i.custo_unitario * i.quantidade, 0));

export type CanalConfig = { taxa_pct: number; taxa_fixa: number; frete_estimado: number; custo_flex: number };

// Taxa estimada do canal para um valor vendido (percentual + fixo por unidade).
export const taxaEstimada = (c: CanalConfig, valor: number, unidades: number) => r2((valor * c.taxa_pct) / 100 + c.taxa_fixa * unidades);

export type ProdutoOpcao = { id: number; nome: string; sku: string | null; custo: number; precos: Partial<Record<Canal, number>> };
