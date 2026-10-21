"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { brl } from "@/lib/constants";
import {
  PARAMETROS_INFO, custoPeca, faixaDoPreco, parametrosEfetivos, precoParaMargem, resultado, veredito,
  type CanalCalc, type Entrada, type ItemCusto, type Parametros, type Resultado,
} from "@/lib/calculadora";
import { parseNum } from "@/lib/form";
import { salvarSimulacao } from "@/app/(app)/calculadora/actions";
import { Icone } from "./Icone";

type Linha = { item_id: number; valor: string };

const num = (s: string) => {
  const v = parseNum(s);
  return v == null || Number.isNaN(v) ? 0 : v;
};
const inp = (v: number | null | undefined) => (v == null || v === 0 ? "" : String(v).replace(".", ","));
const din = (v: number | null | undefined) => (v == null || v === 0 ? "" : v.toFixed(2).replace(".", ","));
const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`);

const COR_VEREDITO = {
  seguir: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  atencao: "bg-amber-400/20 text-amber-800 dark:text-amber-300",
  prejuizo: "bg-red-500/12 text-red-700 dark:text-red-300",
} as const;

const PARTES = [
  ["material", "Filamento", "bg-blue-500"],
  ["energia", "Energia", "bg-amber-400"],
  ["maquina", "Máquina e manutenção", "bg-slate-500"],
  ["falhas", "Falhas", "bg-rose-400"],
  ["mao_obra", "Mão de obra", "bg-violet-500"],
  ["insumos", "Insumos", "bg-emerald-500"],
  ["fixos", "Custos fixos", "bg-cyan-500"],
  ["outros", "Outros", "bg-orange-400"],
] as const;

const MARGENS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

const AJUSTAVEIS: (keyof Parametros)[] = [
  "perda_pct", "falha_pct", "mao_obra_h", "imposto_pct", "ads_pct", "margem_alvo_pct",
  "potencia_w", "tarifa_kwh", "impressora_valor", "impressora_vida_h", "manutencao_h", "fixos_mes", "pecas_mes",
];

export function Calculadora({
  id,
  nomeInicial,
  observacoesIniciais,
  ideiaInicial,
  entrada,
  itens,
  parametros,
  canais,
  ideias,
}: {
  id: number | null;
  nomeInicial: string;
  observacoesIniciais: string;
  ideiaInicial: number | null;
  entrada: Entrada;
  itens: ItemCusto[];
  parametros: Parametros;
  canais: CanalCalc[];
  ideias: { id: number; titulo: string }[];
}) {
  const filamentosEstoque = itens.filter((i) => i.categoria === "filamento");
  const insumosEstoque = itens.filter((i) => i.categoria !== "filamento");
  const ativos = canais.filter((c) => c.ativo || c.id === entrada.canal_id);

  const [nome, setNome] = useState(nomeInicial);
  const [observacoes, setObservacoes] = useState(observacoesIniciais);
  const [ideiaId, setIdeiaId] = useState<number | null>(ideiaInicial);
  const [pecas, setPecas] = useState(String(entrada.pecas_por_impressao));
  const [tempoH, setTempoH] = useState(String(Math.floor(entrada.tempo_impressao_min / 60)));
  const [tempoM, setTempoM] = useState(String(Math.round(entrada.tempo_impressao_min % 60)));
  const [filamentos, setFilamentos] = useState<Linha[]>(() => {
    const l = entrada.filamentos.map((f) => ({ item_id: f.item_id, valor: inp(f.gramas) }));
    return l.length || !filamentosEstoque.length ? l : [{ item_id: filamentosEstoque[0].id, valor: "" }];
  });
  const [preparo, setPreparo] = useState(inp(entrada.preparo_min));
  const [acabamento, setAcabamento] = useState(inp(entrada.acabamento_min));
  const [insumos, setInsumos] = useState<Linha[]>(entrada.insumos.map((l) => ({ item_id: l.item_id, valor: inp(l.qtd) })));
  const [outros, setOutros] = useState(din(entrada.outros_custos));
  const [preco, setPreco] = useState(din(entrada.preco_venda));
  const [mercado, setMercado] = useState(din(entrada.preco_mercado));
  const [canalId, setCanalId] = useState<number | null>(entrada.canal_id ?? ativos[0]?.id ?? null);
  const [ajustes, setAjustes] = useState<Partial<Record<keyof Parametros, string>>>(() =>
    Object.fromEntries(Object.entries(entrada.ajustes).map(([k, v]) => [k, inp(v as number) || "0"])),
  );
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const atual: Entrada = useMemo(
    () => ({
      pecas_por_impressao: Math.max(1, Math.floor(num(pecas)) || 1),
      tempo_impressao_min: num(tempoH) * 60 + num(tempoM),
      filamentos: filamentos.map((l) => ({ item_id: l.item_id, gramas: num(l.valor) })),
      preparo_min: num(preparo),
      acabamento_min: num(acabamento),
      insumos: insumos.map((l) => ({ item_id: l.item_id, qtd: num(l.valor) })),
      outros_custos: num(outros),
      preco_venda: num(preco),
      preco_mercado: num(mercado) || null,
      canal_id: canalId,
      ajustes: Object.fromEntries(
        Object.entries(ajustes)
          .filter(([, v]) => v != null && v.trim() !== "")
          .map(([k, v]) => [k, num(v!)]),
      ),
    }),
    [pecas, tempoH, tempoM, filamentos, preparo, acabamento, insumos, outros, preco, mercado, canalId, ajustes],
  );

  const p = parametrosEfetivos(parametros, atual.ajustes);
  const c = custoPeca(atual, p, itens);
  const canal = ativos.find((x) => x.id === canalId) ?? null;
  const alvo = p.margem_alvo_pct / 100;
  const r = resultado(atual.preco_venda, c.total, canal, p);
  const v = veredito(r.margem, p.margem_alvo_pct);
  const sugerido = precoParaMargem(c.total, canal, p, alvo);
  const minimo = precoParaMargem(c.total, canal, p, 0);
  const rMercado = atual.preco_mercado ? resultado(atual.preco_mercado, c.total, canal, p) : null;
  const porId = new Map(itens.map((i) => [i.id, i]));
  const temPreco = atual.preco_venda > 0;
  const maxSlider = Math.max(10, Math.ceil(Math.max((sugerido ?? 0) * 2, atual.preco_venda * 1.5, c.total * 4)));

  function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Dê um nome para o produto");
    startSalvar(async () => {
      try {
        const salvo = await salvarSimulacao(id, { nome, entrada: atual, ideia_id: ideiaId, observacoes });
        setSalvoEm(new Date());
        if (id == null) router.replace(`/calculadora/${salvo.id}`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível salvar");
      }
    });
  }

  const mudarLinha = (set: typeof setFilamentos, i: number, parte: Partial<Linha>) =>
    set((ls) => ls.map((l, j) => (j === i ? { ...l, ...parte } : l)));

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
      {/* ENTRADAS */}
      <div className="space-y-4">
        <section className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field sm:col-span-2">
              <span>Produto</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder="Ex.: Placa NFC Instagram 10×10" className="text-base" />
            </label>
            <label className="field">
              <span>Ideia de produto vinculada</span>
              <select value={ideiaId ?? ""} onChange={(e) => setIdeiaId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Nenhuma</option>
                {ideias.map((i) => <option key={i.id} value={i.id}>{i.titulo}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="card-title">Impressão</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span>Peças por impressão (na mesa)</span>
              <input value={pecas} onChange={(e) => setPecas(e.target.value)} inputMode="numeric" />
            </label>
            <div className="field sm:col-span-2">
              <span>Tempo de impressão {atual.pecas_por_impressao > 1 ? "da mesa inteira" : ""} (do fatiador)</span>
              <div className="flex items-center gap-2">
                <input value={tempoH} onChange={(e) => setTempoH(e.target.value)} inputMode="numeric" className="w-20" aria-label="Horas" />
                <span className="text-sm text-muted">h</span>
                <input value={tempoM} onChange={(e) => setTempoM(e.target.value)} inputMode="numeric" className="w-20" aria-label="Minutos" />
                <span className="text-sm text-muted">min</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                Filamento {atual.pecas_por_impressao > 1 && <span className="text-muted">(peso da mesa inteira)</span>}
              </h3>
              {filamentosEstoque.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost py-1 text-xs"
                  onClick={() => setFilamentos((ls) => [...ls, { item_id: filamentosEstoque[0].id, valor: "" }])}
                >
                  <Icone nome="mais" className="size-3.5" /> Cor / material
                </button>
              )}
            </div>
            {filamentosEstoque.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted">
                Nenhum filamento no estoque.{" "}
                <Link href="/estoque" className="text-accent hover:underline">Cadastre seus rolos</Link> com o preço por kg para calcular o material.
              </p>
            )}
            {filamentos.map((l, i) => {
              const it = porId.get(l.item_id);
              const g = num(l.valor);
              const custoLinha = it ? (g / 1000) * it.custo_unitario * (1 + p.perda_pct / 100) : 0;
              const porPeca = g / atual.pecas_por_impressao;
              const daPara = it && porPeca > 0 ? Math.floor((it.quantidade * 1000) / (porPeca * (1 + p.perda_pct / 100))) : null;
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
                  <label className="field">
                    <span className={i ? "sr-only" : ""}>Rolo do estoque</span>
                    <select value={l.item_id} onChange={(e) => mudarLinha(setFilamentos, i, { item_id: Number(e.target.value) })}>
                      {!it && <option value={l.item_id}>(removido do estoque)</option>}
                      {filamentosEstoque.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome} — {brl(f.custo_unitario)}/kg
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className={i ? "sr-only" : ""}>Peso (g)</span>
                    <input value={l.valor} onChange={(e) => mudarLinha(setFilamentos, i, { valor: e.target.value })} inputMode="decimal" placeholder="g" />
                  </label>
                  <div className="hidden pb-2 text-right text-sm tabular-nums sm:block">
                    {brl(custoLinha)}
                    {daPara != null && (
                      <p className={`text-[11px] ${daPara < 1 ? "text-neg" : "text-muted"}`} title="Peças que o estoque atual deste rolo ainda rende">
                        estoque: {daPara} pç
                      </p>
                    )}
                  </div>
                  <button type="button" className="btn-icon mb-1" onClick={() => setFilamentos((ls) => ls.filter((_, j) => j !== i))} aria-label="Remover filamento">
                    <Icone nome="lixo" />
                  </button>
                </div>
              );
            })}
            <p className="text-xs text-muted">
              {kg(c.gramas_peca)} por peça · +{p.perda_pct}% de perda (purga, suporte, brim)
            </p>
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="card-title">Mão de obra</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span>Preparo por impressão (min) — fatiar, montar e limpar a mesa</span>
              <input value={preparo} onChange={(e) => setPreparo(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Acabamento por peça (min) — rebarbas, NFC, montagem, embalar</span>
              <input value={acabamento} onChange={(e) => setAcabamento(e.target.value)} inputMode="decimal" />
            </label>
          </div>
          <p className="text-xs text-muted">Sua hora vale {brl(p.mao_obra_h)} (ajuste nos parâmetros).</p>
        </section>

        <section className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Insumos por peça</h2>
            {insumosEstoque.length > 0 && (
              <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setInsumos((ls) => [...ls, { item_id: insumosEstoque[0].id, valor: "1" }])}>
                <Icone nome="mais" className="size-3.5" /> Insumo
              </button>
            )}
          </div>
          {insumosEstoque.length === 0 && (
            <p className="text-sm text-muted">
              Chip NFC, embalagem, etiqueta, ímã… <Link href="/estoque" className="text-accent hover:underline">Cadastre no estoque</Link> para usar aqui.
            </p>
          )}
          {insumos.map((l, i) => {
            const it = porId.get(l.item_id);
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6.5rem_auto]">
                <label className="field">
                  <span className={i ? "sr-only" : ""}>Item do estoque</span>
                  <select value={l.item_id} onChange={(e) => mudarLinha(setInsumos, i, { item_id: Number(e.target.value) })}>
                    {!it && <option value={l.item_id}>(removido do estoque)</option>}
                    {insumosEstoque.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome} — {brl(x.custo_unitario)}/{x.unidade}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className={i ? "sr-only" : ""}>Qtd ({it?.unidade ?? "un"})</span>
                  <input value={l.valor} onChange={(e) => mudarLinha(setInsumos, i, { valor: e.target.value })} inputMode="decimal" />
                </label>
                <p className="hidden pb-2 text-right text-sm tabular-nums sm:block">{brl(it ? num(l.valor) * it.custo_unitario : 0)}</p>
                <button type="button" className="btn-icon mb-1" onClick={() => setInsumos((ls) => ls.filter((_, j) => j !== i))} aria-label="Remover insumo">
                  <Icone nome="lixo" />
                </button>
              </div>
            );
          })}
          <label className="field max-w-xs pt-1">
            <span>Outros custos por peça (R$)</span>
            <input value={outros} onChange={(e) => setOutros(e.target.value)} inputMode="decimal" placeholder="Ex.: brinde, cola, parafuso" />
          </label>
        </section>

        <section className="card">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <h2 className="card-title">Parâmetros desta simulação</h2>
              <span className="text-xs text-muted group-open:hidden">
                {Object.keys(atual.ajustes).length ? `${Object.keys(atual.ajustes).length} ajustado(s)` : "usando os padrões"} · abrir
              </span>
            </summary>
            <p className="mt-2 text-xs text-muted">
              Em branco = padrão da oficina (
              <Link href="/calculadora/parametros" className="text-accent hover:underline">editar padrões</Link>). Preencha só o que for diferente para este produto.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AJUSTAVEIS.map((k) => (
                <label key={k} className="field" title={PARAMETROS_INFO[k].dica}>
                  <span>
                    {PARAMETROS_INFO[k].nome} ({PARAMETROS_INFO[k].unidade})
                  </span>
                  <input
                    value={ajustes[k] ?? ""}
                    onChange={(e) => setAjustes((a) => ({ ...a, [k]: e.target.value }))}
                    inputMode="decimal"
                    placeholder={inp(parametros[k]) || "0"}
                    className={ajustes[k]?.trim() ? "border-accent" : ""}
                  />
                </label>
              ))}
            </div>
          </details>
        </section>

        <section className="card">
          <label className="field">
            <span>Anotações</span>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} maxLength={5000} placeholder="Concorrentes, variações, ideias de kit…" />
          </label>
        </section>
      </div>

      {/* RESULTADOS */}
      <div className="space-y-4 xl:sticky xl:top-6">
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="card-title">Custo por peça</h2>
            <span className="text-2xl font-semibold tabular-nums">{brl(c.total)}</span>
          </div>
          {c.total > 0 && (
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              {PARTES.map(([k, , cor]) => (c[k] > 0 ? <div key={k} className={cor} style={{ width: `${(c[k] / c.total) * 100}%` }} /> : null))}
            </div>
          )}
          <dl className="space-y-1 text-sm">
            {PARTES.map(([k, rotulo, cor]) =>
              c[k] > 0.0001 ? (
                <div key={k} className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${cor}`} />
                  <dt className="flex-1 text-muted">{rotulo}</dt>
                  <dd className="tabular-nums">{brl(c[k])}</dd>
                  <dd className="w-12 text-right text-xs tabular-nums text-muted">{c.total ? pct(c[k] / c.total) : ""}</dd>
                </div>
              ) : null,
            )}
          </dl>
          <p className="text-xs text-muted">
            {kg(c.gramas_peca)} · {(c.horas_peca * 60).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} min de impressora por peça
          </p>
          {c.avisos.map((a) => <p key={a} className="text-xs text-neg">{a}</p>)}
        </section>

        <section className="card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Preço de venda (R$)</span>
              <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" className="text-base font-medium" placeholder="0,00" />
            </label>
            <label className="field">
              <span>Canal</span>
              <select value={canalId ?? ""} onChange={(e) => setCanalId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Sem taxas</option>
                {ativos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
          </div>
          <input
            type="range"
            min={0}
            max={maxSlider}
            step={0.5}
            value={Math.min(atual.preco_venda, maxSlider)}
            onChange={(e) => setPreco(e.target.value.replace(".", ","))}
            className="w-full border-0 p-0 accent-[var(--accent)] focus:ring-0"
            aria-label="Simular preço"
          />
          <div className="flex flex-wrap gap-1.5 text-xs">
            {minimo != null && (
              <button type="button" className="badge cursor-pointer border border-border text-muted hover:text-fg" onClick={() => setPreco(din(minimo))}>
                Empate: {brl(minimo)}
              </button>
            )}
            {sugerido != null ? (
              <button type="button" className="badge cursor-pointer border border-accent bg-accent-soft text-accent" onClick={() => setPreco(din(sugerido))}>
                Meta {p.margem_alvo_pct}%: {brl(sugerido)}
              </button>
            ) : (
              <span className="badge bg-red-500/12 text-red-700 dark:text-red-300">Meta de {p.margem_alvo_pct}% impossível neste canal</span>
            )}
          </div>

          {temPreco && (
            <>
              <Demonstrativo r={r} canal={canal} />
              <div className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                <div>
                  <p className="text-xs text-muted">Lucro por peça</p>
                  <p className={`text-xl font-semibold tabular-nums ${r.lucro >= 0 ? "text-pos" : "text-neg"}`}>{brl(r.lucro)}</p>
                  <p className="text-xs text-muted">
                    margem {pct(r.margem)} · markup {r.markup ? `${r.markup.toFixed(2).replace(".", ",")}×` : "—"}
                  </p>
                </div>
                <span className={`badge text-sm ${COR_VEREDITO[v.nivel]}`}>{v.texto}</span>
              </div>
              {c.horas_peca > 0 && (
                <p className="text-xs text-muted">
                  Rende <strong className="text-fg">{brl(r.lucro / c.horas_peca)}</strong> de lucro por hora de impressora
                  {c.gramas_peca > 0 && <> e {brl((r.lucro / c.gramas_peca) * 1000)} por kg de filamento</>}.
                </p>
              )}
            </>
          )}

          <label className="field border-t border-border pt-3">
            <span>Preço da concorrência (R$) — opcional</span>
            <input value={mercado} onChange={(e) => setMercado(e.target.value)} inputMode="decimal" placeholder="Quanto vendem por aí" />
          </label>
          {rMercado && (
            <p className="text-sm">
              Vendendo a {brl(rMercado.preco)}: lucro{" "}
              <strong className={rMercado.lucro >= 0 ? "text-pos" : "text-neg"}>{brl(rMercado.lucro)}</strong> ({pct(rMercado.margem)}).{" "}
              {sugerido != null &&
                (sugerido <= rMercado.preco ? (
                  <span className="text-pos">Dá para bater a meta abaixo do preço de mercado.</span>
                ) : (
                  <span className="text-neg">A meta exige {pct(sugerido / rMercado.preco - 1)} acima do mercado.</span>
                ))}
            </p>
          )}
        </section>

        <section className="card space-y-2">
          <button className="btn w-full" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : id ? "Salvar alterações" : "Salvar simulação"}
          </button>
          {erro && <p className="text-sm text-neg">{erro}</p>}
          {salvoEm && !erro && <p className="text-center text-xs text-muted">Salvo às {salvoEm.toLocaleTimeString("pt-BR")}</p>}
        </section>
      </div>

      {/* COMPARATIVO */}
      <section className="card space-y-3 xl:col-span-2">
        <div>
          <h2 className="card-title">Simulação de margens por canal</h2>
          <p className="text-sm text-muted">Preço necessário para cada margem líquida. Clique num preço para simular.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Margem</th>
                {ativos.map((x) => <th key={x.id} className="text-right">{x.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {MARGENS.map((m) => (
                <tr key={m} className={Math.abs(m - alvo) < 1e-9 ? "[&>td]:bg-accent-soft" : ""}>
                  <td className="whitespace-nowrap font-medium">{m === 0 ? "Empate (0%)" : pct(m)}</td>
                  {ativos.map((x) => {
                    const pr = precoParaMargem(c.total, x, p, m);
                    return (
                      <td key={x.id} className="text-right tabular-nums">
                        {pr == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <button
                            type="button"
                            className="cursor-pointer hover:text-accent hover:underline"
                            onClick={() => {
                              setPreco(din(pr));
                              setCanalId(x.id);
                            }}
                          >
                            {brl(pr)}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {temPreco && (
                <tr>
                  <td className="whitespace-nowrap font-medium">A {brl(atual.preco_venda)}</td>
                  {ativos.map((x) => {
                    const rx = resultado(atual.preco_venda, c.total, x, p);
                    return (
                      <td key={x.id} className="whitespace-nowrap text-right tabular-nums">
                        <span className={rx.lucro >= 0 ? "text-pos" : "text-neg"}>{brl(rx.lucro)}</span>
                        <span className="ml-1 text-xs text-muted">{pct(rx.margem)}</span>
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Tarifas por faixa de preço de cada canal em{" "}
          <Link href="/calculadora/parametros" className="text-accent hover:underline">Parâmetros e canais</Link>. Os valores sugeridos são de out/2026 — confira na central de cada
          marketplace.
        </p>
      </section>
    </div>
  );
}

function Demonstrativo({ r, canal }: { r: Resultado; canal: CanalCalc | null }) {
  const f = canal ? faixaDoPreco(canal.faixas, r.preco) : null;
  const linhas: [string, number][] = [
    [`Comissão${f ? ` (${f.pct}%)` : ""}`, r.comissao],
    ["Tarifa fixa", r.taxa_fixa],
    ["Frete pago por você", r.frete],
    ["Imposto", r.imposto],
    ["Anúncios", r.ads],
    ["Custo da peça", r.custo],
  ];
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted">Preço</dt>
        <dd className="tabular-nums">{brl(r.preco)}</dd>
      </div>
      {linhas
        .filter(([, v]) => v > 0.0001)
        .map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">− {k}</dt>
            <dd className="tabular-nums text-muted">{brl(v)}</dd>
          </div>
        ))}
    </dl>
  );
}
