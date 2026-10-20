// Simulador de custos do Mercado Livre: usa as mesmas fontes do simulador oficial
// (tarifa de venda por categoria/tipo de anúncio e custo de envio pago pelo vendedor),
// mais os custos da loja (produto, embalagem, imposto) para chegar no lucro.
import { contaMl, mlGet } from "./ml";
import { TIPOS, type Logistica, type Tipo } from "./simulador-tipos";

export { LOGISTICAS, TIPOS } from "./simulador-tipos";

export type Entrada = {
  preco: number;
  categoria: string;
  logistica: Logistica;
  altura: number; // cm
  largura: number; // cm
  comprimento: number; // cm
  peso: number; // g
  custoProduto: number;
  embalagem: number;
  impostoPct: number;
  margemAlvo: number | null; // % desejada sobre o preço
};

export type Resultado = {
  tipo: Tipo;
  preco: number;
  tarifaPct: number;
  tarifa: number; // inclui custo fixo, quando houver
  custoFixo: number;
  envio: number; // pago pelo vendedor
  envioCheio: number | null; // valor antes do desconto do ML
  descontoEnvioPct: number | null;
  freteGratis: boolean;
  recebe: number; // preço − tarifa − envio (o que o ML repassa)
  imposto: number;
  lucro: number;
  margemPct: number;
  precoSugerido: number | null;
};

type ListingPrice = { sale_fee_amount: number; sale_fee_details: { fixed_fee: number; percentage_fee: number; gross_amount: number } };
type Frete = {
  coverage?: {
    all_country?: { list_cost: number; discount?: { rate: number; promoted_amount: number }; free_shipping_by_meli?: boolean };
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

async function custosMl(e: Entrada, tipo: Tipo, preco: number) {
  const dims = `${Math.ceil(e.altura)}x${Math.ceil(e.largura)}x${Math.ceil(e.comprimento)},${Math.ceil(e.peso)}`;
  const vendedor = await contaMl();
  if (!vendedor) throw new Error("Conecte a conta do Mercado Livre em Integrações para simular.");
  const qTarifa = new URLSearchParams({
    price: preco.toFixed(2),
    category_id: e.categoria,
    listing_type_id: tipo,
    logistic_type: e.logistica,
    shipping_mode: "me2",
    dimensions: dims,
  });
  const qFrete = new URLSearchParams({
    dimensions: dims,
    item_price: preco.toFixed(2),
    listing_type_id: tipo,
    mode: "me2",
    condition: "new",
    logistic_type: e.logistica,
    verbose: "true",
  });
  const [tarifa, frete] = await Promise.all([
    mlGet<ListingPrice>(`/sites/MLB/listing_prices?${qTarifa}`),
    mlGet<Frete>(`/users/${vendedor}/shipping_options/free?${qFrete}`),
  ]);
  const c = frete.coverage?.all_country;
  return {
    tarifaPct: tarifa.sale_fee_details.percentage_fee,
    tarifa: tarifa.sale_fee_amount,
    custoFixo: tarifa.sale_fee_details.fixed_fee,
    envio: c?.list_cost ?? 0,
    envioCheio: c?.discount ? c.discount.promoted_amount : null,
    descontoEnvioPct: c?.discount ? Math.round(c.discount.rate * 100) : null,
    freteGratis: !!c,
  };
}

function fechar(e: Entrada, tipo: Tipo, preco: number, ml: Awaited<ReturnType<typeof custosMl>>, precoSugerido: number | null): Resultado {
  const recebe = preco - ml.tarifa - ml.envio;
  const imposto = (preco * e.impostoPct) / 100;
  const lucro = recebe - imposto - e.custoProduto - e.embalagem;
  return {
    tipo,
    preco,
    ...ml,
    recebe: r2(recebe),
    imposto: r2(imposto),
    lucro: r2(lucro),
    margemPct: preco > 0 ? (lucro / preco) * 100 : 0,
    precoSugerido,
  };
}

// Preço que dá a margem desejada. A tarifa e o frete mudam com o preço (ex.: degrau dos R$ 79),
// então recalcula com a API até estabilizar.
async function precoParaMargem(e: Entrada, tipo: Tipo, margem: number, chute: number) {
  let p = chute;
  for (let i = 0; i < 6; i++) {
    const ml = await custosMl(e, tipo, p);
    const fixos = e.custoProduto + e.embalagem + ml.envio + ml.custoFixo;
    const variavel = 1 - ml.tarifaPct / 100 - e.impostoPct / 100 - margem / 100;
    if (variavel <= 0) return null;
    const novo = Math.ceil((fixos / variavel) * 100) / 100;
    if (Math.abs(novo - p) < 0.01) return novo;
    p = novo;
  }
  return r2(p);
}

export async function simular(e: Entrada): Promise<Resultado[]> {
  return Promise.all(
    (Object.keys(TIPOS) as Tipo[]).map(async (tipo) => {
      const [ml, sugerido] = await Promise.all([
        custosMl(e, tipo, e.preco),
        e.margemAlvo != null ? precoParaMargem(e, tipo, e.margemAlvo, e.preco) : Promise.resolve(null),
      ]);
      return fechar(e, tipo, e.preco, ml, sugerido);
    }),
  );
}

// ---- dados de apoio

type ItemMl = {
  id: string;
  title: string;
  price: number;
  category_id: string;
  listing_type_id: string;
  shipping?: { logistic_type?: string };
  attributes?: { id: string; value_name: string | null }[];
};

export type Anuncio = {
  id: string;
  titulo: string;
  preco: number;
  categoria: string;
  tipo: string;
  logistica: string | null;
  altura: number | null;
  largura: number | null;
  comprimento: number | null;
  peso: number | null;
};

const medida = (attrs: ItemMl["attributes"], id: string) => {
  const v = attrs?.find((a) => a.id === id)?.value_name;
  const n = v ? parseFloat(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return null;
  return /kg/i.test(v!) ? n * 1000 : n; // peso sempre em gramas
};

export async function anunciosAtivos(): Promise<Anuncio[]> {
  const vendedor = await contaMl();
  if (!vendedor) return [];
  const busca = await mlGet<{ results: string[] }>(`/users/${vendedor}/items/search?status=active&limit=50`);
  const ids = busca.results;
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));
  const itens = (
    await Promise.all(
      lotes.map((l) =>
        mlGet<{ code: number; body: ItemMl }[]>(`/items?ids=${l.join(",")}&attributes=id,title,price,category_id,listing_type_id,shipping,attributes`),
      ),
    )
  ).flat();
  return itens
    .filter((x) => x.code === 200)
    .map(({ body: b }) => ({
      id: b.id,
      titulo: b.title,
      preco: b.price,
      categoria: b.category_id,
      tipo: b.listing_type_id,
      logistica: b.shipping?.logistic_type ?? null,
      altura: medida(b.attributes, "SELLER_PACKAGE_HEIGHT"),
      largura: medida(b.attributes, "SELLER_PACKAGE_WIDTH"),
      comprimento: medida(b.attributes, "SELLER_PACKAGE_LENGTH"),
      peso: medida(b.attributes, "SELLER_PACKAGE_WEIGHT"),
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
}

export type Categoria = { id: string; nome: string; caminho: string };

export async function buscarCategorias(q: string): Promise<Categoria[]> {
  const r = await mlGet<{ category_id: string; category_name: string; domain_name: string }[]>(
    `/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(q)}`,
  );
  const vistos = new Set<string>();
  return r
    .filter((c) => !vistos.has(c.category_id) && vistos.add(c.category_id))
    .map((c) => ({ id: c.category_id, nome: c.category_name, caminho: c.domain_name }));
}

export async function nomeCategoria(id: string) {
  const c = await mlGet<{ name: string; path_from_root?: { name: string }[] }>(`/categories/${encodeURIComponent(id)}`);
  return { id, nome: c.name, caminho: (c.path_from_root ?? []).map((p) => p.name).join(" › ") };
}
