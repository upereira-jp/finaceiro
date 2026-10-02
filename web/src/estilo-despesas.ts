// O ESTILO DAS TELAS DESPESAS E PLANO DE CONTAS (a planilha da empresa, 02/10/2026).
//
// Só variáveis do tema (`tema.ts`) — as cores trocam sozinhas no escuro — e os
// cantos retos do g3ref. Mora fora do `estilo.ts` para as duas telas novas não
// disputarem o mesmo arquivo de 3.000 linhas; entra no `ESTILO` pelo fim dele.

export const ESTILO_DESPESAS = `
  /* -------- Despesas: os atalhos do alto. Um clique filtra; outro solta. */
  .dp-atalhos {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: var(--gap); margin-bottom: var(--gap-secao);
  }
  .dp-atalho {
    display: grid; gap: 2px; text-align: left; justify-items: start; justify-content: start; padding: 12px 14px;
    font: inherit; letter-spacing: 0; text-transform: none;
    background: var(--fundo2); border: 1px solid var(--borda); border-radius: 0;
    color: var(--texto); cursor: pointer;
  }
  .dp-atalho:hover { background: var(--fundo-hover); }
  .dp-atalho[aria-pressed="true"] { border-color: var(--texto); border-bottom: 3px solid var(--acento); padding-bottom: 10px; }
  .dp-atalho-nome { font-size: var(--t-meta); color: var(--fraco); }
  .dp-atalho-valor { font-size: var(--t-h2); font-weight: 700; font-variant-numeric: tabular-nums; }
  .dp-atalho-conta { font-size: var(--t-meta); color: var(--fraco); }
  .dp-vencidas .dp-atalho-valor { color: var(--erro); }

  /* -------- a lista */
  button.dp-nome, button.pc-nome {
    font: inherit; font-weight: 600; letter-spacing: 0; text-transform: none;
    color: var(--texto); padding: 0; min-height: 0; text-align: left;
  }
  button.pc-nome { font-weight: 400; }
  .dp-nome:hover { text-decoration: underline; text-underline-offset: 3px; }
  td .sub { margin: 2px 0 0; font-size: var(--t-meta); }
  .dp-prazo-vencida { color: var(--erro); }
  .dp-cancelada td { color: var(--fraco); }
  .dp-cancelada .dp-nome { text-decoration: line-through; color: var(--fraco); }
  .dp-acoes { white-space: nowrap; text-align: right; }
  .dp-acoes > * { display: inline-flex; vertical-align: middle; }
  .dp-acoes > * + * { margin-left: 6px; }
  .dp-extra > td { background: var(--fundo-recuo); padding: 16px 18px; }

  /* -------- o detalhe da linha */
  .dp-detalhe dl {
    display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 12px;
  }
  .dp-detalhe dt { color: var(--fraco); font-size: var(--t-meta); }
  .dp-detalhe dd { margin: 0; }
  .dp-pagamentos { width: 100%; border-collapse: collapse; font-size: var(--t-meta); }
  .dp-pagamentos caption { text-align: left; font-weight: 600; padding-bottom: 6px; }
  .dp-pagamentos th, .dp-pagamentos td { padding: 4px 8px; border-bottom: 1px solid var(--borda-suave); }

  /* -------- os formulários (baixa, próximo, fim, nova despesa) */
  .dp-form h3 { margin: 0 0 6px; font-size: var(--t-h3); }
  .dp-form .sub, .dp-nova .sub { margin: 0 0 10px; }
  .dp-campos {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--gap); margin-bottom: var(--gap);
  }
  .dp-nova fieldset { border: 0; border-top: 1px solid var(--borda-suave); margin: 0 0 8px; padding: 12px 0 0; }
  .dp-nova legend { font-weight: 600; padding: 0 8px 0 0; color: var(--texto); }

  /* -------- Plano de contas */
  .pc-colunas {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: var(--gap-secao); align-items: start; margin-bottom: var(--gap-secao);
  }
  .pc-lista h2, .pc-vazio h2, .pc-fixas h2 { margin-top: 0; }
  .pc-ordem { white-space: nowrap; }
  .pc-lista td .campo-caixa { min-width: 190px; }
  .pc-nome:hover { text-decoration: underline; text-underline-offset: 3px; }
  .pc-desativada td { color: var(--fraco); }
  .pc-novo { display: flex; flex-wrap: wrap; gap: var(--gap); align-items: flex-end; margin-top: var(--gap); }
  .pc-novo .campo { flex: 1 1 200px; margin: 0; }
  .pc-fixas dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
  .pc-fixas dt { color: var(--fraco); }
  .pc-fixas dd { margin: 0; }

  @media (max-width: 640px) {
    .dp-acoes { text-align: left; }
    .dp-detalhe dl, .pc-fixas dl { grid-template-columns: 1fr; }
  }
`;
