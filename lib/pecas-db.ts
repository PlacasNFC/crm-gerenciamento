import { sql } from "./db";
import type { Ajustes } from "./pecas";

export async function ajustesPecas(): Promise<Ajustes> {
  const r = (await sql`SELECT produto, pecas FROM pecas_produto`) as { produto: string; pecas: number }[];
  return new Map(r.map((x) => [x.produto, x.pecas]));
}
