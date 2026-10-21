import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANAIS_PADRAO, ENTRADA_VAZIA, PARAMETROS_PADRAO, custoPeca, normalizarEntrada, normalizarFaixas, precoParaMargem, resultado,
  type CanalCalc, type ItemCusto, type Parametros,
} from "./calculadora.ts";

const perto = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

const itens: ItemCusto[] = [
  { id: 1, nome: "PLA Preto", categoria: "filamento", unidade: "kg", custo_unitario: 100, quantidade: 1 },
  { id: 2, nome: "Tag NFC", categoria: "nfc", unidade: "un", custo_unitario: 1.5, quantidade: 100 },
];
const zerado: Parametros = { ...PARAMETROS_PADRAO, perda_pct: 0, falha_pct: 0, mao_obra_h: 0, fixos_mes: 0, imposto_pct: 0, ads_pct: 0 };
const canal = (i: number): CanalCalc => ({ id: i, ...CANAIS_PADRAO[i] });

test("custo de material, energia e máquina por peça", () => {
  const e = { ...ENTRADA_VAZIA, pecas_por_impressao: 2, tempo_impressao_min: 120, preparo_min: 0, acabamento_min: 0, filamentos: [{ item_id: 1, gramas: 40 }] };
  const p = { ...zerado, potencia_w: 100, tarifa_kwh: 1, impressora_valor: 2000, impressora_vida_h: 5000, manutencao_h: 0.1 };
  const c = custoPeca(e, p, itens);
  perto(c.material, 2); // 40 g × R$ 100/kg ÷ 2 peças
  perto(c.energia, 0.1); // 0,1 kW × 2 h × R$ 1 ÷ 2
  perto(c.maquina, 0.5); // (0,4 + 0,1) × 2 h ÷ 2
  perto(c.total, 2.6);
  perto(c.gramas_peca, 20);
});

test("perda, falha, mão de obra, insumos e fixos", () => {
  const e = { ...ENTRADA_VAZIA, tempo_impressao_min: 0, preparo_min: 6, acabamento_min: 6, filamentos: [{ item_id: 1, gramas: 10 }], insumos: [{ item_id: 2, qtd: 2 }], outros_custos: 0.5 };
  const p = { ...zerado, perda_pct: 10, falha_pct: 10, mao_obra_h: 30, fixos_mes: 100, pecas_mes: 50 };
  const c = custoPeca(e, p, itens);
  perto(c.material, 1.1);
  perto(c.falhas, 0.11);
  perto(c.mao_obra, 6); // 12 min a R$ 30/h
  perto(c.insumos, 3);
  perto(c.fixos, 2);
  perto(c.total, 1.1 + 0.11 + 6 + 3 + 2 + 0.5);
});

test("item removido do estoque gera aviso", () => {
  const c = custoPeca({ ...ENTRADA_VAZIA, filamentos: [{ item_id: 99, gramas: 10 }] }, zerado, itens);
  assert.equal(c.avisos.length, 1);
});

test("resultado usa a faixa do preço (ML abaixo e acima de R$ 79)", () => {
  const ml = canal(0);
  const baixo = resultado(50, 10, ml, zerado);
  perto(baixo.comissao, 7);
  perto(baixo.taxa_fixa, 6.75);
  perto(baixo.lucro, 50 - 10 - 7 - 6.75);
  const alto = resultado(100, 10, ml, zerado);
  perto(alto.taxa_fixa, 0);
  perto(alto.frete, 22);
});

test("preço para margem bate a margem pedida", () => {
  for (const i of [0, 1, 2, 3, 4]) {
    for (const custo of [3, 12, 40, 150]) {
      for (const m of [0, 0.2, 0.4]) {
        const pr = precoParaMargem(custo, canal(i), zerado, m);
        assert.ok(pr != null);
        const r = resultado(pr, custo, canal(i), zerado);
        assert.ok(r.margem >= m - 1e-6, `${CANAIS_PADRAO[i].nome} custo ${custo} m ${m}: ${r.margem}`);
        // um centavo a menos não pode bastar (é o menor preço) — exceto no degrau exato de uma faixa
        const menos = resultado(pr - 0.02, custo, canal(i), zerado);
        assert.ok(menos.margem < m + 1e-6 || CANAIS_PADRAO[i].faixas.some((f) => f.ate === pr));
      }
    }
  }
});

test("degrau de faixa: no ML às vezes compensa ir para R$ 79", () => {
  // Custo 40 com meta 25%: (40 + 6,75) / (1 − 0,14 − 0,25) = 76,639 → arredonda para cima, cabe na faixa.
  perto(precoParaMargem(40, canal(0), zerado, 0.25)!, 76.64, 0.001);
  // Custo 30, sem taxa fixa acima de 79 mas com frete 22: abaixo de 79 vale mais.
  const pr = precoParaMargem(30, canal(0), zerado, 0.3)!;
  assert.ok(pr < 79);
});

test("margem impossível retorna null", () => {
  assert.equal(precoParaMargem(10, canal(0), { ...zerado, imposto_pct: 50 }, 0.5), null);
});

test("normalização de entrada e faixas", () => {
  const e = normalizarEntrada({ pecas_por_impressao: "0", filamentos: [{ item_id: "1", gramas: "-3" }, { item_id: "x" }], ajustes: { falha_pct: "8", foo: 1, perda_pct: "" } });
  assert.equal(e.pecas_por_impressao, 1);
  assert.deepEqual(e.filamentos, [{ item_id: 1, gramas: 0 }]);
  assert.deepEqual(e.ajustes, { falha_pct: 8 });
  const f = normalizarFaixas([{ ate: 100, pct: 5 }, { ate: 50, pct: 10 }]);
  assert.deepEqual(f.map((x) => x.ate), [50, null]);
});
