"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/auth";

const digest = (s: string) => createHash("sha256").update(s).digest();
const igual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export async function login(_: string | null, form: FormData) {
  const user = String(form.get("usuario") ?? "");
  const pass = String(form.get("senha") ?? "");
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return "Login não configurado no servidor.";

  const ok = igual(user, expectedUser) && igual(pass, expectedPass);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000)); // freia força bruta
    return "Usuário ou senha inválidos.";
  }
  (await cookies()).set(SESSION_COOKIE, await createSession(user), sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
