import { sql, ensureSchema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureSchema();
  const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM vendas WHERE status_entrega = 'a_enviar'`) as { n: number }[];
  return (
    <div className="min-h-screen">
      <Sidebar logout={logout} aEnviar={n} />
      <div className="lg:pl-64">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 space-y-6">{children}</main>
      </div>
    </div>
  );
}
