"use server";

import { revalidatePath } from "next/cache";
import { tentar, texto, type Resultado } from "@/lib/form";
import { atualizarStatus } from "@/lib/vendas";

export async function atualizarEntrega(_: Resultado, f: FormData) {
  return tentar(async () => {
    await atualizarStatus(Number(f.get("id")), String(f.get("status_entrega")), texto(f, "codigo_rastreio"));
    revalidatePath("/", "layout");
  });
}
