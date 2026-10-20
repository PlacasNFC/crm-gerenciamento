// Peças de layout comuns às páginas.

export function Cabecalho({ titulo, sub, children }: { titulo: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Kpi({
  titulo,
  valor,
  sub,
  delta,
  destaque,
}: {
  titulo: string;
  valor: string;
  sub?: React.ReactNode;
  delta?: number | null; // variação em % contra o período anterior
  destaque?: "pos" | "neg";
}) {
  const cor = destaque === "pos" ? "text-pos" : destaque === "neg" ? "text-neg" : "";
  return (
    <div className="card">
      <p className="text-xs font-medium text-muted">{titulo}</p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${cor}`}>{valor}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {delta != null && Number.isFinite(delta) && (
          <span className={`font-medium ${delta >= 0 ? "text-pos" : "text-neg"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {sub}
      </div>
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

// Texto longo numa linha só, com o conteúdo inteiro no tooltip.
export function Truncado({ texto, className = "cell-produto" }: { texto: string | null | undefined; className?: string }) {
  if (!texto) return <span className="text-muted">—</span>;
  return (
    <span className={className} title={texto}>
      {texto}
    </span>
  );
}
