// Ícones em linha (traço 2px, 24x24) para não depender de biblioteca.
const PATHS = {
  painel: "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z",
  vendas: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  entregas: "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  dinheiro: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  produtos: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  kanban: "M3 3h18v18H3zM9 3v18M15 3v18M3 9h6M15 13h6",
  ideias: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
  integracoes: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18",
  fechar: "M18 6 6 18M6 6l12 12",
  mais: "M12 5v14M5 12h14",
  lixo: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  editar: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  esquerda: "M15 18l-6-6 6-6",
  direita: "M9 18l6-6-6-6",
  calendario: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  usuario: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  seta_cima: "M12 19V5M5 12l7-7 7 7",
  link: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  kanban_enviar: "M5 12h14M12 5l7 7-7 7",
} as const;

export type NomeIcone = keyof typeof PATHS;

export function Icone({ nome, className = "size-4" }: { nome: NomeIcone; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[nome]} />
    </svg>
  );
}
