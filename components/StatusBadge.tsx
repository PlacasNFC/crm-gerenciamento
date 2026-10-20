import { STATUS_ENTREGA, type StatusEntrega } from "@/lib/constants";

const cores: Record<StatusEntrega, string> = {
  a_enviar: "bg-amber-400/20 text-amber-800 dark:text-amber-300",
  enviado: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  entregue: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  devolvido: "bg-red-500/12 text-red-700 dark:text-red-300",
  cancelado: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

export function StatusBadge({ status }: { status: StatusEntrega }) {
  return <span className={`badge ${cores[status] ?? ""}`}>{STATUS_ENTREGA[status] ?? status}</span>;
}
