import { ensureSchema } from "@/lib/db";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { conectar } from "@/lib/ml";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const esperado = req.cookies.get("ml_state")?.value ?? "";
  const ok = esperado.length > 0 && state.length === esperado.length && timingSafeEqual(Buffer.from(state), Buffer.from(esperado));
  const destino = (q: string) => {
    const r = NextResponse.redirect(new URL(`/integracoes?${q}`, req.url));
    r.cookies.delete("ml_state");
    return r;
  };
  if (!ok || !code) return destino("erro=state");
  try {
    await conectar(code, req.nextUrl.origin);
    return destino("conectado=1");
  } catch (e) {
    console.error(e);
    return destino("erro=token");
  }
}
