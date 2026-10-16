import { linhas, sql } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const cancel = new URL(req.url).searchParams.has("cancelamento");
  const [n] = await linhas<{ chave: string; xml: string; xml_cancelamento: string | null }>(
    sql`SELECT chave, xml, xml_cancelamento FROM notas_fiscais WHERE id = ${Number(id)}`,
  );
  const corpo = cancel ? n?.xml_cancelamento : n?.xml;
  if (!n || !corpo) return new Response("Não encontrado", { status: 404 });
  return new Response(corpo, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${n.chave}${cancel ? "-cancelamento" : ""}-nfe.xml"`,
    },
  });
}
