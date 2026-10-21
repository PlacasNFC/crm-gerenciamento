import { ensureSchema } from "@/lib/db";
import { brl } from "@/lib/constants";
import { PARAMETROS_INFO, PARAMETROS_PADRAO, type Parametros } from "@/lib/calculadora";
import { carregarCanais, carregarParametros } from "@/lib/estoque";
import { Cabecalho } from "@/components/ui";
import { CalcNav } from "@/components/CalcNav";
import { CanalForm } from "@/components/CanalForm";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { excluirCanal, salvarCanal, salvarParametros } from "../actions";

export const dynamic = "force-dynamic";

const GRUPOS: { titulo: string; campos: (keyof Parametros)[] }[] = [
  { titulo: "Impressora e energia", campos: ["potencia_w", "tarifa_kwh", "impressora_valor", "impressora_vida_h", "manutencao_h"] },
  { titulo: "Produção", campos: ["mao_obra_h", "perda_pct", "falha_pct"] },
  { titulo: "Venda e impostos", campos: ["imposto_pct", "ads_pct", "margem_alvo_pct", "fixos_mes", "pecas_mes"] },
];

export default async function Parametros() {
  await ensureSchema();
  const [p, canais] = await Promise.all([carregarParametros(), carregarCanais()]);
  const horaMaquina = (p.impressora_vida_h > 0 ? p.impressora_valor / p.impressora_vida_h : 0) + p.manutencao_h + (p.potencia_w / 1000) * p.tarifa_kwh;

  return (
    <>
      <Cabecalho titulo="Parâmetros e canais" sub="Valores padrão usados em todas as simulações. Cada simulação pode ajustar os seus." />
      <CalcNav />

      <section className="card">
        <form action={salvarParametros} className="space-y-5">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <h2 className="card-title mb-3">{g.titulo}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {g.campos.map((k) => (
                  <label key={k} className="field">
                    <span>
                      {PARAMETROS_INFO[k].nome} ({PARAMETROS_INFO[k].unidade})
                    </span>
                    <input name={k} inputMode="decimal" defaultValue={String(p[k]).replace(".", ",")} placeholder={String(PARAMETROS_PADRAO[k])} />
                    {PARAMETROS_INFO[k].dica && <small className="text-[11px] text-muted">{PARAMETROS_INFO[k].dica}</small>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button className="btn">Salvar parâmetros</button>
            <span className="text-sm text-muted">
              Hora de impressora hoje: <strong className="text-fg">{brl(horaMaquina)}</strong> (máquina + manutenção + energia)
              {p.pecas_mes > 0 && p.fixos_mes > 0 && <> · custo fixo por peça: {brl(p.fixos_mes / p.pecas_mes)}</>}
            </span>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Canais de venda</h2>
          <p className="text-sm text-muted">
            Tarifas por faixa de preço. Sugestões de out/2026 (ML: 14% clássico / 19% premium + tarifa abaixo de R$ 79, frete grátis por sua conta acima;
            Shopee CNPJ; TikTok Shop) — a comissão do ML varia por categoria e a tarifa abaixo de R$ 79 depende do peso, então confira na central de cada
            marketplace e ajuste aqui.
          </p>
        </div>
        {canais.map((c) => (
          <div key={c.id} className={`card space-y-3 ${c.ativo ? "" : "opacity-70"}`}>
            <CanalForm canal={c} action={salvarCanal.bind(null, c.id)} />
            <div className="border-t border-border pt-3">
              <ExcluirBotao action={excluirCanal.bind(null, c.id)} />
            </div>
          </div>
        ))}
        <details className="card group">
          <summary className="card-title cursor-pointer list-none">+ Novo canal</summary>
          <div className="mt-3">
            <CanalForm action={salvarCanal.bind(null, null)} />
          </div>
        </details>
      </section>
    </>
  );
}
