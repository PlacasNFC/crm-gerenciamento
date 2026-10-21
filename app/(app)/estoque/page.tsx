import Link from "next/link";
import { sql, ensureSchema } from "@/lib/db";
import { brl, dataBR, hoje } from "@/lib/constants";
import { CATEGORIAS_ESTOQUE, MATERIAIS, UNIDADES, baixo, carregarItens, nomeCategoria, qtdFmt, type CategoriaEstoque, type ItemEstoque } from "@/lib/estoque";
import { Cabecalho, Kpi, Vazio } from "@/components/ui";
import { Icone } from "@/components/Icone";
import { ExcluirBotao } from "@/components/ExcluirBotao";
import { atualizarItem, criarItem, entradaItem, excluirItem, excluirMovimento, saidaItem } from "./actions";

export const dynamic = "force-dynamic";

type Mov = { id: number; data: string; tipo: "entrada" | "saida" | "ajuste"; quantidade: string; valor_total: string | null; observacao: string | null };

const TIPOS_MOV = { entrada: "Compra", saida: "Baixa", ajuste: "Ajuste" } as const;

export default async function Estoque({ searchParams }: { searchParams: Promise<{ c?: string; item?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const cat = sp.c && sp.c in CATEGORIAS_ESTOQUE ? (sp.c as CategoriaEstoque) : sp.c === "baixo" ? "baixo" : null;
  const itens = await carregarItens();
  const sel = itens.find((i) => i.id === Number(sp.item)) ?? null;
  const movs = sel
    ? ((await sql`SELECT id, data, tipo, quantidade, valor_total, observacao FROM estoque_movimentos
        WHERE item_id = ${sel.id} ORDER BY data DESC, id DESC LIMIT 30`) as Mov[])
    : [];

  const valorTotal = itens.reduce((a, i) => a + Math.max(0, Number(i.quantidade)) * Number(i.custo_unitario), 0);
  const kgFilamento = itens.filter((i) => i.categoria === "filamento").reduce((a, i) => a + Math.max(0, Number(i.quantidade)), 0);
  const baixos = itens.filter(baixo);
  const lista = itens.filter((i) => (cat === "baixo" ? baixo(i) : !cat || i.categoria === cat));
  const usadas = Object.keys(CATEGORIAS_ESTOQUE).filter((c) => itens.some((i) => i.categoria === c)) as CategoriaEstoque[];

  const url = (mud: Record<string, string | null>) => {
    const q = new URLSearchParams({ ...(cat ? { c: cat } : {}), ...(sel ? { item: String(sel.id) } : {}) });
    for (const [k, v] of Object.entries(mud)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `/estoque?${s}` : "/estoque";
  };

  return (
    <>
      <Cabecalho
        titulo="Estoque de insumos"
        sub="Filamentos, chips NFC, embalagens, etiquetas… O custo de cada item alimenta a calculadora de custo de peças."
      >
        <Link href="/calculadora" className="btn-ghost">
          <Icone nome="calculadora" /> Calculadora
        </Link>
      </Cabecalho>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Valor em estoque" valor={brl(valorTotal)} sub="quantidade × custo médio" />
        <Kpi titulo="Filamento disponível" valor={qtdFmt(kgFilamento, "kg")} sub={`${itens.filter((i) => i.categoria === "filamento").length} rolos/cores cadastrados`} />
        <Kpi titulo="Itens cadastrados" valor={String(itens.length)} />
        <Kpi titulo="Abaixo do mínimo" valor={String(baixos.length)} destaque={baixos.length ? "neg" : undefined} sub={baixos.length ? "hora de repor" : "tudo ok"} />
      </section>

      {sel ? (
        <Gerenciar item={sel} movs={movs} fechar={url({ item: null })} />
      ) : (
        <section className="card">
          <details className="group" open={itens.length === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <h2 className="card-title">Cadastrar item</h2>
              <span className="btn-ghost group-open:hidden">
                <Icone nome="mais" /> Novo item
              </span>
            </summary>
            <form action={criarItem} className="mt-4">
              <CamposItem />
              <div className="mt-3">
                <button className="btn">
                  <Icone nome="mais" /> Cadastrar
                </button>
              </div>
            </form>
          </details>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <nav className="tabs max-w-full overflow-x-auto">
          <Link href={url({ c: null })} data-ativo={!cat}>
            Todos <span className="text-xs opacity-60">{itens.length}</span>
          </Link>
          {usadas.map((c) => (
            <Link key={c} href={url({ c })} data-ativo={cat === c}>
              {CATEGORIAS_ESTOQUE[c].nome} <span className="text-xs opacity-60">{itens.filter((i) => i.categoria === c).length}</span>
            </Link>
          ))}
          {baixos.length > 0 && (
            <Link href={url({ c: "baixo" })} data-ativo={cat === "baixo"}>
              Repor <span className="text-xs opacity-60">{baixos.length}</span>
            </Link>
          )}
        </nav>
      </div>

      {lista.length === 0 ? (
        <Vazio>{itens.length ? "Nenhum item neste filtro." : "Nenhum insumo ainda. Comece cadastrando seus rolos de filamento."}</Vazio>
      ) : (
        <section className="card overflow-x-auto p-0 sm:p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Categoria</th>
                <th className="text-right">Em estoque</th>
                <th className="text-right">Custo</th>
                <th className="text-right">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className={sel?.id === i.id ? "[&>td]:bg-accent-soft" : ""}>
                  <td>
                    <p className="font-medium">{i.nome}</p>
                    <p className="text-xs text-muted">{[i.material, i.cor, i.marca].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td className="whitespace-nowrap text-muted">{nomeCategoria(i.categoria)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    <span className={Number(i.quantidade) < 0 ? "text-neg" : ""}>{qtdFmt(i.quantidade, i.unidade)}</span>
                    {baixo(i) && <span className="badge ml-2 bg-amber-400/20 text-amber-800 dark:text-amber-300">repor</span>}
                    {i.estoque_minimo != null && <p className="text-xs text-muted">mín. {qtdFmt(i.estoque_minimo, i.unidade)}</p>}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {brl(i.custo_unitario)}
                    <span className="text-xs text-muted">/{i.unidade}</span>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{brl(Math.max(0, Number(i.quantidade)) * Number(i.custo_unitario))}</td>
                  <td className="text-right">
                    <Link href={url({ item: String(i.id) })} className="btn-ghost py-1 text-xs">
                      Gerenciar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function CamposItem({ item }: { item?: ItemEstoque }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="field sm:col-span-2">
        <span>Nome</span>
        <input name="nome" required maxLength={200} defaultValue={item?.nome} placeholder="Ex.: PLA Bambu Basic Preto 1 kg" />
      </label>
      <label className="field">
        <span>Categoria</span>
        <select name="categoria" defaultValue={item?.categoria ?? "filamento"}>
          {Object.entries(CATEGORIAS_ESTOQUE).map(([k, v]) => (
            <option key={k} value={k}>{v.nome}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Unidade (filamento é sempre kg)</span>
        <select name="unidade" defaultValue={item?.unidade ?? "un"}>
          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      {!item && (
        <label className="field">
          <span>Quantidade atual</span>
          <input name="quantidade" inputMode="decimal" placeholder="Filamento em kg: 1 rolo = 1" />
        </label>
      )}
      <label className="field">
        <span>Custo (R$ por kg / por unidade)</span>
        <input name="custo_unitario" inputMode="decimal" defaultValue={item?.custo_unitario ? Number(item.custo_unitario).toString() : undefined} placeholder="Ex.: 99,90" />
      </label>
      <label className="field">
        <span>Estoque mínimo (aviso)</span>
        <input name="estoque_minimo" inputMode="decimal" defaultValue={item?.estoque_minimo ? Number(item.estoque_minimo).toString() : undefined} placeholder="Opcional" />
      </label>
      <label className="field">
        <span>Material (filamento)</span>
        <input name="material" list="materiais" maxLength={40} defaultValue={item?.material ?? undefined} placeholder="PLA, PETG…" />
        <datalist id="materiais">
          {MATERIAIS.map((m) => <option key={m} value={m} />)}
        </datalist>
      </label>
      <label className="field">
        <span>Cor</span>
        <input name="cor" maxLength={60} defaultValue={item?.cor ?? undefined} />
      </label>
      <label className="field">
        <span>Marca</span>
        <input name="marca" maxLength={60} defaultValue={item?.marca ?? undefined} />
      </label>
      <label className="field">
        <span>Fornecedor</span>
        <input name="fornecedor" maxLength={120} defaultValue={item?.fornecedor ?? undefined} />
      </label>
      <label className="field sm:col-span-2 lg:col-span-4">
        <span>Observações</span>
        <input name="observacoes" maxLength={2000} defaultValue={item?.observacoes ?? undefined} />
      </label>
    </div>
  );
}

function Gerenciar({ item: i, movs, fechar }: { item: ItemEstoque; movs: Mov[]; fechar: string }) {
  const filamento = i.categoria === "filamento";
  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{nomeCategoria(i.categoria)}</p>
          <h2 className="text-lg font-semibold">{i.nome}</h2>
          <p className="text-sm text-muted">
            {qtdFmt(i.quantidade, i.unidade)} em estoque · custo médio {brl(i.custo_unitario)}/{i.unidade}
            {filamento && ` · ${brl(Number(i.custo_unitario) / 1000)}/g`}
          </p>
        </div>
        <Link href={fechar} className="btn-icon" aria-label="Fechar">
          <Icone nome="fechar" />
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form action={entradaItem.bind(null, i.id)} className="space-y-3 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">Registrar compra</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="field">
              <span>Quantidade ({i.unidade})</span>
              <input name="quantidade" inputMode="decimal" required placeholder={filamento ? "Ex.: 2" : "Ex.: 100"} />
            </label>
            <label className="field">
              <span>Valor pago total (R$)</span>
              <input name="valor_total" inputMode="decimal" placeholder="Com frete" />
            </label>
            <label className="field">
              <span>Data</span>
              <input type="date" name="data" defaultValue={hoje()} />
            </label>
          </div>
          <label className="field">
            <span>Observação</span>
            <input name="observacao" maxLength={300} placeholder="Ex.: promoção Bambu Store" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="lancar_caixa" className="size-4" /> Lançar o valor em Entradas e saídas
            </label>
            <button className="btn py-1.5">Somar ao estoque</button>
          </div>
          <p className="text-xs text-muted">Com o valor pago, o custo do item vira a média ponderada entre o estoque atual e a compra.</p>
        </form>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <form action={saidaItem.bind(null, i.id)} className="space-y-2">
            <h3 className="text-sm font-semibold">Baixa ou contagem</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="field">
                <span>Tipo</span>
                <select name="modo" defaultValue="baixa">
                  <option value="baixa">Baixa (consumi)</option>
                  <option value="contagem">Contagem (tenho)</option>
                </select>
              </label>
              <label className="field">
                <span>Quantidade ({i.unidade})</span>
                <input name="quantidade" inputMode="decimal" required placeholder={filamento ? "Ex.: 0,35" : "Ex.: 10"} />
              </label>
              <label className="field">
                <span>Data</span>
                <input type="date" name="data" defaultValue={hoje()} />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="field flex-1">
                <span>Observação</span>
                <input name="observacao" maxLength={300} placeholder="Ex.: impressão perdida, uso pessoal…" />
              </label>
              <button className="btn-ghost">Registrar</button>
            </div>
            <p className="text-xs text-muted">
              Contagem: informe quanto existe de fato (ex.: pese o rolo e desconte o carretel) e a diferença é registrada como ajuste.
            </p>
          </form>
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-sm text-muted hover:text-accent">
          <span className="group-open:hidden">+ Editar dados do item</span>
          <span className="hidden group-open:inline">− Fechar edição</span>
        </summary>
        <form action={atualizarItem.bind(null, i.id)} className="mt-3 space-y-3">
          <CamposItem item={i} />
          <button className="btn py-1.5">Salvar</button>
        </form>
        <div className="mt-3 border-t border-border pt-3">
          <ExcluirBotao action={excluirItem.bind(null, i.id)} />
        </div>
      </details>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
        {movs.length === 0 ? (
          <p className="text-sm text-muted">Sem movimentos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th className="text-right">Quantidade</th>
                  <th className="text-right">Valor</th>
                  <th>Obs.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{dataBR(m.data)}</td>
                    <td>{TIPOS_MOV[m.tipo]}</td>
                    <td className={`whitespace-nowrap text-right tabular-nums ${Number(m.quantidade) < 0 ? "text-neg" : "text-pos"}`}>
                      {Number(m.quantidade) > 0 ? "+" : ""}
                      {qtdFmt(m.quantidade, i.unidade)}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{m.valor_total != null ? brl(m.valor_total) : "—"}</td>
                    <td className="text-muted">{m.observacao ?? ""}</td>
                    <td className="text-right">
                      <ExcluirBotao action={excluirMovimento.bind(null, m.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
