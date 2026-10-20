// Conversão pura dos dados da API do Mercado Livre (sem acesso ao banco).
import type { LinhaAnuncio } from "./itens";

export type PedidoMl = {
  id: number;
  date_created: string;
  status: string;
  pack_id: number | null;
  total_amount: number;
  buyer?: { id: number; nickname?: string };
  shipping?: { id: number | null };
  order_items: {
    item: { id: string; title: string; variation_id?: number | null };
    quantity: number;
    unit_price: number;
    sale_fee: number | null;
  }[];
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

// Converte um pedido do ML numa linha de venda do CRM (uma venda por pedido).
export function vendaDoPedido(p: PedidoMl) {
  const itens = p.order_items;
  const unico = itens.length === 1;
  return {
    data: new Date(p.date_created).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
    pedido_externo: String(p.id),
    cliente: p.buyer?.nickname ?? null,
    produto: unico ? itens[0].item.title : itens.map((i) => `${i.quantity}× ${i.item.title}`).join(", "),
    quantidade: unico ? itens[0].quantity : 1,
    valor_bruto: p.total_amount,
    // sale_fee vem por unidade
    taxa_plataforma: Math.round(itens.reduce((a, i) => a + (i.sale_fee ?? 0) * i.quantity, 0) * 100) / 100,
    observacoes:
      [p.pack_id && `Pacote ${p.pack_id}`, p.shipping?.id && `Envio ${p.shipping.id}`].filter(Boolean).join(" · ") || null,
  };
}

// Linhas do pedido por anúncio/variação, para virar itens de produto pelos vínculos.
export function linhasDoPedido(p: PedidoMl): LinhaAnuncio[] {
  return p.order_items.map((i) => ({
    anuncio_id: i.item.id,
    variacao_id: i.item.variation_id ? String(i.item.variation_id) : "",
    descricao: i.item.title,
    quantidade: i.quantity,
    valor: Math.round(i.unit_price * i.quantity * 100) / 100,
  }));
}

// Envio Flex (self_service): o vendedor entrega e paga a transportadora; o custo vem da configuração do canal.
export const ehFlex = (s: { logistic_type?: string; logistic?: { type?: string } }) =>
  (s.logistic_type ?? s.logistic?.type) === "self_service";

// Parte do custo do envio cobrada do vendedor (/shipments/{id}/costs → senders[].cost).
export function freteDoVendedor(c: { senders?: { user_id?: number | string; cost?: number }[] }, contaId: string) {
  const senders = c.senders ?? [];
  const meus = senders.filter((s) => String(s.user_id) === contaId);
  return Math.round((meus.length ? meus : senders).reduce((a, s) => a + (Number(s.cost) || 0), 0) * 100) / 100;
}
