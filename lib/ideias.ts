export const STATUS_IDEIA = {
  nova: { nome: "Nova", classe: "bg-blue-500/12 text-blue-700 dark:text-blue-300" },
  avaliando: { nome: "Avaliando", classe: "bg-amber-400/20 text-amber-800 dark:text-amber-300" },
  aprovada: { nome: "Aprovada", classe: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  descartada: { nome: "Descartada", classe: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
} as const;

export type StatusIdeia = keyof typeof STATUS_IDEIA;
