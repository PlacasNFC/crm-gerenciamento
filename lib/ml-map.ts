// Conversão pura dos dados da API do Mercado Livre (sem acesso ao banco).

export type PedidoMl = {
  id: number;
  date_created: string;
  status: string;
  pack_id: number | null;
  total_amount: number;
  buyer?: { id: number; nickname?: string };
  shipping?: { id: number | null };
  order_items: { item: { id: string; title: string }; quantity: number; unit_price: number; sale_fee: number | null }[];
  payments?: { status: string; transaction_amount?: number | null; transaction_amount_refunded?: number | null }[];
};

const ESTORNO = new Set(["refunded", "charged_back"]);

// Valor já devolvido ao comprador (reembolso parcial, total ou chargeback).
export function valorEstornado(p: PedidoMl) {
  const v = (p.payments ?? []).reduce(
    (a, pg) => a + (pg.transaction_amount_refunded || (ESTORNO.has(pg.status) ? pg.transaction_amount ?? 0 : 0)),
    0,
  );
  return Math.round(v * 100) / 100;
}

// Mapeia o status do pedido do ML para o status de entrega do CRM. null = ainda não é venda (pagamento pendente).
// Em devoluções e mediações o ML costuma manter o pedido como "paid": o estorno aparece só no pagamento.
export function statusDoPedido(p: PedidoMl): "a_enviar" | "cancelado" | "devolvido" | null {
  if (p.status === "cancelled" || p.status === "invalid" || p.status === "pending_cancel") return "cancelado";
  if (p.status !== "paid" && p.status !== "partially_refunded") return null;
  const pgs = p.payments ?? [];
  if (pgs.some((pg) => ESTORNO.has(pg.status)) && !pgs.some((pg) => pg.status === "approved")) return "devolvido";
  return "a_enviar";
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
    // desconta reembolsos parciais
    valor_bruto: Math.max(0, Math.round((p.total_amount - valorEstornado(p)) * 100) / 100),
    // sale_fee vem por unidade
    taxa_plataforma: Math.round(itens.reduce((a, i) => a + (i.sale_fee ?? 0) * i.quantity, 0) * 100) / 100,
    observacoes:
      [p.pack_id && `Pacote ${p.pack_id}`, p.shipping?.id && `Envio ${p.shipping.id}`].filter(Boolean).join(" · ") || null,
  };
}

export type EnvioMl = {
  status?: string;
  tracking_number?: string | null;
  receiver_address?: { state?: { id?: string | null; name?: string | null } | null; city?: { name?: string | null } | null } | null;
};

// Estado (UF) e cidade do destinatário. O ML manda o estado como "BR-SP".
export function regiaoDoEnvio(s: EnvioMl): { uf: string | null; cidade: string | null } {
  const id = s.receiver_address?.state?.id ?? "";
  const uf = /^BR-([A-Z]{2})$/.exec(id)?.[1] ?? null;
  const cidade = s.receiver_address?.city?.name?.trim() || null;
  return { uf, cidade };
}
