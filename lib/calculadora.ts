// Motor da calculadora de custo de peça impressa em 3D e simulação de margens.
// Puro (sem banco nem React): roda no servidor, no navegador e nos testes.

// Faixa de tarifa de um canal: vale para preços abaixo de `ate` (null = sem limite).
export type Faixa = { ate: number | null; pct: number; fixo: number; frete: number };
export type CanalCalc = { id: number; nome: string; faixas: Faixa[]; ativo: boolean };

// Parâmetros da oficina (padrão global; cada simulação pode sobrescrever alguns).
export type Parametros = {
  potencia_w: number; // consumo médio da impressora imprimindo
  tarifa_kwh: number;
  impressora_valor: number;
  impressora_vida_h: number; // horas até "pagar" a máquina
  manutencao_h: number; // bicos, mesa, correias… por hora de impressão
  mao_obra_h: number; // valor da sua hora
  perda_pct: number; // purga, suporte, brim, sobras de rolo
  falha_pct: number; // impressões perdidas que precisam ser refeitas
  imposto_pct: number; // sobre o preço de venda (MEI = 0, DAS vai em custos fixos)
  ads_pct: number; // anúncios / marketing, sobre o preço de venda
  margem_alvo_pct: number;
  fixos_mes: number; // DAS, software, internet… rateados pelas peças do mês
  pecas_mes: number;
};

export const PARAMETROS_PADRAO: Parametros = {
  potencia_w: 100,
  tarifa_kwh: 0.95,
  impressora_valor: 2000,
  impressora_vida_h: 5000,
  manutencao_h: 0.3,
  mao_obra_h: 25,
  perda_pct: 5,
  falha_pct: 5,
  imposto_pct: 0,
  ads_pct: 0,
  margem_alvo_pct: 30,
  fixos_mes: 0,
  pecas_mes: 100,
};

export const PARAMETROS_INFO: Record<keyof Parametros, { nome: string; unidade: string; dica?: string }> = {
  potencia_w: { nome: "Consumo da impressora", unidade: "W", dica: "Média imprimindo com mesa aquecida (A1 mini ≈ 80–120 W)" },
  tarifa_kwh: { nome: "Tarifa de energia", unidade: "R$/kWh", dica: "Valor final da conta ÷ kWh, com impostos e bandeira" },
  impressora_valor: { nome: "Valor da impressora", unidade: "R$" },
  impressora_vida_h: { nome: "Vida útil da impressora", unidade: "h", dica: "Horas de impressão até ela se pagar" },
  manutencao_h: { nome: "Manutenção", unidade: "R$/h", dica: "Bicos, mesa PEI, correias, lubrificação" },
  mao_obra_h: { nome: "Valor da hora de trabalho", unidade: "R$/h" },
  perda_pct: { nome: "Perda de material", unidade: "%", dica: "Purga, suportes, brim e fim de rolo" },
  falha_pct: { nome: "Taxa de falha", unidade: "%", dica: "Impressões perdidas que precisam ser refeitas" },
  imposto_pct: { nome: "Imposto sobre a venda", unidade: "%", dica: "MEI: 0 (o DAS entra em custos fixos). Simples: alíquota efetiva" },
  ads_pct: { nome: "Anúncios / marketing", unidade: "%", dica: "Do preço de venda (ex.: ACOS do Mercado Ads)" },
  margem_alvo_pct: { nome: "Margem líquida alvo", unidade: "%" },
  fixos_mes: { nome: "Custos fixos mensais", unidade: "R$", dica: "DAS, software, internet, aluguel…" },
  pecas_mes: { nome: "Peças vendidas por mês", unidade: "un", dica: "Para ratear os custos fixos" },
};

// Linha de material/insumo da simulação, apontando para um item do estoque.
export type LinhaFilamento = { item_id: number; gramas: number };
export type LinhaInsumo = { item_id: number; qtd: number };

export type Entrada = {
  pecas_por_impressao: number; // peças na mesa; peso e tempo abaixo são da mesa inteira
  tempo_impressao_min: number;
  filamentos: LinhaFilamento[];
  preparo_min: number; // fatiar, montar e tirar a mesa (por impressão)
  acabamento_min: number; // pós-processamento, montagem, embalar (por peça)
  insumos: LinhaInsumo[]; // por peça
  outros_custos: number; // por peça
  preco_venda: number;
  preco_mercado: number | null; // preço da concorrência, para comparar
  canal_id: number | null; // canal principal
  ajustes: Partial<Parametros>; // parâmetros sobrescritos só nesta simulação
};

export const ENTRADA_VAZIA: Entrada = {
  pecas_por_impressao: 1,
  tempo_impressao_min: 60,
  filamentos: [],
  preparo_min: 5,
  acabamento_min: 2,
  insumos: [],
  outros_custos: 0,
  preco_venda: 0,
  preco_mercado: null,
  canal_id: null,
  ajustes: {},
};

// Item do estoque como a calculadora enxerga (custo por kg para filamento, por unidade para o resto).
export type ItemCusto = { id: number; nome: string; categoria: string; unidade: string; custo_unitario: number; quantidade: number };

export type Custos = {
  material: number;
  energia: number;
  maquina: number;
  falhas: number;
  mao_obra: number;
  insumos: number;
  fixos: number;
  outros: number;
  total: number;
  gramas_peca: number;
  horas_peca: number;
  avisos: string[];
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function parametrosEfetivos(base: Parametros, ajustes: Partial<Parametros>): Parametros {
  const p = { ...base };
  for (const k of Object.keys(ajustes) as (keyof Parametros)[]) {
    const v = ajustes[k];
    if (typeof v === "number" && Number.isFinite(v)) p[k] = v;
  }
  return p;
}

const pos = (v: unknown, max = 1e7) => Math.min(max, Math.max(0, n(Number(v))));

// Valida o que veio do navegador / do banco (JSON livre) para o formato da Entrada.
export function normalizarEntrada(raw: unknown): Entrada {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, 30) : []) as Record<string, unknown>[];
  const ajustes: Partial<Parametros> = {};
  const aj = (r.ajustes && typeof r.ajustes === "object" ? r.ajustes : {}) as Record<string, unknown>;
  for (const k of Object.keys(PARAMETROS_PADRAO) as (keyof Parametros)[]) {
    if (aj[k] != null && aj[k] !== "" && Number.isFinite(Number(aj[k]))) ajustes[k] = pos(aj[k]);
  }
  const mercado = r.preco_mercado == null || r.preco_mercado === "" ? null : pos(r.preco_mercado);
  return {
    pecas_por_impressao: Math.max(1, Math.floor(pos(r.pecas_por_impressao, 10000)) || 1),
    tempo_impressao_min: pos(r.tempo_impressao_min),
    filamentos: lista(r.filamentos)
      .filter((l) => Number.isInteger(Number(l.item_id)))
      .map((l) => ({ item_id: Number(l.item_id), gramas: pos(l.gramas) })),
    preparo_min: pos(r.preparo_min),
    acabamento_min: pos(r.acabamento_min),
    insumos: lista(r.insumos)
      .filter((l) => Number.isInteger(Number(l.item_id)))
      .map((l) => ({ item_id: Number(l.item_id), qtd: pos(l.qtd) })),
    outros_custos: pos(r.outros_custos),
    preco_venda: pos(r.preco_venda),
    preco_mercado: mercado || null,
    canal_id: Number.isInteger(Number(r.canal_id)) && r.canal_id != null ? Number(r.canal_id) : null,
    ajustes,
  };
}

export function normalizarFaixas(raw: unknown): Faixa[] {
  const lista = (Array.isArray(raw) ? raw.slice(0, 10) : []) as Record<string, unknown>[];
  const faixas = lista.map((f) => ({
    ate: f.ate == null || f.ate === "" || !Number.isFinite(Number(f.ate)) || Number(f.ate) <= 0 ? null : Number(f.ate),
    pct: Math.min(99, pos(f.pct)),
    fixo: pos(f.fixo),
    frete: pos(f.frete),
  }));
  // Só uma faixa "sem limite", sempre a última (e a última nunca tem limite).
  const ord = ordenarFaixas(faixas).filter((f, i, a) => f.ate != null || i === a.length - 1);
  if (!ord.length) return [{ ate: null, pct: 0, fixo: 0, frete: 0 }];
  ord[ord.length - 1] = { ...ord[ord.length - 1], ate: null };
  return ord;
}

// Custo de produção de UMA peça.
export function custoPeca(e: Entrada, p: Parametros, itens: ItemCusto[]): Custos {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const avisos: string[] = [];
  const pecas = Math.max(1, Math.floor(n(e.pecas_por_impressao)) || 1);
  const horasMesa = Math.max(0, n(e.tempo_impressao_min)) / 60;

  let gramasMesa = 0;
  let materialMesa = 0;
  for (const l of e.filamentos) {
    const it = porId.get(l.item_id);
    const g = Math.max(0, n(l.gramas));
    gramasMesa += g;
    if (!it) {
      avisos.push("Um filamento desta simulação não está mais no estoque (custo zerado).");
      continue;
    }
    materialMesa += (g / 1000) * n(it.custo_unitario);
  }
  const material = (materialMesa * (1 + n(p.perda_pct) / 100)) / pecas;
  const energia = ((n(p.potencia_w) / 1000) * horasMesa * n(p.tarifa_kwh)) / pecas;
  const depreciacao = n(p.impressora_vida_h) > 0 ? n(p.impressora_valor) / p.impressora_vida_h : 0;
  const maquina = ((depreciacao + n(p.manutencao_h)) * horasMesa) / pecas;
  // Falha refaz a impressão: perde material, energia e máquina de novo.
  const falhas = (material + energia + maquina) * (n(p.falha_pct) / 100);
  const minutosPeca = Math.max(0, n(e.preparo_min)) / pecas + Math.max(0, n(e.acabamento_min));
  const mao_obra = (minutosPeca / 60) * n(p.mao_obra_h);

  let insumos = 0;
  for (const l of e.insumos) {
    const it = porId.get(l.item_id);
    if (!it) {
      avisos.push("Um insumo desta simulação não está mais no estoque (custo zerado).");
      continue;
    }
    insumos += Math.max(0, n(l.qtd)) * n(it.custo_unitario);
  }
  const fixos = n(p.pecas_mes) > 0 ? n(p.fixos_mes) / p.pecas_mes : 0;
  const outros = Math.max(0, n(e.outros_custos));
  const total = material + energia + maquina + falhas + mao_obra + insumos + fixos + outros;
  return {
    material, energia, maquina, falhas, mao_obra, insumos, fixos, outros, total,
    gramas_peca: gramasMesa / pecas,
    horas_peca: horasMesa / pecas,
    avisos: [...new Set(avisos)],
  };
}

export function faixaDoPreco(faixas: Faixa[], preco: number): Faixa {
  const ord = ordenarFaixas(faixas);
  return ord.find((f) => f.ate == null || preco < f.ate) ?? ord[ord.length - 1] ?? { ate: null, pct: 0, fixo: 0, frete: 0 };
}

export function ordenarFaixas(faixas: Faixa[]): Faixa[] {
  return [...faixas].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
}

export type Resultado = {
  preco: number;
  comissao: number;
  taxa_fixa: number;
  frete: number;
  imposto: number;
  ads: number;
  custo: number;
  lucro: number;
  margem: number; // lucro ÷ preço (fração)
  markup: number; // preço ÷ custo
  recebe: number; // o que cai na conta após a plataforma
};

export function resultado(preco: number, custo: number, canal: CanalCalc | null, p: Parametros): Resultado {
  const f = canal ? faixaDoPreco(canal.faixas, preco) : { pct: 0, fixo: 0, frete: 0, ate: null };
  const comissao = (preco * n(f.pct)) / 100;
  // Taxa fixa nunca passa de metade do preço (regra da Shopee para itens muito baratos).
  const taxa_fixa = Math.min(n(f.fixo), preco / 2);
  const frete = n(f.frete);
  const imposto = (preco * n(p.imposto_pct)) / 100;
  const ads = (preco * n(p.ads_pct)) / 100;
  const lucro = preco - custo - comissao - taxa_fixa - frete - imposto - ads;
  return {
    preco, comissao, taxa_fixa, frete, imposto, ads, custo, lucro,
    margem: preco > 0 ? lucro / preco : 0,
    markup: custo > 0 ? preco / custo : 0,
    recebe: preco - comissao - taxa_fixa - frete,
  };
}

// Menor preço que atinge a margem alvo (fração) no canal. null = impossível (taxas % somam 100% ou mais).
export function precoParaMargem(custo: number, canal: CanalCalc | null, p: Parametros, margem: number): number | null {
  const faixas = canal && canal.faixas.length ? ordenarFaixas(canal.faixas) : [{ ate: null, pct: 0, fixo: 0, frete: 0 }];
  const atinge = (preco: number) => resultado(preco, custo, canal, p).margem >= margem - 1e-9;
  const candidatos: number[] = [];
  let inicio = 0;
  for (const f of faixas) {
    const fim = f.ate ?? Infinity;
    const divisor = 1 - (n(f.pct) + n(p.imposto_pct) + n(p.ads_pct)) / 100 - margem;
    // Taxa fixa cheia, ou limitada a metade do preço (itens muito baratos).
    const solucoes = [(custo + n(f.fixo) + n(f.frete)) / divisor, (custo + n(f.frete)) / (divisor - 0.5)];
    for (const preco of solucoes) {
      // Arredonda para o centavo de cima antes de testar, que é o preço que vai ser mostrado.
      const c = Math.ceil(preco * 100 - 1e-6) / 100;
      if (Number.isFinite(c) && c > 0 && c >= inicio && c < fim && atinge(c)) candidatos.push(c);
    }
    // O início da faixa pode já bastar (ex.: acima de R$ 79 some a taxa fixa).
    if (inicio > 0 && atinge(inicio)) candidatos.push(inicio);
    inicio = fim;
  }
  return candidatos.length ? Math.min(...candidatos) : null;
}

export type Veredito = { nivel: "seguir" | "atencao" | "prejuizo"; texto: string };

export function veredito(margem: number, alvoPct: number): Veredito {
  if (margem < 0) return { nivel: "prejuizo", texto: "Prejuízo" };
  if (margem * 100 < alvoPct) return { nivel: "atencao", texto: "Abaixo da meta" };
  return { nivel: "seguir", texto: "Na meta" };
}

// Canais sugeridos na primeira vez (valores de out/2026; confira na central de cada marketplace).
export const CANAIS_PADRAO: Omit<CanalCalc, "id">[] = [
  {
    nome: "Mercado Livre Clássico",
    ativo: true,
    faixas: [
      { ate: 79, pct: 14, fixo: 6.75, frete: 0 },
      { ate: null, pct: 14, fixo: 0, frete: 22 },
    ],
  },
  {
    nome: "Mercado Livre Premium",
    ativo: true,
    faixas: [
      { ate: 79, pct: 19, fixo: 6.75, frete: 0 },
      { ate: null, pct: 19, fixo: 0, frete: 22 },
    ],
  },
  {
    nome: "Shopee (CNPJ)",
    ativo: true,
    faixas: [
      { ate: 80, pct: 20, fixo: 4.5, frete: 0 },
      { ate: 100, pct: 14, fixo: 16, frete: 0 },
      { ate: 200, pct: 14, fixo: 20, frete: 0 },
      { ate: null, pct: 14, fixo: 26, frete: 0 },
    ],
  },
  {
    nome: "TikTok Shop",
    ativo: true,
    faixas: [
      { ate: 50, pct: 10, fixo: 4, frete: 0 },
      { ate: null, pct: 6, fixo: 6, frete: 0 },
    ],
  },
  { nome: "Venda direta (Pix)", ativo: true, faixas: [{ ate: null, pct: 0, fixo: 0, frete: 0 }] },
];
