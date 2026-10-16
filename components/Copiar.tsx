"use client";

import { useState } from "react";

export function Copiar({ valor }: { valor: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {}
      }}
    >
      {ok ? "copiado" : "copiar"}
    </button>
  );
}
