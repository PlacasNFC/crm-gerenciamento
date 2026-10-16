"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { Resultado } from "@/lib/form";

type Props = {
  action: (prev: Resultado, f: FormData) => Promise<Resultado>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirmar?: string;
};

export function ActionForm({ action, children, className, resetOnSuccess, confirmar }: Props) {
  const [res, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (res?.ok && resetOnSuccess) ref.current?.reset();
  }, [res, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      // envio manual: com <form action> o React 19 limpa os campos mesmo quando a validação falha
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || (confirmar && !confirm(confirmar))) return;
        const dados = new FormData(e.currentTarget);
        startTransition(() => run(dados));
      }}
    >
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {res && !res.ok && <p className="msg-erro" role="alert">{res.erro}</p>}
      {res?.ok && res.msg && <p className="msg-ok" role="status">{res.msg}</p>}
    </form>
  );
}
