import { linhas, sql, ensureSchema } from "@/lib/db";
import { mlConfigurado } from "@/lib/ml";
import { ActionForm } from "@/components/ActionForm";
import { Cabecalho, Campo, Tag } from "@/components/ui";
import { desconectarMl, sincronizarMl } from "./actions";

export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  config: "Faltam ML_CLIENT_ID e ML_CLIENT_SECRET nas variáveis de ambiente da Vercel.",
  state: "A autorização expirou ou não confere. Tente conectar de novo.",
  token: "O Mercado Livre recusou a autorização. Confira o Redirect URI cadastrado no app.",
};

export default async function Integracoes({ searchParams }: { searchParams: Promise<{ erro?: string; conectado?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const [ml] = await linhas<{ conta_id: string; conta_nome: string | null; ultima_sync: Date | null; ultimo_erro: string | null }>(
    sql`SELECT conta_id, conta_nome, ultima_sync, ultimo_erro FROM integracoes WHERE provedor = 'mercado_livre'`,
  );
  const configurado = mlConfigurado();
  const fmt = (d: Date) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <Cabecalho titulo="Integrações" sub="Importação automática de pedidos dos marketplaces." />
      {sp.erro && <p className="msg-erro mt-0">{ERROS[sp.erro] ?? "Erro na integração."}</p>}
      {sp.conectado && <p className="msg-ok mt-0">Mercado Livre conectado.</p>}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="secao mb-0">Mercado Livre</h2>
          {ml ? <Tag cor="verde">conectado{ml.conta_nome ? ` · ${ml.conta_nome}` : ""}</Tag> : <Tag cor="cinza">não conectado</Tag>}
        </div>
        <p className="text-sm text-muted">
          Importa pedidos pagos como vendas (com tarifa do ML), cancela os pedidos cancelados e atualiza a entrega pelo status do envio. Roda sozinho
          uma vez por dia; use o botão para importar agora. Produtos com o mesmo SKU do anúncio baixam estoque.
        </p>
        {ml?.ultima_sync && <p className="text-sm">Última importação: {fmt(ml.ultima_sync)}</p>}
        {ml?.ultimo_erro && <p className="msg-erro mt-0">Último erro: {ml.ultimo_erro}</p>}
        {!configurado ? (
          <div className="text-sm rounded-md border border-border p-3 space-y-1">
            <p className="font-medium">Para ativar:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Crie um app em developers.mercadolivre.com.br (Minhas aplicações → Criar aplicação), com escopos de leitura e pedidos.</li>
              <li>Redirect URI: <code className="break-all">https://placas-nfc-crm.vercel.app/api/integracoes/ml/callback</code></li>
              <li>Cadastre <code>ML_CLIENT_ID</code> e <code>ML_CLIENT_SECRET</code> nas variáveis da Vercel e faça um novo deploy.</li>
            </ol>
          </div>
        ) : ml ? (
          <div className="flex flex-wrap items-end gap-3">
            <ActionForm action={sincronizarMl} className="flex flex-wrap items-end gap-2">
              <Campo label="Na primeira vez, buscar últimos (dias)"><input type="number" name="dias" min={1} max={90} defaultValue={30} className="w-28" /></Campo>
              <button className="btn">Importar pedidos agora</button>
            </ActionForm>
            <ActionForm action={desconectarMl} confirmar="Desconectar o Mercado Livre? As vendas já importadas continuam.">
              <button className="btn-ghost">Desconectar</button>
            </ActionForm>
          </div>
        ) : (
          <a href="/api/integracoes/ml/conectar" className="btn">Conectar conta do Mercado Livre</a>
        )}
      </section>

      {[
        { nome: "Shopee", texto: "A Open Platform da Shopee exige cadastro de parceiro aprovado pela Shopee. Enquanto isso, lance as vendas manualmente em Pedidos de venda (canal Shopee)." },
        { nome: "TikTok Shop", texto: "A API do TikTok Shop exige app aprovado no Partner Center. Enquanto isso, lance as vendas manualmente (canal TikTok Shop)." },
      ].map((p) => (
        <section key={p.nome} className="card space-y-2">
          <div className="flex items-center gap-2"><h2 className="secao mb-0">{p.nome}</h2><Tag cor="amarela">aguardando aprovação da plataforma</Tag></div>
          <p className="text-sm text-muted">{p.texto}</p>
        </section>
      ))}
    </>
  );
}
