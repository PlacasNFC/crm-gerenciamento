"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  ["/calculadora", "Produtos simulados"],
  ["/calculadora/nova", "Nova simulação"],
  ["/calculadora/parametros", "Parâmetros e canais"],
] as const;

export function CalcNav() {
  const path = usePathname();
  const ativa = path === "/calculadora" || path === "/calculadora/parametros" || path === "/calculadora/nova" ? path : null;
  return (
    <nav className="tabs max-w-full overflow-x-auto">
      {ABAS.map(([href, label]) => (
        <Link key={href} href={href} data-ativo={ativa === href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
