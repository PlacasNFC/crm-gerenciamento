// Integração Mercado Livre: OAuth 2.0 + importação de pedidos (cron diário, botão manual e notificações).
// Access token dura 6h; o refresh token é de uso único (cada refresh devolve um novo).
import { sql } from "./db";
import {
  logisticaDoEnvio, regiaoDoEnvio, statusDoEnvio, statusDoPedido, valorEstornado, vendaDoPedido, type EnvioMl, type PedidoMl,
} from "./ml-map";

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

// Cria a venda de um pedido pago, cancela/devolve a já existente ou desconta reembolso parcial. Devolve o que mudou.
async function importarPedido(p: PedidoMl): Promise<"novo" | "atualizado" | null> {
  const st = statusDoPedido(p);
  if (!st) return null;
  const id = String(p.id);
  if (st !== "a_enviar") {
    const upd = await sql`UPDATE vendas SET status_entrega = ${st}
      WHERE canal = ${CANAL} AND pedido_externo = ${id} AND status_entrega NOT IN ('cancelado','devolvido') RETURNING id`;
    return upd.length ? "atualizado" : null;
  }
  const v = vendaDoPedido(p);
  // trava por pedido: cron, botão e notificação podem importar o mesmo pedido ao mesmo tempo
  const [, ins, reemb] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${`ml:${id}`}))`,
    sql`INSERT INTO vendas (data, canal, pedido_externo, cliente, produto, quantidade, valor_bruto, taxa_plataforma, observacoes)
      SELECT ${v.data}::date, ${CANAL}, ${id}, ${v.cliente}, ${v.produto}, ${v.quantidade}, ${v.valor_bruto}, ${v.taxa_plataforma}, ${v.observacoes}
      WHERE NOT EXISTS (SELECT 1 FROM vendas WHERE canal = ${CANAL} AND pedido_externo = ${id})
      RETURNING id`,
    // reembolso parcial depois da importação: baixa o valor da venda já existente
    ...(valorEstornado(p) > 0
      ? [sql`UPDATE vendas SET valor_bruto = ${v.valor_bruto}
          WHERE canal = ${CANAL} AND pedido_externo = ${id} AND valor_bruto > ${v.valor_bruto} RETURNING id`]
      : []),
  ]);
  if ((ins as unknown[]).length) return "novo";
  return (reemb as unknown[] | undefined)?.length ? "atualizado" : null;
}

// Roda `fn` em lotes paralelos de `n`, para a sincronização caber no tempo da função.
async function emLotes<T>(itens: T[], n: number, fn: (x: T) => Promise<void>) {
  for (let k = 0; k < itens.length; k += n) await Promise.all(itens.slice(k, k + n).map(fn));
}

// Grava a logística do envio e o estado e a cidade do destinatário (estes só se a venda ainda não tiver).
async function gravarEnvio(vendaId: number, s: EnvioMl) {
  const { uf, cidade } = regiaoDoEnvio(s);
  const logistica = logisticaDoEnvio(s);
  if (!uf && !logistica) return;
  await sql`UPDATE vendas SET logistica = COALESCE(${logistica}, logistica),
      cidade = CASE WHEN uf IS NULL AND ${uf}::text IS NOT NULL THEN ${cidade} ELSE cidade END, uf = COALESCE(uf, ${uf})
    WHERE id = ${vendaId}`;
}

// Atualiza a entrega pelo status do envio (e a região e a logística). Devolve true se o status mudou.
async function atualizarEnvio(vendaId: number, envioId: string, token: string) {
  const s = await get<EnvioMl>(`/shipments/${envioId}`, token);
  await gravarEnvio(vendaId, s);
  const novo = statusDoEnvio(s.status);
  if (!novo) return false;
  const upd = await sql`UPDATE vendas SET status_entrega = ${novo}, codigo_rastreio = COALESCE(${s.tracking_number ?? null}, codigo_rastreio)
    WHERE id = ${vendaId} AND status_entrega <> ${novo} RETURNING id`;
  return upd.length > 0;
}

// Preenche a região das vendas que ainda não têm (pedidos antigos ou já entregues), aos poucos.
async function preencherRegioes(token: string, limite = 60) {
  const vendas = (await sql`SELECT id, observacoes FROM vendas WHERE canal = ${CANAL} AND uf IS NULL
    AND observacoes LIKE '%Envio %' ORDER BY id DESC LIMIT ${limite}`) as { id: number; observacoes: string }[];
  await emLotes(vendas, 5, async (v) => {
    const envio = /Envio (\d+)/.exec(v.observacoes)?.[1];
    if (!envio) return;
    try {
      await gravarEnvio(v.id, await get<EnvioMl>(`/shipments/${envio}`, token));
    } catch {
      // envio sem acesso: fica sem região
    }
  });
}

// Cron: pedidos alterados desde a última importação (pega cancelamento/estorno de pedido antigo).
// Botão (com `dias`): também revisa todos os pedidos criados nesse período.
export async function sincronizar({ dias }: { dias?: number } = {}) {
  const i = await tokenAtual();
  try {
    const filtros: Record<string, string>[] = [];
    if (i.ultima_sync) {
      // margem para atrasos do ML
      filtros.push({ "order.last_updated.from": new Date(new Date(i.ultima_sync).getTime() - 2 * 864e5).toISOString() });
    }
    if (dias || !i.ultima_sync) {
      filtros.push({ "order.date_created.from": new Date(Date.now() - (dias ?? 30) * 864e5).toISOString() });
    }

    let novos = 0, atualizados = 0;
    for (const filtro of filtros) {
      let offset = 0, total = Infinity;
      while (offset < total && offset < 2000) {
        const q = new URLSearchParams({ seller: i.conta_id, ...filtro, sort: "date_asc", offset: String(offset), limit: "50" });
        const pag = await get<{ results: PedidoMl[]; paging: { total: number } }>(`/orders/search?${q}`, i.access_token);
        total = pag.paging.total;
        offset += 50;
        for (const p of pag.results) {
          const r = await importarPedido(p);
          if (r === "novo") novos++;
          else if (r === "atualizado") atualizados++;
        }
      }
    }

    // atualiza a entrega dos pedidos em aberto pelo status do envio
    const abertos = (await sql`SELECT id, observacoes FROM vendas WHERE canal = ${CANAL} AND observacoes LIKE '%Envio %'
      AND status_entrega IN ('a_enviar','enviado') ORDER BY id DESC LIMIT 500`) as { id: number; observacoes: string }[];
    await emLotes(abertos, 5, async (v) => {
      const envio = /Envio (\d+)/.exec(v.observacoes)?.[1];
      if (!envio) return;
      try {
        if (await atualizarEnvio(v.id, envio, i.access_token)) atualizados++;
      } catch (e) {
        // envio indisponível (ex.: Full/sem permissão): mantém o status manual
        console.error("envio ML", envio, (e as Error).message);
      }
    });

    await preencherRegioes(i.access_token);

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

  const { access_token } = await tokenAtual();
  if (pedido) {
    await importarPedido(await get<PedidoMl>(`/orders/${pedido}`, access_token));
  } else if (envio) {
    const vendas = (await sql`SELECT id FROM vendas WHERE canal = ${CANAL}
      AND status_entrega IN ('a_enviar','enviado') AND observacoes ~ ${`Envio ${envio}\\M`}`) as { id: number }[];
    for (const v of vendas) await atualizarEnvio(v.id, envio, access_token);
  }
}

// GET autenticado na API do ML com o token da loja (renova se precisar).
export async function mlGet<T>(path: string): Promise<T> {
  const { access_token } = await tokenAtual();
  return get<T>(path, access_token);
}

export async function contaMl() {
  const i = await integracaoMl();
  return i?.conta_id ?? null;
}
