// Conversão pura dos dados da API do Mercado Livre (sem acesso ao banco).
import type { ItemVenda } from "./vendas";

export type PedidoMl = {
  id: number;
  date_created: string;
  status: string;
  pack_id: number | null;
  total_amount: number;
  buyer?: { id: number; nickname?: string };
  shipping?: { id: number | null };
  order_items: { item: { id: string; title: string; seller_sku?: string | null }; quantity: number; unit_price: number; sale_fee: number }[];
};

// Mapeia o status do pedido do ML para o status de entrega do CRM. null = ainda não é venda (pagamento pendente).
export function statusDoPedido(status: string): "a_enviar" | "cancelado" | null {
  if (status === "cancelled" || status === "invalid") return "cancelado";
  if (status === "paid" || status === "partially_refunded") return "a_enviar";
  return null;
}

export function statusDoEnvio(status: string | undefined): "enviado" | "entregue" | "devolvido" | null {
  if (status === "shipped") return "enviado";
  if (status === "delivered") return "entregue";
  if (status === "not_delivered") return "devolvido";
  return null;
}

// Converte um pedido do ML em itens de venda; SKU igual ao código do produto liga ao estoque.
export function itensDoPedido(p: PedidoMl, produtoPorSku: Map<string, number>): { itens: ItemVenda[]; taxa: number } {
  const itens = p.order_items.map((oi) => ({
    produto_id: (oi.item.seller_sku && produtoPorSku.get(oi.item.seller_sku.toLowerCase())) || null,
    descricao: oi.item.title,
    quantidade: oi.quantity,
    valor_unitario: oi.unit_price,
  }));
  // sale_fee vem por unidade
  const taxa = Math.round(p.order_items.reduce((a, oi) => a + (oi.sale_fee ?? 0) * oi.quantity, 0) * 100) / 100;
  return { itens, taxa };
}
