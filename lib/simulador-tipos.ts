// Constantes do simulador (podem ir para o navegador; sem acesso ao banco).
export const TIPOS = { gold_special: "Clássico", gold_pro: "Premium" } as const;
export type Tipo = keyof typeof TIPOS;

export const LOGISTICAS = {
  drop_off: "Mercado Envios (agência ou correios)",
  cross_docking: "Mercado Envios Coleta",
  fulfillment: "Mercado Envios Full",
} as const;
export type Logistica = keyof typeof LOGISTICAS;
