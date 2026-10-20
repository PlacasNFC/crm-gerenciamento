"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LOGISTICAS, TIPOS } from "@/lib/simulador-tipos";
import type { Anuncio, Resultado } from "@/lib/simulador";
import { buscarCategoriasAction, categoriaAction, simularAction, type Categoria } from "@/app/(app)/simulador/actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

type Campos = {
  preco: string;
  categoria: string;
  logistica: string;
  altura: string;
  largura: string;
  comprimento: string;
  peso: string;
  custoProduto: string;
  embalagem: string;
  impostoPct: string;
  margemAlvo: string;
};

const LOCAL = "simulador-ml";

export function Simulador({ anuncios, erroAnuncios }: { anuncios: Anuncio[]; erroAnuncios: string | null }) {
  const padrao: Campos = {
    preco: "",
    categoria: anuncios[0]?.categoria ?? "",
    logistica: "drop_off",
    altura: "",
    largura: "",
    comprimento: "",
    peso: "",
    custoProduto: "",
    embalagem: "",
    impostoPct: "",
    margemAlvo: "",
  };
  const [c, setC] = useState<Campos>(padrao);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<Categoria[]>([]);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [anuncioId, setAnuncioId] = useState("");
  const [pendente, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // custos da loja ficam salvos neste navegador
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LOCAL) ?? "{}");
      setC((v) => ({ ...v, embalagem: s.embalagem ?? "", impostoPct: s.impostoPct ?? "", margemAlvo: s.margemAlvo ?? "" }));
    } catch {
      // sem armazenamento local
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL, JSON.stringify({ embalagem: c.embalagem, impostoPct: c.impostoPct, margemAlvo: c.margemAlvo }));
    } catch {
      // sem armazenamento local
    }
  }, [c.embalagem, c.impostoPct, c.margemAlvo]);

  useEffect(() => {
    if (!c.categoria) return setCategoria(null);
    if (categoria?.id === c.categoria) return;
    categoriaAction(c.categoria).then(setCategoria);
  }, [c.categoria, categoria?.id]);

  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.value });

  function usarAnuncio(id: string) {
    setAnuncioId(id);
    const a = anuncios.find((x) => x.id === id);
    if (!a) return;
    setC({
      ...c,
      preco: String(a.preco),
      categoria: a.categoria,
      logistica: a.logistica && a.logistica in LOGISTICAS ? a.logistica : "drop_off",
      altura: a.altura ? String(a.altura) : "",
      largura: a.largura ? String(a.largura) : "",
      comprimento: a.comprimento ? String(a.comprimento) : "",
      peso: a.peso ? String(a.peso) : "",
    });
    setResultados(null);
  }

  function buscar(q: string) {
    setBusca(q);
    clearTimeout(timer.current);
    if (q.trim().length < 3) return setSugestoes([]);
    timer.current = setTimeout(() => buscarCategoriasAction(q).then(setSugestoes), 350);
  }

  function calcular(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setErro(null);
      const r = await simularAction(c);
      if (r.ok) setResultados(r.resultados);
      else {
        setErro(r.erro);
        setResultados(null);
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_1fr]">
      <form onSubmit={calcular} className="card space-y-5 self-start">
        {anuncios.length > 0 && (
          <label className="field">
            <span>Preencher com um anúncio seu</span>
            <select value={anuncioId} onChange={(e) => usarAnuncio(e.target.value)}>
              <option value="">— escolher —</option>
              {anuncios.map((a) => (
                <option key={a.id} value={a.id}>
                  {brl(a.preco)} · {a.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        {erroAnuncios && <p className="text-xs text-muted">{erroAnuncios}</p>}

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Produto</legend>
          <label className="field">
            <span>Preço de venda (R$)</span>
            <input value={c.preco} onChange={set("preco")} inputMode="decimal" required placeholder="0,00" className="text-base" />
          </label>
          <div className="field">
            <span>Categoria</span>
            {categoria ? (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <b>{categoria.nome}</b> <span className="text-xs text-muted">{categoria.id}</span>
                  {categoria.caminho && <span className="block truncate text-xs text-muted" title={categoria.caminho}>{categoria.caminho}</span>}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-accent hover:underline cursor-pointer"
                  onClick={() => {
                    setC({ ...c, categoria: "" });
                    setCategoria(null);
                  }}
                >
                  trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input value={busca} onChange={(e) => buscar(e.target.value)} placeholder="Digite o nome do produto…" className="w-full" />
                {sugestoes.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                    {sugestoes.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2 cursor-pointer"
                          onClick={() => {
                            setC({ ...c, categoria: s.id });
                            setCategoria(s);
                            setSugestoes([]);
                            setBusca("");
                          }}
                        >
                          <b>{s.nome}</b> <span className="text-xs text-muted">· {s.caminho}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Envio</legend>
          <label className="field">
            <span>Forma de envio</span>
            <select value={c.logistica} onChange={set("logistica")}>
              {Object.entries(LOGISTICAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
            <label className="field">
              <span>Altura (cm)</span>
              <input value={c.altura} onChange={set("altura")} inputMode="decimal" required />
            </label>
            <label className="field">
              <span>Largura (cm)</span>
              <input value={c.largura} onChange={set("largura")} inputMode="decimal" required />
            </label>
            <label className="field">
              <span>Comprimento (cm)</span>
              <input value={c.comprimento} onChange={set("comprimento")} inputMode="decimal" required />
            </label>
            <label className="field">
              <span>Peso (g)</span>
              <input value={c.peso} onChange={set("peso")} inputMode="decimal" required />
            </label>
          </div>
          <p className="text-xs text-muted">Medidas do pacote já embalado, como no anúncio.</p>
        </fieldset>

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Seus custos (opcional)</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Custo do produto (R$)</span>
              <input value={c.custoProduto} onChange={set("custoProduto")} inputMode="decimal" placeholder="0,00" />
            </label>
            <label className="field">
              <span>Embalagem e outros (R$)</span>
              <input value={c.embalagem} onChange={set("embalagem")} inputMode="decimal" placeholder="0,00" />
            </label>
            <label className="field">
              <span>Imposto (% da venda)</span>
              <input value={c.impostoPct} onChange={set("impostoPct")} inputMode="decimal" placeholder="Ex.: 6" />
            </label>
            <label className="field">
              <span>Margem desejada (%)</span>
              <input value={c.margemAlvo} onChange={set("margemAlvo")} inputMode="decimal" placeholder="Ex.: 30" />
            </label>
          </div>
        </fieldset>

        {erro && <p className="text-sm text-neg">{erro}</p>}
        <button className="btn w-full" disabled={pendente || !c.categoria}>
          {pendente ? "Consultando o Mercado Livre…" : "Simular"}
        </button>
      </form>

      <div className="min-w-0 space-y-4">
        {resultados ? (
          <div className="grid gap-4 md:grid-cols-2">
            {resultados.map((r) => (
              <Cartao key={r.tipo} r={r} temCustos={!!(c.custoProduto || c.embalagem || c.impostoPct)} />
            ))}
          </div>
        ) : (
          <div className="card grid min-h-64 place-items-center text-center text-sm text-muted">
            <p>
              Preencha preço, categoria e medidas e clique em <b>Simular</b>.
              <br />
              Os valores vêm direto do Mercado Livre, para Clássico e Premium lado a lado.
            </p>
          </div>
        )}
        <p className="text-xs text-muted">
          Tarifa e frete consultados na API do Mercado Livre com a conta da loja (reputação e descontos de frete já aplicados). Abaixo de R$ 79 o ML
          não cobra mais custo fixo: o custo é o envio, que varia com peso e medidas.
        </p>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, sub, forte, neg }: { rotulo: string; valor: string; sub?: string; forte?: boolean; neg?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${forte ? "font-semibold" : ""}`}>
      <span className="min-w-0">
        {rotulo}
        {sub && <span className="block text-xs font-normal text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${neg ? "text-neg" : ""}`}>{valor}</span>
    </div>
  );
}

function Cartao({ r, temCustos }: { r: Resultado; temCustos: boolean }) {
  const custosMl = r.tarifa + r.envio;
  return (
    <section className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{TIPOS[r.tipo]}</h2>
        <span className="text-xs text-muted">{r.tipo === "gold_pro" ? "parcelado sem juros" : "exposição alta"}</span>
      </div>
      <div className="divide-y divide-border text-sm">
        <Linha rotulo="Preço de venda" valor={brl(r.preco)} />
        <Linha
          rotulo={`Tarifa de venda (${pct(r.tarifaPct)})`}
          sub={r.custoFixo ? `inclui custo fixo de ${brl(r.custoFixo)}` : undefined}
          valor={`− ${brl(r.tarifa)}`}
          neg
        />
        <Linha
          rotulo={r.freteGratis ? "Envio (frete grátis)" : "Envio"}
          sub={
            r.envioCheio && r.descontoEnvioPct
              ? `${brl(r.envioCheio)} com ${r.descontoEnvioPct}% de desconto do ML`
              : r.preco < 79
                ? "custo de envio para produtos abaixo de R$ 79"
                : undefined
          }
          valor={`− ${brl(r.envio)}`}
          neg
        />
        <Linha rotulo="Você recebe" sub={`custos do ML: ${brl(custosMl)} (${pct((custosMl / r.preco) * 100)} do preço)`} valor={brl(r.recebe)} forte />
        {temCustos && (
          <>
            {r.imposto > 0 && <Linha rotulo="Imposto" valor={`− ${brl(r.imposto)}`} neg />}
            <Linha rotulo="Custo do produto + embalagem" valor={`− ${brl(r.recebe - r.imposto - r.lucro)}`} neg />
            <div className={`-mx-4 mt-1 flex items-baseline justify-between rounded-lg px-4 py-3 sm:-mx-5 sm:px-5 ${r.lucro >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
              <span className="font-semibold">Lucro por venda</span>
              <span className={`text-right ${r.lucro >= 0 ? "text-pos" : "text-neg"}`}>
                <b className="text-xl tabular-nums">{brl(r.lucro)}</b>
                <span className="block text-xs">margem {pct(r.margemPct)}</span>
              </span>
            </div>
          </>
        )}
      </div>
      {r.precoSugerido != null && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          Para a margem desejada, venda por <b>{brl(r.precoSugerido)}</b>
        </p>
      )}
    </section>
  );
}
