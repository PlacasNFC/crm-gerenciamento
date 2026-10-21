import { sql } from "./db";
import { PARAMETROS_PADRAO, parametrosEfetivos, type CanalCalc, type ItemCusto, type Parametros } from "./calculadora";

// Categoria define a unidade padrão; filamento é sempre em kg (custo por kg).
export const CATEGORIAS_ESTOQUE = {
  filamento: { nome: "Filamento", unidade: "kg", lancamento: "Matéria-prima / NFC" },
  nfc: { nome: "Chips / tags NFC", unidade: "un", lancamento: "Matéria-prima / NFC" },
  embalagem: { nome: "Embalagem", unidade: "un", lancamento: "Embalagem" },
  etiqueta: { nome: "Etiqueta / adesivo", unidade: "un", lancamento: "Embalagem" },
  ferragem: { nome: "Ímãs / ferragens", unidade: "un", lancamento: "Matéria-prima / NFC" },
  outro: { nome: "Outros", unidade: "un", lancamento: "Outros" },
} as const;

export type CategoriaEstoque = keyof typeof CATEGORIAS_ESTOQUE;

export const UNIDADES = ["un", "kg", "g", "m", "ml", "folha", "par", "rolo"];

export const MATERIAIS = ["PLA", "PLA Silk", "PLA Matte", "PETG", "ABS", "ASA", "TPU", "PLA-CF", "PETG-CF"];

export type ItemEstoque = {
  id: number;
  nome: string;
  categoria: CategoriaEstoque;
  unidade: string;
  quantidade: string;
  custo_unitario: string;
  estoque_minimo: string | null;
  material: string | null;
  cor: string | null;
  marca: string | null;
  fornecedor: string | null;
  observacoes: string | null;
};

export const nomeCategoria = (c: string) => CATEGORIAS_ESTOQUE[c as CategoriaEstoque]?.nome ?? c;

// "1,5 kg" / "12 un" — sem casas decimais inúteis
export const qtdFmt = (v: number | string, unidade: string) =>
  `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`;

export const baixo = (i: ItemEstoque) => i.estoque_minimo != null && Number(i.quantidade) <= Number(i.estoque_minimo);

export async function carregarItens() {
  return (await sql`SELECT * FROM estoque_itens ORDER BY categoria, nome, id`) as ItemEstoque[];
}

export const paraItemCusto = (i: ItemEstoque): ItemCusto => ({
  id: i.id,
  nome: i.nome,
  categoria: i.categoria,
  unidade: i.unidade,
  custo_unitario: Number(i.custo_unitario),
  quantidade: Number(i.quantidade),
});

export async function carregarParametros(): Promise<Parametros> {
  const [r] = (await sql`SELECT dados FROM calc_config WHERE id = 1`) as { dados: Partial<Parametros> }[];
  return parametrosEfetivos(PARAMETROS_PADRAO, r?.dados ?? {});
}

export async function carregarCanais(): Promise<CanalCalc[]> {
  const rows = (await sql`SELECT id, nome, faixas, ativo FROM calc_canais ORDER BY posicao, id`) as CanalCalc[];
  return rows.map((c) => ({ ...c, faixas: Array.isArray(c.faixas) ? c.faixas : [] }));
}
