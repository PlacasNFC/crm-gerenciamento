import { sql, ensureSchema } from "@/lib/db";
import { diagnosticoPedido, mlConfigurado } from "@/lib/ml";
import { desconectarMl, reprocessarMl, sincronizarMl } from "./actions";
import { Cabecalho } from "@/components/ui";

export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  config: "Faltam ML_CLIENT_ID e ML_CLIENT_SECRET nas variáveis de ambiente da Vercel.",
  state: "A autorização expirou ou não confere. Tente conectar de novo.",
  token: "O Mercado Livre recusou a autorização. Confira o Redirect URI cadastrado no app.",
  sync: "Falha ao importar os pedidos (detalhe abaixo).",
  reproc: "Falha ao reprocessar os pedidos. Confira a conexão com o Mercado Livre.",
};

const BASE = "https://placas-nfc-crm.vercel.app";

export default async function Integracoes({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string; conectado?: string; novos?: string; atualizados?: string;
    reproc?: string; restantes?: string; cursor?: string; diag?: string;
  }>;
}) {
  await ensureSchema();
  const sp = await searchParams;
  const [ml] = (await sql`SELECT conta_nome, ultima_sync, ultimo_erro FROM integracoes WHERE provedor = 'mercado_livre'`) as {
    conta_nome: string | null; ultima_sync: Date | null; ultimo_erro: string | null;
  }[];
  const [{ n: semItens }] = (await sql`SELECT COUNT(*) AS n FROM vendas v WHERE canal = 'mercado_livre' AND pedido_externo IS NOT NULL
    AND status_entrega <> 'cancelado' AND NOT EXISTS (SELECT 1 FROM venda_itens WHERE venda_id = v.id)`) as { n: string }[];
  const restantes = sp.restantes !== undefined ? Number(sp.restantes) : null;
  const diag = ml && sp.diag && /^\d{5,20}$/.test(sp.diag.trim()) ? sp.diag.trim() : null;
  let diagnostico: string | null = null;
  if (diag) {
    try {
      diagnostico = JSON.stringify(await diagnosticoPedido(diag), null, 2);
    } catch (e) {
      diagnostico = `Erro: ${(e as Error).message}`;
    }
  }
  const fmt = (d: Date) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <Cabecalho titulo="Integrações" sub="Conexões com as lojas. Shopee e TikTok Shop dependem de aprovação das plataformas." />
      {sp.erro && <p className="card text-sm text-neg">{ERROS[sp.erro] ?? "Erro na integração."}</p>}
      {sp.conectado && <p className="card text-sm text-pos">Mercado Livre conectado.</p>}
      {sp.novos !== undefined && (
        <p className="card text-sm text-pos">Importação concluída: {sp.novos} vendas novas, {sp.atualizados ?? 0} atualizadas.</p>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="card-title">Mercado Livre</h2>
          <span className={`badge ${ml ? "bg-green-500/15 text-pos" : "bg-surface-2 text-muted"}`}>
            {ml ? `conectado${ml.conta_nome ? ` · ${ml.conta_nome}` : ""}` : "não conectado"}
          </span>
        </div>
        <p className="text-sm text-muted">
          Importa pedidos pagos como vendas (com a tarifa do ML), cancela as vendas de pedidos cancelados e atualiza a entrega pelo status do
          envio. Roda sozinho uma vez por dia e em tempo real pelas notificações do ML; use o botão para importar agora.
        </p>
        {ml?.ultima_sync && <p className="text-sm">Última importação: {fmt(ml.ultima_sync)}</p>}
        {ml?.ultimo_erro && <p className="text-sm text-neg">Último erro: {ml.ultimo_erro}</p>}

        {!mlConfigurado() ? (
          <div className="text-sm rounded-lg border border-border p-3 space-y-1">
            <p className="font-medium">Para ativar:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>No app em developers.mercadolivre.com.br, ative os escopos de leitura, pedidos e offline_access.</li>
              <li>Redirect URI: <code className="break-all">{BASE}/api/integracoes/ml/callback</code></li>
              <li>Notificações (opcional, tópicos Orders e Shipments): <code className="break-all">{BASE}/api/integracoes/ml/notificacoes</code></li>
              <li>Cadastre <code>ML_CLIENT_ID</code>, <code>ML_CLIENT_SECRET</code> e <code>CRON_SECRET</code> nas variáveis da Vercel e faça um novo deploy.</li>
            </ol>
          </div>
        ) : ml ? (
          <div className="flex flex-wrap items-end gap-3">
            <form action={sincronizarMl} className="flex flex-wrap items-end gap-2">
              <label className="field">
                <span>Na primeira vez, buscar últimos (dias)</span>
                <input type="number" name="dias" min={1} max={90} defaultValue={30} className="w-28" />
              </label>
              <button className="btn">Importar pedidos agora</button>
            </form>
            <form action={desconectarMl}>
              <button className="btn-ghost">Desconectar</button>
            </form>
          </div>
        ) : (
          <a href="/api/integracoes/ml/conectar" className="btn">Conectar conta do Mercado Livre</a>
        )}
      </section>

      {ml && (
        <section className="card space-y-3">
          <h2 className="font-medium">Produtos e custos nas vendas do ML</h2>
          <p className="text-sm text-muted">
            Vendas novas já chegam com itens, custo do produto (pelos vínculos de anúncio) e frete pago por você (Flex usa o custo
            configurado em Produtos → Taxas por canal). O reprocessamento busca de novo os pedidos importados antes disso e preenche
            itens, custo e frete onde estavam zerados, sem mexer em status nem rastreio. Cadastre produtos e vincule os anúncios antes.
          </p>
          {sp.reproc !== undefined && (
            <p className="text-sm text-pos">
              Lote concluído: {sp.reproc} vendas atualizadas{restantes ? `, faltam ${restantes}` : ", nada pendente"}.
            </p>
          )}
          {Number(semItens) > 0 || restantes ? (
            <form action={reprocessarMl} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="depois_de" value={restantes ? (sp.cursor ?? 0) : 0} />
              <button className="btn">{restantes ? "Continuar reprocessamento" : "Reprocessar pedidos do ML"}</button>
              <span className="text-sm text-muted">{semItens} vendas do ML sem itens · 15 por lote</span>
            </form>
          ) : (
            <p className="text-sm">Todas as vendas do ML já têm itens.</p>
          )}

          <form action="/integracoes" className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
            <label className="field">
              <span>Diagnóstico: respostas da API para um pedido</span>
              <input name="diag" placeholder="Nº do pedido" defaultValue={diag ?? ""} />
            </label>
            <button className="btn-ghost">Ver</button>
          </form>
          {diagnostico && (
            <pre className="text-xs overflow-auto max-h-[32rem] rounded-lg border border-border p-3 whitespace-pre-wrap break-all">{diagnostico}</pre>
          )}
        </section>
      )}
    </>
  );
}
