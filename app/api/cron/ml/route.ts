import { timingSafeEqual } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { mlConfigurado, sincronizar } from "@/lib/ml";

// Chamado pelo Vercel Cron com "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;
  if (!segredo || recebido.length !== esperado.length || !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado)))
    return new Response("Não autorizado", { status: 401 });
  await ensureSchema();
  if (!mlConfigurado()) return Response.json({ ok: true, ignorado: "ML não configurado" });
  const [i] = await sql`SELECT 1 FROM integracoes WHERE provedor = 'mercado_livre'`;
  if (!i) return Response.json({ ok: true, ignorado: "ML não conectado" });
  try {
    return Response.json({ ok: true, ...(await sincronizar()) });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
