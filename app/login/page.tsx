"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [erro, action, pending] = useActionState(login, null);
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Placas NFC · CRM</h1>
          <p className="text-sm text-muted">Entre para continuar</p>
        </div>
        <label className="field">
          <span>Usuário</span>
          <input name="usuario" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span>Senha</span>
          <input name="senha" type="password" autoComplete="current-password" required />
        </label>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn w-full" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
