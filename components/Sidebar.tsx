"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MENU = [
  { titulo: null, itens: [{ href: "/", label: "Início" }] },
  { titulo: "Cadastros", itens: [{ href: "/clientes", label: "Clientes" }, { href: "/produtos", label: "Produtos" }] },
  {
    titulo: "Vendas",
    itens: [
      { href: "/vendas", label: "Pedidos de venda" },
      { href: "/notas", label: "Notas fiscais" },
      { href: "/entregas", label: "Entregas" },
    ],
  },
  { titulo: "Suprimentos", itens: [{ href: "/estoque", label: "Estoque" }] },
  {
    titulo: "Finanças",
    itens: [
      { href: "/financeiro/receber", label: "Contas a receber" },
      { href: "/financeiro/pagar", label: "Contas a pagar" },
      { href: "/financeiro/fluxo", label: "Fluxo de caixa" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/integracoes", label: "Integrações" },
      { href: "/configuracoes", label: "Configurações" },
    ],
  },
];

export function Sidebar({ empresa, sair }: { empresa: string; sair: () => Promise<void> }) {
  const path = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  return (
    <aside className="sidebar">
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/10">
        <Link href="/" className="font-semibold tracking-tight truncate">{empresa}</Link>
        <button className="md:hidden text-sm opacity-80" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>
      <nav className={`${aberto ? "block" : "hidden"} md:block px-2 py-3 space-y-4 overflow-y-auto`}>
        {MENU.map((g, i) => (
          <div key={i}>
            {g.titulo && <p className="px-3 pb-1 text-[11px] uppercase tracking-wider opacity-50">{g.titulo}</p>}
            {g.itens.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setAberto(false)}
                className={`block rounded-md px-3 py-1.5 text-sm ${ativo(it.href) ? "bg-white/15 font-medium" : "opacity-80 hover:bg-white/10"}`}
              >
                {it.label}
              </Link>
            ))}
          </div>
        ))}
        <form action={sair} className="px-3 pt-2 border-t border-white/10">
          <button className="text-sm opacity-70 hover:opacity-100 cursor-pointer">Sair</button>
        </form>
      </nav>
    </aside>
  );
}
