"use client";

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="text-sm text-muted">Não foi possível concluir a ação. Confira os campos e tente de novo.</p>
      <button className="btn" onClick={reset}>Tentar de novo</button>
    </div>
  );
}
