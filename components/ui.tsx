import Link from "next/link";
import { STATUS_ENTREGA, type StatusEntrega } from "@/lib/constants";

export function Cabecalho({ titulo, sub, children }: { titulo: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function BotaoLink({ href, children, ghost }: { href: string; children: React.ReactNode; ghost?: boolean }) {
  return <Link href={href} className={ghost ? "btn-ghost" : "btn"}>{children}</Link>;
}

export function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Vazio({ colunas, children }: { colunas: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colunas} className="text-center text-muted py-8">{children}</td>
    </tr>
  );
}

export function Abas({ itens, atual }: { itens: { chave: string; label: string; href: string }[]; atual: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {itens.map((i) => (
        <Link key={i.chave} href={i.href} className={`aba ${i.chave === atual ? "aba-ativa" : ""}`}>{i.label}</Link>
      ))}
    </nav>
  );
}

const coresStatus: Record<StatusEntrega, string> = {
  a_enviar: "tag-amarela",
  enviado: "tag-azul",
  entregue: "tag-verde",
  devolvido: "tag-vermelha",
  cancelado: "tag-cinza",
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as StatusEntrega;
  return <span className={`tag ${coresStatus[s] ?? "tag-cinza"}`}>{STATUS_ENTREGA[s] ?? status}</span>;
}

export function Tag({ cor, children }: { cor: "amarela" | "azul" | "verde" | "vermelha" | "cinza"; children: React.ReactNode }) {
  return <span className={`tag tag-${cor}`}>{children}</span>;
}

export function Kpi({ titulo, valor, sub, tom }: { titulo: string; valor: string; sub?: React.ReactNode; tom?: "pos" | "neg" }) {
  return (
    <div className="card">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`text-xl font-semibold mt-1 ${tom === "pos" ? "text-pos" : tom === "neg" ? "text-neg" : ""}`}>{valor}</p>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
