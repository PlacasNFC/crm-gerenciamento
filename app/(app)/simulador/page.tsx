import { ensureSchema } from "@/lib/db";
import { anunciosAtivos, type Anuncio } from "@/lib/simulador";
import { Cabecalho } from "@/components/ui";
import { Simulador } from "@/components/Simulador";

export const dynamic = "force-dynamic";

export default async function SimuladorPage() {
  await ensureSchema();
  let anuncios: Anuncio[] = [];
  let erro: string | null = null;
  try {
    anuncios = await anunciosAtivos();
  } catch {
    erro = "Não deu para carregar seus anúncios do Mercado Livre agora; preencha os dados à mão.";
  }
  return (
    <>
      <Cabecalho
        titulo="Simulador de custos"
        sub="Quanto o Mercado Livre cobra e quanto sobra para vocês em cada venda, no Clássico e no Premium."
      />
      <Simulador anuncios={anuncios} erroAnuncios={erro} />
    </>
  );
}
