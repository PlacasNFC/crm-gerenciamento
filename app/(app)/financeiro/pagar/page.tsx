import { ContasPagina } from "@/components/ContasPagina";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; s?: string }> }) {
  return <ContasPagina tipo="pagar" sp={await searchParams} />;
}
