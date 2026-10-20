import { ensureSchema } from "@/lib/db";
import { CANAIS, type Canal } from "@/lib/constants";
import { configCanais } from "@/lib/produtos";
import { ProdutosNav } from "@/components/ProdutosNav";
import { Cabecalho } from "@/components/ui";
import { salvarCanais } from "../actions";

export const dynamic = "force-dynamic";

export default async function Canais({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  await ensureSchema();
  const sp = await searchParams;
  const cfg = await configCanais();

  return (
    <>
      <Cabecalho titulo="Taxas por canal">
        <ProdutosNav atual="/produtos/canais" />
      </Cabecalho>
      {sp.salvo && <p className="card text-sm text-pos">Configuração salva.</p>}
      <p className="text-sm text-muted">
        Estimativas usadas na margem planejada dos produtos e para preencher a taxa e o frete na venda manual. Vendas importadas do ML usam a
        tarifa real do pedido; o custo Flex é o que você paga à transportadora por pedido Flex.
      </p>

      <section className="card overflow-x-auto">
        <form action={salvarCanais}>
          <table className="tbl">
            <thead>
              <tr><th>Canal</th><th>Taxa (%)</th><th>Taxa fixa por unidade (R$)</th><th>Frete estimado por pedido (R$)</th><th>Custo Flex por pedido (R$)</th></tr>
            </thead>
            <tbody>
              {(Object.keys(CANAIS) as Canal[]).map((c) => (
                <tr key={c}>
                  <td className="font-medium">{CANAIS[c]}</td>
                  <td><input type="number" step="0.01" min={0} name={`taxa_pct_${c}`} defaultValue={cfg[c].taxa_pct} className="w-24" /></td>
                  <td><input type="number" step="0.01" min={0} name={`taxa_fixa_${c}`} defaultValue={cfg[c].taxa_fixa} className="w-28" /></td>
                  <td><input type="number" step="0.01" min={0} name={`frete_estimado_${c}`} defaultValue={cfg[c].frete_estimado} className="w-28" /></td>
                  <td>
                    {c === "mercado_livre" ? (
                      <input type="number" step="0.01" min={0} name={`custo_flex_${c}`} defaultValue={cfg[c].custo_flex} className="w-28" />
                    ) : (
                      <input type="hidden" name={`custo_flex_${c}`} value={cfg[c].custo_flex} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-3">
            <button className="btn">Salvar</button>
          </div>
        </form>
      </section>
    </>
  );
}
