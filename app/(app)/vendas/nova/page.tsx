import Link from "next/link";
import { hoje } from "@/lib/constants";
import { opcoesVenda } from "@/lib/opcoes";
import { Cabecalho } from "@/components/ui";
import { VendaForm } from "@/components/VendaForm";
import { salvarVenda } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaVenda() {
  const { produtos, clientes } = await opcoesVenda();
  return (
    <>
      <Link href="/vendas" className="btn-link">← Pedidos de venda</Link>
      <Cabecalho titulo="Novo pedido de venda" />
      <VendaForm action={salvarVenda} produtos={produtos} clientes={clientes} hoje={hoje()} />
    </>
  );
}
