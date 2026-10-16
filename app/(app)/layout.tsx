import { Sidebar } from "@/components/Sidebar";
import { ensureSchema, sql } from "@/lib/db";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureSchema();
  const [e] = (await sql`SELECT COALESCE(NULLIF(nome_fantasia, ''), NULLIF(razao_social, ''), 'Placas NFC') AS nome FROM empresa`) as { nome: string }[];
  return (
    <div className="min-h-screen">
      <Sidebar empresa={e?.nome ?? "Placas NFC"} sair={logout} />
      <main className="md:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">{children}</div>
      </main>
    </div>
  );
}
