import Link from "next/link";
import { sql } from "@/lib/db";

const ABAS = [
  { href: "/produtos", label: "Produtos" },
  { href: "/produtos/insumos", label: "Insumos" },
  { href: "/produtos/anuncios", label: "Anúncios" },
  { href: "/produtos/canais", label: "Taxas por canal" },
];

// Anúncios vendidos que ainda não têm produto vinculado (custo zerado nas vendas).
export async function anunciosPendentes() {
  const [{ n }] = (await sql`SELECT COUNT(DISTINCT (anuncio_id, variacao_id)) AS n FROM venda_itens
    WHERE produto_id IS NULL AND anuncio_id IS NOT NULL`) as { n: string }[];
  return Number(n);
}

export async function ProdutosNav({ atual }: { atual: string }) {
  const pendentes = await anunciosPendentes();
  return (
    <nav className="tabs">
      {ABAS.map((a) => (
        <Link key={a.href} href={a.href} data-ativo={atual === a.href}>
          {a.label}
          {a.href === "/produtos/anuncios" && pendentes > 0 && (
            <span className="badge bg-amber-400/20 text-amber-800 dark:text-amber-300 ml-1.5">{pendentes} sem produto</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
