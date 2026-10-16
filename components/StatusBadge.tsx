import { STATUS_ENTREGA, type StatusEntrega } from "@/lib/constants";

const cores: Record<StatusEntrega, string> = {
  a_enviar: "bg-amber-100 text-amber-800",
  enviado: "bg-blue-100 text-blue-800",
  entregue: "bg-green-100 text-green-800",
  devolvido: "bg-red-100 text-red-800",
  cancelado: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status }: { status: StatusEntrega }) {
  return <span className={`badge ${cores[status] ?? ""}`}>{STATUS_ENTREGA[status] ?? status}</span>;
}
