import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { brl } from "@/lib/constants";
import { custoPeca, normalizarEntrada, parametrosEfetivos, precoParaMargem, resultado, veredito } from "@/lib/calculadora";
import { carregarCanais, carregarItens, carregarParametros, paraItemCusto } from "@/lib/estoque";
import { Cabecalho, Vazio } from "@/components/ui";
import { CalcNav } from "@/components/CalcNav";
import { Icone } from "@/components/Icone";

export const dynamic = "force-dynamic";

type Sim = { id: number; nome: string; entrada: unknown; custo: string | null; ideia: string | null; updated_at: Date };

const COR = {
  seguir: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  atencao: "bg-amber-400/20 text-amber-800 dark:text-amber-300",
  prejuizo: "bg-red-500/12 text-red-700 dark:text-red-300",
} as const;

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default async function Simulacoes({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  await ensureSchema();
  const { o } = await searchParams;
  const ordem = o === "hora" || o === "recentes" ? o : "margem";
  const [simsR, itensR, base, canais] = await Promise.all([
    sql`SELECT s.id, s.nome, s.entrada, s.custo, s.updated_at, i.titulo AS ideia
      FROM calc_simulacoes s LEFT JOIN ideias i ON i.id = s.ideia_id ORDER BY s.updated_at DESC`,
    carregarItens(),
    carregarParametros(),
    carregarCanais(),
  ]);
  const itens = itensR.map(paraItemCusto);

  // Recalcula com os preços atuais do estoque e dos parâmetros.
  const linhas = (simsR as Sim[]).map((s) => {
    const e = normalizarEntrada(s.entrada);
    const p = parametrosEfetivos(base, e.ajustes);
    const c = custoPeca(e, p, itens);
    const canal = canais.find((x) => x.id === e.canal_id) ?? null;
    const r = resultado(e.preco_venda, c.total, canal, p);
    const antigo = s.custo != null ? Number(s.custo) : null;
    return {
      ...s,
      e, c, r, canal, p,
      sugerido: precoParaMargem(c.total, canal, p, p.margem_alvo_pct / 100),
      v: veredito(r.margem, p.margem_alvo_pct),
      variacao: antigo && Math.abs(c.total - antigo) >= 0.01 ? c.total / antigo - 1 : null,
      porHora: c.horas_peca > 0 && e.preco_venda > 0 ? r.lucro / c.horas_peca : null,
    };
  });
  if (ordem === "margem") linhas.sort((a, b) => (b.e.preco_venda > 0 ? b.r.margem : -9) - (a.e.preco_venda > 0 ? a.r.margem : -9));
  if (ordem === "hora") linhas.sort((a, b) => (b.porHora ?? -1e9) - (a.porHora ?? -1e9));

  return (
    <>
      <Cabecalho titulo="Calculadora de custo" sub="Custo real de cada peça impressa, margens por canal e se vale a pena seguir com o produto.">
        <Link href="/calculadora/nova" className="btn">
          <Icone nome="mais" /> Nova simulação
        </Link>
      </Cabecalho>
      <CalcNav />

      {linhas.length === 0 ? (
        <Vazio>
          Nenhum produto simulado ainda. <Link href="/calculadora/nova" className="text-accent hover:underline">Faça a primeira simulação</Link>
          {itens.length === 0 && (
            <>
              {" "}— antes, cadastre seus filamentos no <Link href="/estoque" className="text-accent hover:underline">estoque</Link>.
            </>
          )}
        </Vazio>
      ) : (
        <>
          <nav className="tabs">
            {[["margem", "Maior margem"], ["hora", "Lucro por hora de impressora"], ["recentes", "Recentes"]].map(([k, v]) => (
              <Link key={k} href={`/calculadora?o=${k}`} data-ativo={ordem === k}>{v}</Link>
            ))}
          </nav>
          <section className="card overflow-x-auto p-0 sm:p-0">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="text-right">Custo</th>
                  <th className="text-right">Preço</th>
                  <th>Canal</th>
                  <th className="text-right">Lucro</th>
                  <th className="text-right">Margem</th>
                  <th className="text-right">Lucro/h impressora</th>
                  <th className="text-right">Preço p/ meta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/calculadora/${l.id}`} className="font-medium hover:text-accent">{l.nome}</Link>
                      {l.ideia && <p className="text-xs text-muted">Ideia: {l.ideia}</p>}
                      {l.c.avisos.length > 0 && <p className="text-xs text-neg">{l.c.avisos[0]}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {brl(l.c.total)}
                      {l.variacao != null && (
                        <p className={`text-xs ${l.variacao > 0 ? "text-neg" : "text-pos"}`} title="Variação desde que a simulação foi salva (preços do estoque/parâmetros mudaram)">
                          {l.variacao > 0 ? "▲" : "▼"} {pct(Math.abs(l.variacao))}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{l.e.preco_venda > 0 ? brl(l.e.preco_venda) : "—"}</td>
                    <td className="whitespace-nowrap text-muted">{l.canal?.nome ?? "Sem taxas"}</td>
                    <td className={`whitespace-nowrap text-right tabular-nums ${l.r.lucro >= 0 ? "text-pos" : "text-neg"}`}>
                      {l.e.preco_venda > 0 ? brl(l.r.lucro) : "—"}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {l.e.preco_venda > 0 ? <span className={`badge ${COR[l.v.nivel]}`}>{pct(l.r.margem)}</span> : "—"}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{l.porHora != null ? brl(l.porHora) : "—"}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-muted">
                      {l.sugerido != null ? brl(l.sugerido) : "—"}
                      <span className="text-xs"> ({l.p.margem_alvo_pct}%)</span>
                    </td>
                    <td className="text-right">
                      <Link href={`/calculadora/${l.id}`} className="btn-ghost py-1 text-xs">Abrir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-muted">Custos recalculados com os preços atuais do estoque e dos parâmetros. ▲/▼ = variação desde que a simulação foi salva.</p>
        </>
      )}
    </>
  );
}
