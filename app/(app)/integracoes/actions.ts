"use server";

import { revalidatePath } from "next/cache";
import { desconectar, sincronizar } from "@/lib/ml";
import { numero, tentar, type Resultado } from "@/lib/form";

export async function sincronizarMl(_: Resultado, f: FormData) {
  return tentar(async () => {
    const dias = Math.min(90, Math.max(1, numero(f, "dias") || 30));
    try {
      const r = await sincronizar({ dias });
      revalidatePath("/", "layout");
      return `${r.novos} pedido(s) novo(s), ${r.atualizados} atualizado(s).`;
    } catch (e) {
      revalidatePath("/integracoes");
      throw e;
    }
  });
}

export async function desconectarMl(): Promise<Resultado> {
  return tentar(async () => {
    await desconectar();
    revalidatePath("/integracoes");
    return "Desconectado.";
  });
}
