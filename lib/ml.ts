// Integração Mercado Livre: OAuth 2.0 + importação de pedidos (cron diário, botão manual e notificações).
// Access token dura 6h; o refresh token é de uso único (cada refresh devolve um novo).
import { sql } from "./db";
import { ehFlex, freteDoVendedor, linhasDoPedido, statusDoEnvio, statusDoPedido, vendaDoPedido, type PedidoMl } from "./ml-map";
import { custoDosItens, expandirLinha, type Vinculo } from "./itens";
import { custosProdutos } from "./produtos";

const API = "https://api.mercadolibre.com";
const AUTH = "https://auth.mercadolivre.com.br/authorization";
const CANAL = "mercado_livre";

export const mlConfigurado = () => !!(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET);

export function redirectUri(origem: string) {
  return `${process.env.ML_REDIRECT_BASE ?? origem}/api/integracoes/ml/callback`;
}

export function urlAutorizacao(origem: string, state: string) {
  const u = new URL(AUTH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.ML_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri(origem));
  u.searchParams.set("state", state);
  return u.toString();
}

type Token = { access_token: string; refresh_token: string; user_id: number; expires_in: number };

async function pedirToken(params: Record<string, string>): Promise<Token> {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: process.env.ML_CLIENT_ID!, client_secret: process.env.ML_CLIENT_SECRET!, ...params }),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Livre recusou o token: ${j.error ?? r.status} ${j.message ?? ""}`.trim());
  if (!j.refresh_token) throw new Error("O app do Mercado Livre não devolveu refresh token: ative o escopo offline_access.");
  return j as Token;
}

export async function conectar(code: string, origem: string) {
  const t = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origem) });
  let me: { nickname?: string } = {};
  try {
    const r = await fetch(`${API}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` }, cache: "no-store" });
    if (r.ok) me = await r.json();
  } catch {
    // apelido é só para exibição
  }
  await sql`INSERT INTO integracoes (provedor, conta_id, conta_nome, access_token, refresh_token, expira_em, ultimo_erro, updated_at)
    VALUES (${CANAL}, ${String(t.user_id)}, ${me.nickname ?? null}, ${t.access_token}, ${t.refresh_token},
      now() + make_interval(secs => ${t.expires_in}), NULL, now())
    ON CONFLICT (provedor) DO UPDATE SET conta_id = EXCLUDED.conta_id, conta_nome = EXCLUDED.conta_nome,
      access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expira_em = EXCLUDED.expira_em,
      ultimo_erro = NULL, updated_at = now()`;
}

export async function desconectar() {
  await sql`DELETE FROM integracoes WHERE provedor = ${CANAL}`;
}

type Integracao = { conta_id: string; access_token: string; refresh_token: string; expira_em: Date; ultima_sync: Date | null };

export async function integracaoMl() {
  const [i] = (await sql`SELECT * FROM integracoes WHERE provedor = ${CANAL}`) as Integracao[];
  return i ?? null;
}

async function tokenAtual(): Promise<Integracao> {
  const i = await integracaoMl();
  if (!i) throw new Error("Mercado Livre não conectado.");
  if (new Date(i.expira_em).getTime() - Date.now() > 5 * 60_000) return i;

  const t = await pedirToken({ grant_type: "refresh_token", refresh_token: i.refresh_token });
  // só grava se ninguém renovou antes (o refresh antigo deixa de valer)
  const upd = await sql`UPDATE integracoes SET access_token = ${t.access_token}, refresh_token = ${t.refresh_token},
      expira_em = now() + make_interval(secs => ${t.expires_in}), updated_at = now()
    WHERE provedor = ${CANAL} AND refresh_token = ${i.refresh_token} RETURNING *`;
  if (upd.length) return upd[0] as Integracao;
  return (await integracaoMl())!;
}

async function get<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`GET ${path.split("?")[0]} → ${r.status}`);
  return r.json() as Promise<T>;
}

// Frete pago pelo vendedor: Flex = custo configurado no canal; demais = parte do envio cobrada do vendedor.
// Pedidos do mesmo pacote dividem um envio: o frete fica só no primeiro. pendente = não deu para obter (conferir à mão).
async function freteDoPedido(p: PedidoMl, i: Integracao): Promise<{ frete: number; pendente: boolean }> {
  const envio = p.shipping?.id;
  if (!envio) return { frete: 0, pendente: false };
  const [jaContado] = await sql`SELECT 1 FROM vendas WHERE canal = ${CANAL} AND pedido_externo <> ${String(p.id)} AND frete > 0
    AND observacoes ~ ${`Envio ${envio}\\M`} LIMIT 1`;
  if (jaContado) return { frete: 0, pendente: false };
  try {
    const s = await get<{ logistic_type?: string; logistic?: { type?: string } }>(`/shipments/${envio}`, i.access_token);
    if (ehFlex(s)) {
      const [c] = (await sql`SELECT custo_flex FROM canais_config WHERE canal = ${CANAL}`) as { custo_flex: string }[];
      return { frete: Number(c?.custo_flex ?? 0), pendente: false };
    }
    const custos = await get<Parameters<typeof freteDoVendedor>[0]>(`/shipments/${envio}/costs`, i.access_token);
    return { frete: freteDoVendedor(custos, i.conta_id), pendente: false };
  } catch {
    return { frete: 0, pendente: true };
  }
}

// Cria a venda de um pedido pago (com itens, custo e frete) ou cancela a já existente.
// Venda importada antes do cadastro de produtos (sem itens) ganha itens e tem custo/frete preenchidos só onde estavam zerados.
async function importarPedido(p: PedidoMl, i: Integracao): Promise<"novo" | "atualizado" | null> {
  const st = statusDoPedido(p.status);
  if (!st) return null;
  const id = String(p.id);
  if (st === "cancelado") {
    const upd = await sql`UPDATE vendas SET status_entrega = 'cancelado'
      WHERE canal = ${CANAL} AND pedido_externo = ${id} AND status_entrega NOT IN ('cancelado','devolvido') RETURNING id`;
    return upd.length ? "atualizado" : null;
  }
  const [atual] = (await sql`SELECT EXISTS (SELECT 1 FROM venda_itens WHERE venda_id = v.id) AS tem_itens
    FROM vendas v WHERE canal = ${CANAL} AND pedido_externo = ${id}`) as { tem_itens: boolean }[];
  if (atual?.tem_itens) return null;

  const v = vendaDoPedido(p);
  const linhas = linhasDoPedido(p);
  const vinculos = (await sql`SELECT anuncio_id, variacao_id, produto_id, quantidade FROM anuncio_vinculos
    WHERE canal = ${CANAL} AND anuncio_id = ANY(${linhas.map((l) => l.anuncio_id)}::text[]) ORDER BY id`) as (Vinculo & {
    anuncio_id: string; variacao_id: string;
  })[];
  const custos = await custosProdutos([...new Set(vinculos.map((x) => x.produto_id))]);
  const itens = linhas.flatMap((l) =>
    expandirLinha(l, vinculos.filter((x) => x.anuncio_id === l.anuncio_id && x.variacao_id === l.variacao_id), custos),
  );
  const custo = custoDosItens(itens);
  const { frete, pendente } = await freteDoPedido(p, i);

  // trava por pedido: cron, botão e notificação podem importar o mesmo pedido ao mesmo tempo
  const [, ins, itensIns] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${`ml:${id}`}))`,
    sql`INSERT INTO vendas (data, canal, pedido_externo, cliente, produto, quantidade, valor_bruto, taxa_plataforma, observacoes)
      SELECT ${v.data}::date, ${CANAL}, ${id}, ${v.cliente}, ${v.produto}, ${v.quantidade}, ${v.valor_bruto}, ${v.taxa_plataforma}, ${v.observacoes}
      WHERE NOT EXISTS (SELECT 1 FROM vendas WHERE canal = ${CANAL} AND pedido_externo = ${id})
      RETURNING id`,
    sql`INSERT INTO venda_itens (venda_id, produto_id, anuncio_id, variacao_id, descricao, quantidade, valor, custo_unitario, custo_manual)
      SELECT v.id, x.* FROM vendas v, jsonb_to_recordset(${JSON.stringify(itens)}::jsonb) AS x(produto_id int, anuncio_id text,
        variacao_id text, descricao text, quantidade int, valor numeric, custo_unitario numeric, custo_manual boolean)
      WHERE v.canal = ${CANAL} AND v.pedido_externo = ${id} AND NOT EXISTS (SELECT 1 FROM venda_itens WHERE venda_id = v.id)
      RETURNING venda_id`,
    sql`UPDATE vendas SET custo_produto = CASE WHEN custo_produto = 0 THEN ${custo} ELSE custo_produto END,
        frete_pendente = (frete = 0 AND ${pendente}),
        frete = CASE WHEN frete = 0 THEN ${frete} ELSE frete END
      WHERE canal = ${CANAL} AND pedido_externo = ${id}
        AND EXISTS (SELECT 1 FROM venda_itens WHERE venda_id = vendas.id)`,
  ]);
  if ((ins as unknown[]).length) return "novo";
  return (itensIns as unknown[]).length ? "atualizado" : null;
}

// Atualiza a entrega pelo status do envio. Devolve true se mudou algo.
async function atualizarEnvio(vendaId: number, envioId: string, token: string) {
  const s = await get<{ status?: string; tracking_number?: string | null }>(`/shipments/${envioId}`, token);
  const novo = statusDoEnvio(s.status);
  if (!novo) return false;
  const upd = await sql`UPDATE vendas SET status_entrega = ${novo}, codigo_rastreio = COALESCE(${s.tracking_number ?? null}, codigo_rastreio)
    WHERE id = ${vendaId} AND status_entrega <> ${novo} RETURNING id`;
  return upd.length > 0;
}

export async function sincronizar({ dias = 30 } = {}) {
  const i = await tokenAtual();
  try {
    const desde = i.ultima_sync
      ? new Date(new Date(i.ultima_sync).getTime() - 2 * 864e5) // margem para pedidos que mudaram de status
      : new Date(Date.now() - dias * 864e5);

    let novos = 0, atualizados = 0, offset = 0, total = Infinity;
    while (offset < total && offset < 2000) {
      const q = new URLSearchParams({ seller: i.conta_id, "order.date_created.from": desde.toISOString(), sort: "date_asc", offset: String(offset), limit: "50" });
      const pag = await get<{ results: PedidoMl[]; paging: { total: number } }>(`/orders/search?${q}`, i.access_token);
      total = pag.paging.total;
      offset += 50;
      for (const p of pag.results) {
        const r = await importarPedido(p, i);
        if (r === "novo") novos++;
        else if (r === "atualizado") atualizados++;
      }
    }

    // atualiza entrega dos pedidos em aberto pelo status do envio
    const abertos = (await sql`SELECT id, observacoes FROM vendas WHERE canal = ${CANAL} AND status_entrega IN ('a_enviar','enviado')
      AND observacoes LIKE '%Envio %' ORDER BY id DESC LIMIT 100`) as { id: number; observacoes: string }[];
    for (const v of abertos) {
      const envio = /Envio (\d+)/.exec(v.observacoes)?.[1];
      if (!envio) continue;
      try {
        if (await atualizarEnvio(v.id, envio, i.access_token)) atualizados++;
      } catch {
        // envio indisponível (ex.: Full/sem permissão): mantém o status manual
      }
    }

    await sql`UPDATE integracoes SET ultima_sync = now(), ultimo_erro = NULL WHERE provedor = ${CANAL}`;
    return { novos, atualizados };
  } catch (e) {
    await sql`UPDATE integracoes SET ultimo_erro = ${String((e as Error).message).slice(0, 500)} WHERE provedor = ${CANAL}`;
    throw e;
  }
}

export type NotificacaoMl = { topic?: string; resource?: string; user_id?: number | string; application_id?: number | string };

// Notificação (webhook) do ML: traz só o recurso alterado; os dados são buscados na API com o nosso token.
export async function processarNotificacao(n: NotificacaoMl) {
  const i = await integracaoMl();
  if (!i || String(n.user_id) !== i.conta_id) return;
  const pedido = /^\/orders\/(\d+)$/.exec(n.resource ?? "")?.[1];
  const envio = /^\/shipments\/(\d+)$/.exec(n.resource ?? "")?.[1];
  if (!pedido && !envio) return;

  const t = await tokenAtual();
  const { access_token } = t;
  if (pedido) {
    await importarPedido(await get<PedidoMl>(`/orders/${pedido}`, access_token), t);
  } else if (envio) {
    const vendas = (await sql`SELECT id FROM vendas WHERE canal = ${CANAL}
      AND status_entrega IN ('a_enviar','enviado') AND observacoes ~ ${`Envio ${envio}\\M`}`) as { id: number }[];
    for (const v of vendas) await atualizarEnvio(v.id, envio, access_token);
  }
}

// Reprocessa, em lotes, as vendas do ML importadas antes do cadastro de produtos (sem itens): busca o pedido de novo
// e cria itens, custo e frete. Não mexe em status, rastreio nem valores já preenchidos.
export async function reprocessar({ depoisDe = 0, limite = 15 } = {}) {
  const i = await tokenAtual();
  const vendas = (await sql`SELECT id, pedido_externo FROM vendas v WHERE canal = ${CANAL} AND pedido_externo IS NOT NULL
    AND id > ${depoisDe} AND status_entrega <> 'cancelado' AND NOT EXISTS (SELECT 1 FROM venda_itens WHERE venda_id = v.id)
    ORDER BY id LIMIT ${limite}`) as { id: number; pedido_externo: string }[];
  let atualizadas = 0, ultimo = depoisDe;
  for (const v of vendas) {
    ultimo = v.id;
    try {
      if (await importarPedido(await get<PedidoMl>(`/orders/${v.pedido_externo}`, i.access_token), i)) atualizadas++;
    } catch {
      // pedido indisponível na API: a venda fica como está
    }
  }
  const [{ n }] = (await sql`SELECT COUNT(*) AS n FROM vendas v WHERE canal = ${CANAL} AND pedido_externo IS NOT NULL
    AND id > ${ultimo} AND status_entrega <> 'cancelado' AND NOT EXISTS (SELECT 1 FROM venda_itens WHERE venda_id = v.id)`) as { n: string }[];
  return { atualizadas, ultimo, restantes: Number(n) };
}

// Respostas brutas da API para um pedido (para conferir campos como reembolso de frete do Flex).
export async function diagnosticoPedido(pedido: string) {
  const i = await tokenAtual();
  const bruto = async (path: string) => {
    try {
      return await get<unknown>(path, i.access_token);
    } catch (e) {
      return { erro: (e as Error).message };
    }
  };
  const order = (await bruto(`/orders/${pedido}`)) as Partial<PedidoMl>;
  const envio = order.shipping?.id;
  return {
    pedido: order,
    envio: envio ? await bruto(`/shipments/${envio}`) : null,
    custos_do_envio: envio ? await bruto(`/shipments/${envio}/costs`) : null,
  };
}
