"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureSchema } from "@/lib/db";
import { desconectar, reprocessar, sincronizar } from "@/lib/ml";

export async function sincronizarMl(f: FormData) {
  await ensureSchema();
  const dias = Math.min(90, Math.max(1, Math.round(Number(f.get("dias")) || 30)));
  let destino: string;
  try {
    const r = await sincronizar({ dias });
    destino = `/integracoes?novos=${r.novos}&atualizados=${r.atualizados}`;
  } catch {
    destino = "/integracoes?erro=sync";
  }
  revalidatePath("/", "layout");
  redirect(destino);
}

export async function desconectarMl() {
  await ensureSchema();
  await desconectar();
  revalidatePath("/integracoes");
}

// Um lote por clique (cada pedido faz até 3 chamadas à API); o cursor segue pela URL.
export async function reprocessarMl(f: FormData) {
  await ensureSchema();
  const depoisDe = Math.max(0, Math.round(Number(f.get("depois_de")) || 0));
  let destino: string;
  try {
    const r = await reprocessar({ depoisDe });
    destino = `/integracoes?reproc=${r.atualizadas}&restantes=${r.restantes}&cursor=${r.ultimo}`;
  } catch {
    destino = "/integracoes?erro=reproc";
  }
  revalidatePath("/", "layout");
  redirect(destino);
}
