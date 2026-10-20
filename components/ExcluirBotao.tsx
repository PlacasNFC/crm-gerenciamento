"use client";

export function ExcluirBotao({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Excluir este registro?")) e.preventDefault();
      }}
    >
      <button className="text-xs text-red-600 hover:underline cursor-pointer">Excluir</button>
    </form>
  );
}
