import { ensureSchema } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mlConfigurado, urlAutorizacao } from "@/lib/ml";

export async function GET(req: NextRequest) {
  await ensureSchema();
  if (!mlConfigurado()) return NextResponse.redirect(new URL("/integracoes?erro=config", req.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(urlAutorizacao(req.nextUrl.origin, state));
  res.cookies.set("ml_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
