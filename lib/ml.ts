// Integração Mercado Livre: OAuth 2.0 + importação de pedidos.
// Access token dura 6h; o refresh token é de uso único (cada refresh devolve um novo).
import { sql } from "./db";
import { ErroValidacao } from "./form";
import { STATUS_INATIVOS, atualizarStatus, criarVenda } from "./vendas";
import { itensDoPedido, statusDoEnvio, statusDoPedido, type PedidoMl } from "./ml-map";

const API = "https://api.mercadolibre.com";
const AUTH = "https://auth.mercadolivre.com.br/authorization";
const PROVEDOR = "mercado_livre";

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
  if (!r.ok) throw new ErroValidacao(`Mercado Livre recusou o token: ${j.error ?? r.status} ${j.message ?? ""}`.trim());
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
    VALUES (${PROVEDOR}, ${String(t.user_id)}, ${me.nickname ?? null}, ${t.access_token}, ${t.refresh_token},
      now() + make_interval(secs => ${t.expires_in}), NULL, now())
    ON CONFLICT (provedor) DO UPDATE SET conta_id = EXCLUDED.conta_id, conta_nome = EXCLUDED.conta_nome,
      access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expira_em = EXCLUDED.expira_em,
      ultimo_erro = NULL, updated_at = now()`;
}

export async function desconectar() {
  await sql`DELETE FROM integracoes WHERE provedor = ${PROVEDOR}`;
}

type Integracao = { conta_id: string; access_token: string; refresh_token: string; expira_em: Date; ultima_sync: Date | null };

async function tokenAtual(): Promise<Integracao> {
  const [i] = (await sql`SELECT * FROM integracoes WHERE provedor = ${PROVEDOR}`) as Integracao[];
  if (!i) throw new ErroValidacao("Mercado Livre não conectado.");
  if (new Date(i.expira_em).getTime() - Date.now() > 5 * 60_000) return i;

  const t = await pedirToken({ grant_type: "refresh_token", refresh_token: i.refresh_token });
  // só grava se ninguém renovou antes (o refresh antigo deixa de valer)
  const upd = await sql`UPDATE integracoes SET access_token = ${t.access_token}, refresh_token = ${t.refresh_token},
      expira_em = now() + make_interval(secs => ${t.expires_in}), updated_at = now()
    WHERE provedor = ${PROVEDOR} AND refresh_token = ${i.refresh_token} RETURNING *`;
  if (upd.length) return upd[0] as Integracao;
  const [atual] = (await sql`SELECT * FROM integracoes WHERE provedor = ${PROVEDOR}`) as Integracao[];
  return atual;
}

async function get<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`GET ${path.split("?")[0]} → ${r.status}`);
  return r.json() as Promise<T>;
}

export async function sincronizar({ dias = 30 } = {}) {
  const i = await tokenAtual();
  try {
    const desde = i.ultima_sync
      ? new Date(new Date(i.ultima_sync).getTime() - 2 * 864e5) // margem para pedidos que mudaram de status
      : new Date(Date.now() - dias * 864e5);
    const produtos = (await sql`SELECT id, lower(sku) AS sku FROM produtos`) as { id: number; sku: string }[];
    const porSku = new Map(produtos.map((p) => [p.sku, p.id]));

    let novos = 0, atualizados = 0, offset = 0, total = Infinity;
    while (offset < total && offset < 2000) {
      const q = new URLSearchParams({ seller: i.conta_id, "order.date_created.from": desde.toISOString(), sort: "date_asc", offset: String(offset), limit: "50" });
      const pag = await get<{ results: PedidoMl[]; paging: { total: number } }>(`/orders/search?${q}`, i.access_token);
      total = pag.paging.total;
      offset += 50;
      for (const p of pag.results) {
        const st = statusDoPedido(p.status);
        if (!st) continue;
        const [existe] = (await sql`SELECT id, status_entrega FROM vendas WHERE canal = ${PROVEDOR} AND pedido_externo = ${String(p.id)}`) as { id: number; status_entrega: string }[];
        if (existe) {
          if (st === "cancelado" && !STATUS_INATIVOS.includes(existe.status_entrega)) {
            await atualizarStatus(existe.id, "cancelado", null);
            atualizados++;
          }
          continue;
        }
        if (st === "cancelado") continue; // nunca entrou no CRM
        const { itens, taxa } = itensDoPedido(p, porSku);
        await criarVenda({
          data: p.date_created.slice(0, 10),
          canal: PROVEDOR,
          pedido_externo: String(p.id),
          cliente_id: null,
          taxa_plataforma: taxa,
          frete: 0,
          custo_produto: 0,
          status_entrega: "a_enviar",
          codigo_rastreio: null,
          observacoes: [p.buyer?.nickname && `Comprador ML: ${p.buyer.nickname}`, p.pack_id && `Pacote ${p.pack_id}`, p.shipping?.id && `Envio ${p.shipping.id}`].filter(Boolean).join(" · ") || null,
        }, itens);
        novos++;
      }
    }

    // atualiza entrega dos pedidos em aberto pelo status do envio
    const abertos = (await sql`SELECT id, observacoes FROM vendas WHERE canal = ${PROVEDOR} AND status_entrega IN ('a_enviar','enviado')
      AND observacoes LIKE '%Envio %' ORDER BY id DESC LIMIT 100`) as { id: number; observacoes: string }[];
    for (const v of abertos) {
      const envio = /Envio (\d+)/.exec(v.observacoes)?.[1];
      if (!envio) continue;
      try {
        const s = await get<{ status?: string; tracking_number?: string | null }>(`/shipments/${envio}`, i.access_token);
        const novo = statusDoEnvio(s.status);
        if (novo) {
          await atualizarStatus(v.id, novo, s.tracking_number ?? null);
          atualizados++;
        }
      } catch {
        // envio indisponível (ex.: Full/sem permissão): mantém o status manual
      }
    }

    await sql`UPDATE integracoes SET ultima_sync = now(), ultimo_erro = NULL WHERE provedor = ${PROVEDOR}`;
    return { novos, atualizados };
  } catch (e) {
    await sql`UPDATE integracoes SET ultimo_erro = ${String((e as Error).message).slice(0, 500)} WHERE provedor = ${PROVEDOR}`;
    throw e;
  }
}
