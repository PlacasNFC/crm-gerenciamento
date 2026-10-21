import { CANAIS, STATUS_ENTREGA, hoje } from "@/lib/constants";
import { ESTADOS } from "@/lib/regioes";

export type Venda = {
  id: number;
  data: string;
  canal: string;
  pedido_externo: string | null;
  cliente: string | null;
  produto: string;
  quantidade: number;
  valor_bruto: string;
  taxa_plataforma: string;
  frete: string;
  custo_produto: string;
  status_entrega: string;
  codigo_rastreio: string | null;
  observacoes: string | null;
  uf: string | null;
  cidade: string | null;
};

export function VendaForm({
  action,
  venda,
  submitLabel = "Salvar venda",
}: {
  action: (f: FormData) => Promise<void>;
  venda?: Venda;
  submitLabel?: string;
}) {
  const d = (k: keyof Venda) => (venda?.[k] ?? undefined) as string | undefined;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="field">
        <span>Data</span>
        <input type="date" name="data" defaultValue={d("data")?.slice(0, 10) ?? hoje()} required />
      </label>
      <label className="field">
        <span>Canal</span>
        <select name="canal" defaultValue={d("canal") ?? "mercado_livre"}>
          {Object.entries(CANAIS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Nº do pedido</span>
        <input name="pedido_externo" defaultValue={d("pedido_externo")} />
      </label>
      <label className="field">
        <span>Cliente</span>
        <input name="cliente" defaultValue={d("cliente")} />
      </label>
      <label className="field sm:col-span-2">
        <span>Produto</span>
        <input name="produto" defaultValue={d("produto")} required />
      </label>
      <label className="field">
        <span>Quantidade</span>
        <input type="number" min={1} name="quantidade" defaultValue={venda?.quantidade ?? 1} />
      </label>
      <label className="field">
        <span>Valor da venda (R$)</span>
        <input type="number" step="0.01" min={0} name="valor_bruto" defaultValue={d("valor_bruto")} required />
      </label>
      <label className="field">
        <span>Taxa da plataforma (R$)</span>
        <input type="number" step="0.01" min={0} name="taxa_plataforma" defaultValue={d("taxa_plataforma") ?? "0"} />
      </label>
      <label className="field">
        <span>Frete pago por você (R$)</span>
        <input type="number" step="0.01" name="frete" defaultValue={d("frete") ?? "0"} />
      </label>
      <label className="field">
        <span>Custo do produto (R$)</span>
        <input type="number" step="0.01" min={0} name="custo_produto" defaultValue={d("custo_produto") ?? "0"} />
      </label>
      <label className="field">
        <span>Status da entrega</span>
        <select name="status_entrega" defaultValue={d("status_entrega") ?? "a_enviar"}>
          {Object.entries(STATUS_ENTREGA).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Código de rastreio</span>
        <input name="codigo_rastreio" defaultValue={d("codigo_rastreio")} />
      </label>
      <label className="field">
        <span>Estado do cliente</span>
        <select name="uf" defaultValue={d("uf") ?? ""}>
          <option value="">—</option>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <option key={k} value={k}>{k} · {v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Cidade</span>
        <input name="cidade" defaultValue={d("cidade")} />
      </label>
      <label className="field sm:col-span-2">
        <span>Observações</span>
        <input name="observacoes" defaultValue={d("observacoes")} />
      </label>
      <div className="flex items-end">
        <button className="btn w-full">{submitLabel}</button>
      </div>
    </form>
  );
}
