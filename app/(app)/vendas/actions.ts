"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importarXml } from "@/lib/notas";
import { ErroValidacao, dataISO, numero, tentar, texto, type Resultado } from "@/lib/form";
import * as vendas from "@/lib/vendas";

function lerItens(f: FormData): vendas.ItemVenda[] {
  let bruto: unknown;
  try {
    bruto = JSON.parse(String(f.get("itens") ?? "[]"));
  } catch {
    throw new ErroValidacao("Itens inválidos.");
  }
  if (!Array.isArray(bruto)) throw new ErroValidacao("Itens inválidos.");
  return bruto.map((i) => ({
    produto_id: Number.isInteger(i?.produto_id) ? i.produto_id : null,
    descricao: String(i?.descricao ?? "").slice(0, 300),
    quantidade: Number(i?.quantidade),
    valor_unitario: Math.round(Number(i?.valor_unitario) * 100) / 100,
  }));
}

function lerDados(f: FormData): vendas.DadosVenda {
  return {
    data: dataISO(f, "data"),
    canal: String(f.get("canal")),
    pedido_externo: texto(f, "pedido_externo"),
    cliente_id: Number(f.get("cliente_id")) || null,
    taxa_plataforma: numero(f, "taxa_plataforma"),
    frete: numero(f, "frete"),
    custo_produto: numero(f, "custo_produto"),
    status_entrega: String(f.get("status_entrega") ?? "a_enviar"),
    codigo_rastreio: texto(f, "codigo_rastreio"),
    observacoes: texto(f, "observacoes"),
  };
}

export async function salvarVenda(_: Resultado, f: FormData) {
  let id = Number(f.get("id")) || null;
  const r = await tentar(async () => {
    const d = lerDados(f);
    const itens = lerItens(f);
    if (id) await vendas.atualizarVenda(id, d, itens);
    else id = await vendas.criarVenda(d, itens);
    revalidatePath("/", "layout");
  });
  if (r?.ok) redirect(`/vendas/${id}?salvo=1`);
  return r;
}

export async function excluirVenda(_: Resultado, f: FormData) {
  const r = await tentar(async () => {
    await vendas.excluirVenda(Number(f.get("id")));
    revalidatePath("/", "layout");
  });
  if (r?.ok) redirect("/vendas");
  return r;
}

export async function importarXmlDaVenda(_: Resultado, f: FormData) {
  return tentar(async () => {
    const arq = f.get("xml");
    if (!(arq instanceof File) || arq.size === 0) throw new ErroValidacao("Selecione o arquivo XML.");
    if (arq.size > 2_000_000) throw new ErroValidacao("Arquivo grande demais para um XML de NF-e.");
    const r = await importarXml(arq.name, await arq.text(), { vendaId: Number(f.get("venda_id")) });
    if (!r.ok) throw new ErroValidacao(r.msg);
    revalidatePath("/", "layout");
    return r.msg;
  });
}
