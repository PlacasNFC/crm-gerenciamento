import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, type Canal } from "@/lib/constants";
import { formatarDocumento, UFS } from "@/lib/fiscal";
import { ActionForm } from "@/components/ActionForm";
import { Cabecalho, Campo } from "@/components/ui";
import { salvarEmpresa } from "./actions";

export const dynamic = "force-dynamic";

type Empresa = {
  razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; ie: string | null; uf: string;
  municipio: string | null; cep: string | null; endereco: string | null; csosn_padrao: string; dias_repasse: Record<Canal, number>;
};

export default async function Configuracoes() {
  await ensureSchema();
  const [e] = (await sql`SELECT * FROM empresa WHERE id = 1`) as Empresa[];
  return (
    <>
      <Cabecalho titulo="Configurações" sub="Dados da empresa usados para conferir as notas importadas e montar os dados de emissão." />
      <ActionForm action={salvarEmpresa} className="space-y-5">
        <section className="card">
          <h2 className="secao">Empresa</h2>
          <div className="grid-form">
            <Campo label="Razão social" className="sm:col-span-2"><input name="razao_social" defaultValue={e.razao_social ?? ""} /></Campo>
            <Campo label="Nome fantasia"><input name="nome_fantasia" defaultValue={e.nome_fantasia ?? ""} /></Campo>
            <Campo label="CNPJ"><input name="cnpj" inputMode="numeric" defaultValue={formatarDocumento(e.cnpj)} /></Campo>
            <Campo label="Inscrição estadual"><input name="ie" inputMode="numeric" defaultValue={e.ie ?? ""} /></Campo>
            <Campo label="UF">
              <select name="uf" defaultValue={e.uf}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
            </Campo>
            <Campo label="Município"><input name="municipio" defaultValue={e.municipio ?? ""} /></Campo>
            <Campo label="CEP"><input name="cep" inputMode="numeric" defaultValue={e.cep ?? ""} /></Campo>
            <Campo label="Endereço" className="sm:col-span-2 lg:col-span-4"><input name="endereco" defaultValue={e.endereco ?? ""} /></Campo>
          </div>
        </section>
        <section className="card">
          <h2 className="secao">Tributação</h2>
          <div className="grid-form">
            <Campo label="Regime"><input value="Simples Nacional (CRT 1)" disabled /></Campo>
            <Campo label="CSOSN padrão">
              <input name="csosn_padrao" defaultValue={e.csosn_padrao} inputMode="numeric" maxLength={3} />
            </Campo>
          </div>
          <p className="text-xs text-muted mt-2">
            102 = tributada pelo Simples sem permissão de crédito (o mais comum em venda a consumidor final). Confirme com seu contador.
          </p>
        </section>
        <section className="card">
          <h2 className="secao">Prazo de repasse por canal</h2>
          <p className="text-xs text-muted mb-3">Dias entre a venda e o dinheiro cair na conta. Define o vencimento das contas a receber geradas pelas vendas.</p>
          <div className="grid-form">
            {(Object.keys(CANAIS) as Canal[]).map((c) => (
              <Campo key={c} label={CANAIS[c]}>
                <input type="number" min={0} max={180} step={1} name={`dias_${c}`} defaultValue={e.dias_repasse?.[c] ?? 0} />
              </Campo>
            ))}
          </div>
        </section>
        <div className="flex justify-end"><button className="btn">Salvar configurações</button></div>
      </ActionForm>
    </>
  );
}
