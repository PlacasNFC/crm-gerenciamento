"use client";

import { useState } from "react";
import { MODELOS } from "@/lib/cores";
import { criarBoard } from "@/app/(app)/kanban/actions";
import { Modal, SeletorCor } from "./KanbanBoard";
import { Icone } from "./Icone";

export function NovoBoard({ abrirDeCara = false }: { abrirDeCara?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setAberto(true)} autoFocus={abrirDeCara}>
        <Icone nome="mais" /> Novo board
      </button>
      <Modal aberto={aberto} fechar={() => setAberto(false)} titulo="Novo board">
        <form action={criarBoard} className="space-y-4">
          <label className="field">
            <span>Nome</span>
            <input name="nome" required maxLength={200} autoFocus placeholder="Ex.: Pedidos da semana" />
          </label>
          <label className="field">
            <span>Descrição (opcional)</span>
            <input name="descricao" maxLength={500} />
          </label>
          <div className="field">
            <span>Começar com as colunas</span>
            <div className="grid gap-2">
              {Object.entries(MODELOS).map(([k, m], i) => (
                <label
                  key={k}
                  className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input type="radio" name="modelo" value={k} defaultChecked={i === 0} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{m.nome}</span>
                    <span className="block text-xs text-muted">{m.colunas.length ? m.colunas.map((c) => c[0]).join(" → ") : "Você cria as colunas"}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Cor</span>
            <SeletorCor nome="cor" valor="azul" />
          </div>
          <div className="flex gap-2 pt-1">
            <button className="btn">Criar board</button>
            <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
