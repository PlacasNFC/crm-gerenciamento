import Link from "next/link";
import { logout } from "../login/actions";

const links = [
  { href: "/", label: "Resumo" },
  { href: "/vendas", label: "Vendas" },
  { href: "/entregas", label: "Entregas" },
  { href: "/movimentacoes", label: "Entradas e saídas" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-semibold">Placas NFC</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted hover:text-accent">
                {l.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto">
            <button className="btn-ghost">Sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">{children}</main>
    </div>
  );
}
