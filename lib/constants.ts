export const CANAIS = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  outro: "Outro / Direto",
} as const;

export const STATUS_ENTREGA = {
  a_enviar: "A enviar",
  enviado: "Enviado",
  entregue: "Entregue",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
} as const;

export const CATEGORIAS_SAIDA = [
  "Matéria-prima / NFC",
  "Embalagem",
  "Frete / Correios",
  "Anúncios",
  "Ferramentas / Software",
  "Impostos",
  "Retirada (pró-labore)",
  "Outros",
];

export const CATEGORIAS_ENTRADA = ["Venda avulsa", "Aporte", "Reembolso", "Outros"];

export type Canal = keyof typeof CANAIS;
export type StatusEntrega = keyof typeof STATUS_ENTREGA;

export const brl = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (d: string | Date) =>
  new Date(typeof d === "string" ? d.slice(0, 10) + "T12:00:00" : d).toLocaleDateString("pt-BR");

// "YYYY-MM" do mês corrente no fuso de São Paulo
export const mesAtual = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

export const hoje = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
