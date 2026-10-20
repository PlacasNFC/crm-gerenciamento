"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icone, type NomeIcone } from "./Icone";

type Item = { href: string; label: string; icone: NomeIcone };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Loja",
    itens: [
      { href: "/", label: "Painel", icone: "painel" },
      { href: "/vendas", label: "Vendas", icone: "vendas" },
      { href: "/entregas", label: "Entregas", icone: "entregas" },
      { href: "/movimentacoes", label: "Entradas e saídas", icone: "dinheiro" },
    ],
  },
  {
    titulo: "Organização",
    itens: [
      { href: "/kanban", label: "Kanban", icone: "kanban" },
      { href: "/ideias", label: "Ideias de produtos", icone: "ideias" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [{ href: "/integracoes", label: "Integrações", icone: "integracoes" }],
  },
];

const ativo = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function Sidebar({ logout, aEnviar }: { logout: () => Promise<void>; aEnviar: number }) {
  const path = usePathname();
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [path]);

  const atual = GRUPOS.flatMap((g) => g.itens).find((i) => ativo(path, i.href));

  return (
    <>
      {/* barra do celular */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <button className="btn-icon -ml-1.5" onClick={() => setAberto(true)} aria-label="Abrir menu">
          <Icone nome="menu" className="size-5" />
        </button>
        <span className="font-semibold">{atual?.label ?? "Placas NFC"}</span>
      </header>

      {aberto && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setAberto(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)] transition-transform lg:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">NFC</span>
          <div className="leading-tight">
            <p className="font-semibold text-white">Placas NFC</p>
            <p className="text-xs opacity-60">Gestão da loja</p>
          </div>
          <button className="lg:hidden ml-auto rounded-md p-1.5 hover:bg-white/10" onClick={() => setAberto(false)} aria-label="Fechar menu">
            <Icone nome="fechar" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-45">{g.titulo}</p>
              <ul className="space-y-0.5">
                {g.itens.map((i) => {
                  const on = ativo(path, i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          on ? "bg-white/10 text-white font-medium" : "hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icone nome={i.icone} className="size-[18px] shrink-0" />
                        <span className="flex-1">{i.label}</span>
                        {i.href === "/entregas" && aEnviar > 0 && (
                          <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-black">{aEnviar}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <form action={logout} className="border-t border-white/10 p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white cursor-pointer">
            <Icone nome="sair" className="size-[18px]" />
            Sair
          </button>
        </form>
      </aside>
    </>
  );
}
