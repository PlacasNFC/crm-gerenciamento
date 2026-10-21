import { notFound } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { ENTRADA_VAZIA, normalizarEntrada, parametrosEfetivos } from "@/lib/calculadora";
import { carregarCanais, carregarItens, carregarParametros, paraItemCusto } from "@/lib/estoque";
import { Cabecalho } from "@/components/ui";
import { CalcNav } from "@/components/CalcNav";
import { Calculadora } from "@/components/Calculadora";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { Icone } from "@/components/Icone";
import { duplicarSimulacao, excluirSimulacao, registrarProducao } from "../actions";

export const dynamic = "force-dynamic";

type Sim = { id: number; nome: string; entrada: unknown; ideia_id: number | null; observacoes: string | null };

export default async function Simulacao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ideia?: string }> }) {
  await ensureSchema();
  const { id: rota } = await params;
  const nova = rota === "nova";
  const id = Number(rota);
  if (!nova && !Number.isInteger(id)) notFound();

  const [simR, itens, base, canais, ideiasR] = await Promise.all([
    nova ? Promise.resolve([]) : sql`SELECT id, nome, entrada, ideia_id, observacoes FROM calc_simulacoes WHERE id = ${id}`,
    carregarItens(),
    carregarParametros(),
    carregarCanais(),
    sql`SELECT id, titulo FROM ideias WHERE status <> 'descartada' ORDER BY created_at DESC`,
  ]);
  const sim = (simR as Sim[])[0] ?? null;
  if (!nova && !sim) notFound();
  const ideias = ideiasR as { id: number; titulo: string }[];
  const ideiaParam = Number((await searchParams).ideia);
  const ideiaNova = nova ? (ideias.find((i) => i.id === ideiaParam) ?? null) : null;
  const entrada = sim ? normalizarEntrada(sim.entrada) : ENTRADA_VAZIA;
  const p = parametrosEfetivos(base, entrada.ajustes);

  return (
    <>
      <Cabecalho titulo={sim ? sim.nome : "Nova simulação"} sub="Informe peso e tempo do fatiador, escolha o filamento do estoque e veja custo, margens e preço por canal.">
        {sim && (
          <form action={duplicarSimulacao.bind(null, sim.id)}>
            <button className="btn-ghost">
              <Icone nome="copiar" /> Duplicar
            </button>
          </form>
        )}
      </Cabecalho>
      <CalcNav />

      <Calculadora
        key={sim?.id ?? "nova"}
        id={sim?.id ?? null}
        nomeInicial={sim?.nome ?? ideiaNova?.titulo ?? ""}
        observacoesIniciais={sim?.observacoes ?? ""}
        ideiaInicial={sim?.ideia_id ?? ideiaNova?.id ?? null}
        entrada={entrada}
        itens={itens.map(paraItemCusto)}
        parametros={base}
        canais={canais}
        ideias={ideias}
      />

      {sim && (
        <section className="card flex flex-wrap items-end justify-between gap-4">
          <form action={registrarProducao.bind(null, sim.id)} className="flex flex-wrap items-end gap-2">
            <label className="field w-32">
              <span>Peças produzidas</span>
              <input name="pecas" inputMode="numeric" required placeholder="Ex.: 10" />
            </label>
            <button className="btn-ghost">
              <Icone nome="estoque" /> Dar baixa no estoque
            </button>
            <p className="w-full text-xs text-muted">
              Desconta do estoque o filamento (com {p.perda_pct}% de perda) e os insumos desta simulação salva.
            </p>
          </form>
          <ExcluirBotao action={excluirSimulacao.bind(null, sim.id)} />
        </section>
      )}
    </>
  );
}
