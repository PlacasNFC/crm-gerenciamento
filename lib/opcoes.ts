import { sql } from "./db";
import type { ClienteOpcao, ProdutoOpcao } from "@/components/VendaForm";

export async function opcoesVenda(incluirProdutos: number[] = []) {
  const [produtos, clientes] = await Promise.all([
    sql`SELECT id, sku, nome, preco_venda FROM produtos WHERE ativo OR id = ANY(${incluirProdutos}::int[]) ORDER BY nome`,
    sql`SELECT id, nome FROM clientes ORDER BY nome`,
  ]);
  return { produtos: produtos as ProdutoOpcao[], clientes: clientes as ClienteOpcao[] };
}
