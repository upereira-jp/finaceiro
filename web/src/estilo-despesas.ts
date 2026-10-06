// O ESTILO DAS TELAS DESPESAS, PLANO DE CONTAS, FORNECEDORES E DOS ACRÉSCIMOS DE
// PAINEL E PROJEÇÃO (a planilha da empresa, 02/10/2026; o chão, 06/10/2026).
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
  .dp-aviso-socio { color: var(--texto); }

  /* -------- Painel: a dívida com os sócios, fora dos seis números */
  .painel-socios {
    margin: 0 0 var(--gap-secao); padding: 12px 16px; background: var(--fundo2);
    border: 1px solid var(--borda); font-size: var(--t-corpo);
  }

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

  /* ==================================================================
     06/10/2026 — etapa 1 do controle total (migration 44)
     ================================================================== */

  /* -------- Despesas: o nº, o clipe, os filtros, o fornecedor */
  .dp-numero { color: var(--fraco); font-size: var(--t-meta); }
  .dp-clipe { display: inline-flex; align-items: center; gap: 3px; margin-left: 8px; color: var(--fraco); }
  .dp-filtros {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--gap);
    align-items: end; margin: 0 0 var(--gap-secao); padding: 14px 16px;
    background: var(--fundo2); border: 1px solid var(--borda);
  }
  .dp-filtros .campo { margin: 0; }
  .dp-limpar { justify-self: start; align-self: end; }
  .dp-fornecedor input { width: 100%; }
  .dp-fornecedor-nota { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 4px 0 0; }
  .dp-fornecedor-nota button { padding: 0; min-height: 0; color: var(--acento-texto); }
  .dp-fornecedor-nota svg { color: var(--ok); }

  /* -------- o comprovante: a lista e o «anexar» (o input fica escondido, mas
     focável: o foco aparece no rótulo que o desenha) */
  .dp-anexos { margin: 0 0 14px; }
  .dp-anexos h4 { margin: 0 0 6px; font-size: var(--t-corpo); font-weight: 600; }
  .dp-anexos ul { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
  .dp-anexos li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .dp-anexos li > svg { color: var(--fraco); }
  .dp-anexos li .sub { margin: 0; }
  .dp-enviar {
    position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 14px;
    border: 1px dashed var(--borda-forte); background: var(--fundo2); color: var(--texto);
    font-size: var(--t-ui); cursor: pointer;
  }
  .dp-enviar:hover { border-color: var(--texto); }
  .dp-enviar:focus-within { outline: 2px solid var(--foco); outline-offset: 2px; }
  .dp-enviar.ocupado { cursor: progress; color: var(--fraco); }
  .dp-enviar input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }

  /* -------- a baixa desfeita: continua na lista, riscada, com o motivo */
  .dp-desfeita td { color: var(--fraco); }
  .dp-desfeita td.num { text-decoration: line-through; }

  /* -------- Plano de contas: o segundo nível, os centros, as origens */
  .pc-pilha { display: grid; gap: var(--gap-secao); align-content: start; margin-bottom: var(--gap-secao); }
  .pc-lista .pc-sub td:nth-child(2) { padding-left: 30px; }
  .pc-lista .pc-sub .pc-nome { font-size: var(--t-ui); }
  .pc-grupo .pc-nome { font-weight: 600; }
  .pc-acrescentar { margin-left: 10px; font-size: var(--t-meta); color: var(--acento-texto); }
  .pc-novo-sub { margin: 0; }
  .pc-sugeridas {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap);
    margin-top: var(--gap-secao); padding-top: var(--gap); border-top: 1px solid var(--borda-suave);
  }
  .pc-sugeridas .sub { flex: 1 1 320px; margin: 0; }
  .pc-origem-form { display: grid; gap: 8px; }
  .pc-origem-form .campo { margin: 0; }

  /* -------- Painel: a subcategoria dentro do grupo, as duas situações */
  .painel-pilha .pc-sub td:first-child { padding-left: 30px; color: var(--fraco); }
  .pe-situacoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--gap-secao); }
  .pe-situacoes h3 { margin: 0 0 8px; font-size: var(--t-h3); }
  .pe-situacoes .sub { margin: 6px 0 0; }
  .pe-mes .campo-caixa, .pe-mes input { width: 158px; }

  /* -------- Projeção: a linha do acumulado e a matriz */
  .grafico-curva {
    position: absolute; left: 0; right: 0; top: 18px; bottom: 0; width: 100%; height: calc(100% - 18px);
    overflow: visible; pointer-events: none;
  }
  .grafico-curva polyline { fill: none; stroke: var(--texto); stroke-width: 2; stroke-linejoin: round; }
  .amostra.acumulado { height: 0; border-top: 2px solid var(--texto); background: none; }
  .pj-matriz th.num, .pj-matriz td.num { white-space: nowrap; }
  .pj-matriz td:first-child { min-width: 190px; }
  .dp-serie { white-space: nowrap; }

  /* -------- o que só aparece no papel (Painel e Projeção imprimem o #documento) */
  .so-impressao { display: none; }
  @media print {
    #documento .so-impressao { display: block; margin: 0 0 12px; font-size: 18pt; }
    #documento.pe-folha .cartao { break-inside: avoid; page-break-inside: avoid; }
  }

  @media (max-width: 640px) {
    .dp-acoes { text-align: left; }
    .dp-detalhe dl, .pc-fixas dl { grid-template-columns: 1fr; }
    .pe-mes .campo-caixa, .pe-mes input { width: 132px; }
  }
`;
