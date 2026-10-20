export function MesFiltro({ mes, action }: { mes: string; action: string }) {
  return (
    <form action={action} className="flex items-end gap-2">
      <label className="field">
        <span>Mês</span>
        <input type="month" name="mes" defaultValue={mes} />
      </label>
      <button className="btn-ghost">Filtrar</button>
    </form>
  );
}

// Primeiro dia do mês e do mês seguinte, para filtrar por intervalo.
export function intervaloMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const ini = `${y}-${String(m).padStart(2, "0")}-01`;
  const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { ini, prox };
}

export function mesValido(m: string | undefined, fallback: string) {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : fallback;
}
