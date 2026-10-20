// Paleta das colunas, boards e cards do kanban. As classes ficam literais para o Tailwind encontrá-las.
export const CORES = {
  cinza: { nome: "Cinza", ponto: "bg-slate-400", faixa: "bg-slate-400", suave: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  azul: { nome: "Azul", ponto: "bg-blue-500", faixa: "bg-blue-500", suave: "bg-blue-500/12 text-blue-700 dark:text-blue-300" },
  verde: { nome: "Verde", ponto: "bg-emerald-500", faixa: "bg-emerald-500", suave: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  amarelo: { nome: "Amarelo", ponto: "bg-amber-400", faixa: "bg-amber-400", suave: "bg-amber-400/20 text-amber-800 dark:text-amber-300" },
  laranja: { nome: "Laranja", ponto: "bg-orange-500", faixa: "bg-orange-500", suave: "bg-orange-500/12 text-orange-700 dark:text-orange-300" },
  vermelho: { nome: "Vermelho", ponto: "bg-red-500", faixa: "bg-red-500", suave: "bg-red-500/12 text-red-700 dark:text-red-300" },
  roxo: { nome: "Roxo", ponto: "bg-violet-500", faixa: "bg-violet-500", suave: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  rosa: { nome: "Rosa", ponto: "bg-pink-500", faixa: "bg-pink-500", suave: "bg-pink-500/12 text-pink-700 dark:text-pink-300" },
} as const;

export type Cor = keyof typeof CORES;

export const corValida = (c: unknown, padrao: Cor = "cinza"): Cor => (typeof c === "string" && c in CORES ? (c as Cor) : padrao);

// Modelos de colunas para começar um board novo.
export const MODELOS: Record<string, { nome: string; colunas: [string, Cor][] }> = {
  tarefas: { nome: "Tarefas", colunas: [["A fazer", "cinza"], ["Fazendo", "azul"], ["Feito", "verde"]] },
  producao: {
    nome: "Produção de pedidos",
    colunas: [["Pedido recebido", "cinza"], ["Gravando", "amarelo"], ["Embalando", "laranja"], ["Enviado", "verde"]],
  },
  lancamento: {
    nome: "Lançamento de produto",
    colunas: [["Ideia", "roxo"], ["Protótipo", "amarelo"], ["Fotos e anúncio", "azul"], ["No ar", "verde"]],
  },
  vazio: { nome: "Em branco", colunas: [] },
};
