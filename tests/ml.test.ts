import { describe, expect, it } from "vitest";
import { itensDoPedido, statusDoEnvio, statusDoPedido, type PedidoMl } from "@/lib/ml-map";

const pedido: PedidoMl = {
  id: 2000001234,
  date_created: "2026-10-15T14:00:00.000-03:00",
  status: "paid",
  pack_id: null,
  total_amount: 129.9,
  order_items: [
    { item: { id: "MLB1", title: "Placa NFC Instagram", seller_sku: "PL-001" }, quantity: 2, unit_price: 45, sale_fee: 5.4 },
    { item: { id: "MLB2", title: "Placa NFC Wi-Fi", seller_sku: null }, quantity: 1, unit_price: 39.9, sale_fee: 4.79 },
  ],
};

describe("Mercado Livre", () => {
  it("multiplica sale_fee (por unidade) pela quantidade e liga SKU ao produto", () => {
    const { itens, taxa } = itensDoPedido(pedido, new Map([["pl-001", 7]]));
    expect(taxa).toBe(15.59);
    expect(itens).toEqual([
      { produto_id: 7, descricao: "Placa NFC Instagram", quantidade: 2, valor_unitario: 45 },
      { produto_id: null, descricao: "Placa NFC Wi-Fi", quantidade: 1, valor_unitario: 39.9 },
    ]);
  });
  it("mapeia status do pedido", () => {
    expect(statusDoPedido("paid")).toBe("a_enviar");
    expect(statusDoPedido("cancelled")).toBe("cancelado");
    expect(statusDoPedido("payment_required")).toBeNull();
    expect(statusDoPedido("payment_in_process")).toBeNull();
  });
  it("mapeia status do envio", () => {
    expect(statusDoEnvio("shipped")).toBe("enviado");
    expect(statusDoEnvio("delivered")).toBe("entregue");
    expect(statusDoEnvio("ready_to_ship")).toBeNull();
  });
});
