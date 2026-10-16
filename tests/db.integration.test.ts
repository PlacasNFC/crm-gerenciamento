// Roda só com TEST_DATABASE_URL (banco descartável): apaga e recria tudo.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { dvChave } from "@/lib/nfe";
import { CNPJ_EMPRESA, nfeProc, procCancelamento } from "./fixtures";

const URL_TESTE = process.env.TEST_DATABASE_URL;
const d = URL_TESTE ? describe : describe.skip;

d("banco (integração)", () => {
  const raw = neon(URL_TESTE ?? "postgres://x");
  let db: typeof import("@/lib/db");
  let vendas: typeof import("@/lib/vendas");
  let notas: typeof import("@/lib/notas");

  const um = async <T>(q: Promise<Record<string, unknown>[]>) => (await q)[0] as T;
  const estoque = async (pid: number) =>
    Number((await um<{ s: string }>(raw`SELECT COALESCE(SUM(quantidade),0) AS s FROM estoque_movs WHERE produto_id = ${pid}`)).s);

  beforeAll(async () => {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === URL_TESTE) throw new Error("TEST_DATABASE_URL igual a DATABASE_URL");
    for (const t of ["contas", "estoque_movs", "notas_fiscais", "venda_itens", "vendas", "movimentacoes", "produtos", "clientes", "empresa", "integracoes", "schema_version"])
      await raw.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    // estado de produção v1 (antes do ERP)
    await raw`CREATE TABLE vendas (id SERIAL PRIMARY KEY, data DATE NOT NULL DEFAULT CURRENT_DATE, canal TEXT NOT NULL,
      pedido_externo TEXT, cliente TEXT, produto TEXT NOT NULL, quantidade INTEGER NOT NULL DEFAULT 1,
      valor_bruto NUMERIC(12,2) NOT NULL DEFAULT 0, taxa_plataforma NUMERIC(12,2) NOT NULL DEFAULT 0,
      frete NUMERIC(12,2) NOT NULL DEFAULT 0, custo_produto NUMERIC(12,2) NOT NULL DEFAULT 0,
      status_entrega TEXT NOT NULL DEFAULT 'a_enviar', codigo_rastreio TEXT, observacoes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await raw`CREATE TABLE movimentacoes (id SERIAL PRIMARY KEY, data DATE NOT NULL DEFAULT CURRENT_DATE,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')), categoria TEXT NOT NULL, descricao TEXT,
      valor NUMERIC(12,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await raw`INSERT INTO vendas (data, canal, produto, quantidade, valor_bruto, taxa_plataforma, frete)
      VALUES ('2026-10-10', 'shopee', 'Placa antiga', 3, 100, 20, 5)`;
    await raw`INSERT INTO movimentacoes (data, tipo, categoria, descricao, valor) VALUES ('2026-10-11', 'saida', 'Embalagem', 'Caixas', 30)`;

    process.env.DATABASE_URL = URL_TESTE;
    vi.resetModules();
    db = await import("@/lib/db");
    vendas = await import("@/lib/vendas");
    notas = await import("@/lib/notas");
    await db.ensureSchema();
  }, 60_000);

  it("migra v1 sem perder dados", async () => {
    expect(Number((await um<{ versao: number }>(raw`SELECT versao FROM schema_version`)).versao)).toBe(2);
    const itens = await raw`SELECT descricao, quantidade, valor_unitario FROM venda_itens`;
    expect(itens).toEqual([{ descricao: "Placa antiga", quantidade: "3.000", valor_unitario: "33.33" }]);
    const contas = await raw`SELECT tipo, valor, vencimento::text, pago_em::text FROM contas ORDER BY tipo`;
    expect(contas).toEqual([
      { tipo: "pagar", valor: "30.00", vencimento: "2026-10-11", pago_em: "2026-10-11" },
      { tipo: "receber", valor: "75.00", vencimento: "2026-10-10", pago_em: null },
    ]);
  });

  it("migração é idempotente", async () => {
    await raw`DELETE FROM schema_version`;
    vi.resetModules();
    const db2 = await import("@/lib/db");
    await db2.ensureSchema();
    expect(Number((await um<{ n: string }>(raw`SELECT COUNT(*) AS n FROM venda_itens`)).n)).toBe(1);
    expect(Number((await um<{ n: string }>(raw`SELECT COUNT(*) AS n FROM contas`)).n)).toBe(2);
  });

  it("venda baixa estoque e gera conta a receber; cancelar devolve", async () => {
    await raw`UPDATE empresa SET dias_repasse = '{"mercado_livre": 15, "shopee": 0, "tiktok": 0, "outro": 0}'`;
    const { id: pid } = await um<{ id: number }>(raw`INSERT INTO produtos (sku, nome) VALUES ('PL-1', 'Placa') RETURNING id`);
    await raw`INSERT INTO estoque_movs (produto_id, quantidade, motivo) VALUES (${pid}, 10, 'Inicial')`;

    const base = { data: "2026-10-01", canal: "mercado_livre", pedido_externo: "200001", cliente_id: null, taxa_plataforma: 12.5,
      frete: 7.5, custo_produto: 0, status_entrega: "a_enviar", codigo_rastreio: null, observacoes: null };
    const id = await vendas.criarVenda(base, [
      { produto_id: pid, descricao: "Placa", quantidade: 2, valor_unitario: 50 },
      { produto_id: null, descricao: "Brinde", quantidade: 1, valor_unitario: 0 },
    ]);
    expect(await estoque(pid)).toBe(8);
    const v = await um<Record<string, string>>(raw`SELECT valor_bruto, produto, quantidade FROM vendas WHERE id = ${id}`);
    expect(v).toMatchObject({ valor_bruto: "100.00", produto: "Placa + 1 item(ns)", quantidade: 3 });
    expect(await raw`SELECT valor, vencimento::text FROM contas WHERE venda_id = ${id}`).toEqual([{ valor: "80.00", vencimento: "2026-10-16" }]);

    // edição recalcula
    await vendas.atualizarVenda(id, base, [{ produto_id: pid, descricao: "Placa", quantidade: 3, valor_unitario: 50 }]);
    expect(await estoque(pid)).toBe(7);
    expect((await um<{ valor: string }>(raw`SELECT valor FROM contas WHERE venda_id = ${id}`)).valor).toBe("130.00");

    await vendas.atualizarStatus(id, "cancelado", null);
    expect(await estoque(pid)).toBe(10);
    expect(await raw`SELECT 1 FROM contas WHERE venda_id = ${id}`).toHaveLength(0);

    await vendas.atualizarStatus(id, "enviado", "BR123");
    expect(await estoque(pid)).toBe(7);
    expect(await raw`SELECT 1 FROM contas WHERE venda_id = ${id}`).toHaveLength(1);

    // conta já recebida não é apagada nem alterada
    await raw`UPDATE contas SET pago_em = '2026-10-20' WHERE venda_id = ${id}`;
    await vendas.atualizarStatus(id, "devolvido", null);
    expect(await estoque(pid)).toBe(10);
    expect(await raw`SELECT valor, pago_em::text FROM contas WHERE venda_id = ${id}`).toEqual([{ valor: "130.00", pago_em: "2026-10-20" }]);

    await vendas.excluirVenda(id);
    expect(await raw`SELECT 1 FROM venda_itens WHERE venda_id = ${id}`).toHaveLength(0);
    expect(await estoque(pid)).toBe(10);
  }, 60_000);

  it("rejeita venda sem itens", async () => {
    const base = { data: null, canal: "shopee", pedido_externo: null, cliente_id: null, taxa_plataforma: 0, frete: 0,
      custo_produto: 0, status_entrega: "a_enviar", codigo_rastreio: null, observacoes: null };
    await expect(vendas.criarVenda(base, [])).rejects.toThrow(/pelo menos um item/);
  });

  it("importa XML: exige CNPJ, vincula venda, cancela, compra gera contas, recusa duplicada e de terceiros", async () => {
    const xml = nfeProc(); // NF 123, R$ 129,90, destinatário CPF 52998224725, emitida 15/10/2026
    expect((await notas.importarXml("a.xml", xml)).msg).toMatch(/CNPJ da empresa/);
    await raw`UPDATE empresa SET cnpj = ${CNPJ_EMPRESA}`;

    const { id: cid } = await um<{ id: number }>(raw`INSERT INTO clientes (nome, documento) VALUES ('Maria', '52998224725') RETURNING id`);
    const base = { data: "2026-10-14", canal: "outro", pedido_externo: null, cliente_id: cid, taxa_plataforma: 0, frete: 0,
      custo_produto: 0, status_entrega: "a_enviar", codigo_rastreio: null, observacoes: null };
    const vid = await vendas.criarVenda(base, [
      { produto_id: null, descricao: "Placa NFC Instagram", quantidade: 2, valor_unitario: 45 },
      { produto_id: null, descricao: "Placa NFC Wi-Fi", quantidade: 1, valor_unitario: 39.9 },
    ]);

    const r1 = await notas.importarXml("a.xml", xml);
    expect(r1.ok).toBe(true);
    expect(r1.msg).toMatch(new RegExp(`automaticamente à venda #${vid}`));
    expect(await raw`SELECT direcao, status, numero, venda_id FROM notas_fiscais`).toEqual([{ direcao: "emitida", status: "autorizada", numero: 123, venda_id: vid }]);

    const r2 = await notas.importarXml("a.xml", xml);
    expect(r2).toMatchObject({ ok: false, msg: "NF 123 já foi importada." });

    const r3 = await notas.importarXml("c.xml", procCancelamento());
    expect(r3.ok).toBe(true);
    expect(r3.msg).toMatch(/cancelada.*venda #/);
    expect((await um<{ status: string }>(raw`SELECT status FROM notas_fiscais WHERE numero = 123`)).status).toBe("cancelada");

    // nota de terceiros (nem emitente nem destinatário)
    const outra = (n: string) => { const b = "35261011444777000161550010000" + n + "1" + "87654321"; return b + dvChave(b); };
    const r4 = await notas.importarXml("x.xml", nfeProc({ chave: outra("00777"), emitCnpj: "11444777000161" }));
    expect(r4).toMatchObject({ ok: false });
    expect(r4.msg).toMatch(/não foi emitida nem recebida/);

    // compra: fornecedor emite para a empresa, com 2 duplicatas
    const dups = `<cobr><dup><nDup>001</nDup><dVenc>2026-11-15</dVenc><vDup>64.95</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-15</dVenc><vDup>64.95</vDup></dup></cobr>`;
    const compra = nfeProc({ chave: outra("00888"), emitCnpj: "11444777000161", destDoc: `<CNPJ>${CNPJ_EMPRESA}</CNPJ>`, dups });
    const r5 = await notas.importarXml("compra.xml", compra, { gerarContasPagar: true });
    expect(r5.ok).toBe(true);
    expect(await raw`SELECT valor, vencimento::text, categoria FROM contas WHERE nota_id = ${r5.notaId!} ORDER BY vencimento`).toEqual([
      { valor: "64.95", vencimento: "2026-11-15", categoria: "Compras" },
      { valor: "64.95", vencimento: "2026-12-15", categoria: "Compras" },
    ]);
    expect((await um<{ direcao: string }>(raw`SELECT direcao FROM notas_fiscais WHERE id = ${r5.notaId!}`)).direcao).toBe("recebida");

    // cancelamento de nota não importada
    const r6 = await notas.importarXml("c2.xml", procCancelamento({ chave: outra("00999") }));
    expect(r6.msg).toMatch(/Importe a nota primeiro/);
  }, 60_000);
});
