import { documentoValido, ncmValido, sugerirCfop } from "./fiscal";

export type EmpresaFiscal = { cnpj: string | null; ie: string | null; uf: string; csosn_padrao: string };
export type ClienteFiscal = {
  nome: string; documento: string | null; ie: string | null; contribuinte: boolean; cep: string | null;
  logradouro: string | null; numero: string | null; bairro: string | null; municipio: string | null; uf: string | null;
};
export type ItemFiscal = {
  descricao: string; quantidade: number; valor_unitario: number;
  produto: { sku: string; ncm: string | null; unidade: string; origem: number; gtin: string | null; producao_propria: boolean } | null;
};

export const INFO_SIMPLES =
  "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI.";

// Monta os dados que a pessoa digita no emissor do Sebrae e lista o que falta para a nota não ser rejeitada.
export function montarEmissao(empresa: EmpresaFiscal, cliente: ClienteFiscal | null, itens: ItemFiscal[]) {
  const pendencias: string[] = [];
  if (!empresa.cnpj) pendencias.push("Cadastre o CNPJ da empresa em Configurações.");
  if (!empresa.ie) pendencias.push("Cadastre a inscrição estadual da empresa em Configurações.");

  if (!cliente) pendencias.push("Vincule um cliente: a NF-e exige destinatário identificado.");
  else {
    if (!cliente.documento || !documentoValido(cliente.documento)) pendencias.push("Cliente sem CPF/CNPJ válido.");
    const falta = (["cep", "logradouro", "numero", "bairro", "municipio", "uf"] as const).filter((k) => !cliente[k]);
    if (falta.length) pendencias.push(`Endereço do cliente incompleto (${falta.join(", ")}).`);
    if (cliente.contribuinte && !cliente.ie) pendencias.push("Cliente contribuinte sem inscrição estadual.");
  }

  const ufDestino = cliente?.uf ?? null;
  const linhas = itens.map((i, n) => {
    if (!i.produto) pendencias.push(`Item ${n + 1} ("${i.descricao}") não está ligado a um produto cadastrado: sem NCM.`);
    else if (!ncmValido(i.produto.ncm)) pendencias.push(`Produto ${i.produto.sku} sem NCM válido (8 dígitos).`);
    const cfop = sugerirCfop({
      ufEmitente: empresa.uf,
      ufDestino,
      contribuinte: cliente?.contribuinte ?? false,
      producaoPropria: i.produto?.producao_propria ?? false,
    });
    return {
      numero: n + 1,
      codigo: i.produto?.sku ?? "",
      descricao: i.descricao,
      ncm: i.produto?.ncm ?? "",
      cfop,
      csosn: empresa.csosn_padrao,
      origem: i.produto?.origem ?? 0,
      unidade: i.produto?.unidade ?? "UN",
      gtin: i.produto?.gtin || "SEM GTIN",
      quantidade: i.quantidade,
      valorUnitario: i.valor_unitario,
      total: Math.round(i.quantidade * i.valor_unitario * 100) / 100,
    };
  });

  const interestadual = !!ufDestino && ufDestino !== empresa.uf;
  const consumidorFinal = !(cliente?.contribuinte ?? false);
  return {
    naturezaOperacao: "Venda de mercadoria",
    finalidade: "1 – NF-e normal",
    consumidorFinal,
    indicadorIE: cliente?.contribuinte ? "1 – Contribuinte ICMS" : "9 – Não contribuinte",
    interestadual,
    itens: linhas,
    total: Math.round(linhas.reduce((a, l) => a + l.total, 0) * 100) / 100,
    informacoesComplementares: INFO_SIMPLES,
    pendencias,
  };
}
