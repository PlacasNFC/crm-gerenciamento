"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import type { ResultadoLote } from "@/app/(app)/notas/actions";

export function ImportarNotas({ action }: { action: (p: ResultadoLote, f: FormData) => Promise<ResultadoLote> }) {
  const [res, run, pending] = useActionState(action, null);
  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const dados = new FormData(e.currentTarget);
        startTransition(() => run(dados));
      }}
    >
      <h2 className="secao mb-0">Importar XML</h2>
      <p className="text-xs text-muted">
        XML autorizado (nfeProc) das notas emitidas no Sebrae, XML de notas de compra recebidas de fornecedores, ou XML de cancelamento. Pode selecionar vários.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="xml" multiple accept=".xml,text/xml,application/xml" required className="text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="gerar_contas" defaultChecked /> Notas de compra geram contas a pagar
        </label>
        <button className="btn" disabled={pending}>{pending ? "Importando..." : "Importar"}</button>
      </div>
      {res && "erro" in res && <p className="msg-erro">{res.erro}</p>}
      {res && "itens" in res && (
        <ul className="text-sm space-y-1">
          {res.itens.map((i, n) => (
            <li key={n} className={i.ok ? "text-pos" : "text-neg"}>
              <b>{i.arquivo}</b>: {i.msg} {i.notaId && <Link href={`/notas/${i.notaId}`} className="btn-link">abrir</Link>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
