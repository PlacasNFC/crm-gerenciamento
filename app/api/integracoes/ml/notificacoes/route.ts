import { after } from "next/server";
import { ensureSchema } from "@/lib/db";
import { processarNotificacao, type NotificacaoMl } from "@/lib/ml";

// URL de notificações do app no Mercado Livre (tópicos orders_v2 e shipments).
// O ML exige resposta 200 rápida; o pedido é buscado na API depois de responder.
export async function POST(req: Request) {
  const n = (await req.json().catch(() => null)) as NotificacaoMl | null;
  if (!n || (n.application_id && String(n.application_id) !== process.env.ML_CLIENT_ID)) return new Response(null, { status: 200 });
  after(async () => {
    try {
      await ensureSchema();
      await processarNotificacao(n);
    } catch (e) {
      console.error("notificação ML", n.resource, e);
    }
  });
  return new Response(null, { status: 200 });
}
