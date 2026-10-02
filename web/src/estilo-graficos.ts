// OS GRÁFICOS DO SETOR EMPRESA — Painel da empresa e Projeção de gastos
// (02/10/2026, a planilha `G3Solar_Financeiro.xlsx` dentro do sistema).
//
// São os PRIMEIROS gráficos do sistema, e por isso a gramática fica escrita
// aqui, num lugar só:
//
//   - Barras em CSS, sem biblioteca: são quatro formas (barra empilhada,
//     pares de colunas, colunas empilhadas, barra de proporção numa célula), e
//     uma biblioteca de gráficos seria um segundo sistema de cor e de fonte.
//   - CANTOS RETOS, como todo o g3ref (`DESIGN.md`). A ponta arredondada de 4px
//     da skill de dataviz perde para a identidade da casa.
//   - SÓ VARIÁVEIS DO TEMA (`tema.ts`): o escuro troca as cores sozinho, pelo
//     mesmo `data-tema` de todo o resto.
//   - AS CORES PELO PAPEL, nunca pela posição:
//       previsto   vazado (recuo + contorno forte) — é a referência, não um fato;
//       pago       --acento, cheio — o que de fato saiu;
//       lançado    --texto (o navy; creme no escuro) — o que está na planilha;
//       projetado  --acento em HACHURA — estimativa, e a textura diz isso sem
//                  depender da cor (daltonismo, impressão, cores forçadas);
//       situação   --ok · --fraco · --erro, sempre com rótulo e valor ao lado.
//     O validador da skill reprova navy e laranja como paleta CATEGÓRICA
//     (luminosidade fora da faixa; laranja com 2,69:1 sobre o branco). Eles são
//     a marca e ficam — e a compensação é a que a própria skill exige: legenda
//     sempre, valor escrito ao lado ou na tabela que acompanha cada gráfico, e a
//     hachura no projetado.
//   - 2px de folga entre segmentos e entre barras vizinhas, para dois tons
//     parecidos nunca se fundirem.
//   - A dica do mouse é o único elemento que FLUTUA, e é o único com sombra (o
//     degrau 3 de `SOMBRAS`, o que o g3ref reserva ao que está por cima).

export const ESTILO_GRAFICOS = `
  .duas-colunas {
    display: grid; gap: var(--gap); margin-bottom: var(--gap-secao);
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start;
  }
  .duas-colunas > .cartao { margin: 0; min-width: 0; }
  @media (max-width: 900px) { .duas-colunas { grid-template-columns: minmax(0, 1fr); } }

  .cartao > h2:first-child { margin-top: 0; }

  /* ---------------------------------------------------------------- legenda */
  .legenda {
    display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 0 12px; padding: 0;
    list-style: none; color: var(--fraco); font-size: var(--t-meta);
  }
  .legenda li { display: inline-flex; align-items: center; gap: 6px; }
  .legenda strong { color: var(--texto); font-weight: 600; }
  .amostra { display: inline-block; width: 12px; height: 12px; flex: none; }
  .amostra.previsto  { background: var(--fundo-recuo); border: 1px solid var(--borda-forte); box-sizing: border-box; }
  .amostra.pago      { background: var(--acento); }
  .amostra.lancado   { background: var(--texto); }
  .amostra.projetado, .seg.projetado {
    background: repeating-linear-gradient(135deg, var(--acento) 0 3px, var(--acento-suave) 3px 6px);
    border: 1px solid var(--acento); box-sizing: border-box;
  }
  .amostra.fixas, .seg.fixas         { background: var(--texto); }
  .amostra.variaveis, .seg.variaveis { background: var(--acento); }
  .amostra.sem-tipo, .seg.sem-tipo   { background: var(--fundo-recuo); border: 1px solid var(--borda-forte); box-sizing: border-box; }
  .amostra.st-pago, .seg.st-pago           { background: var(--ok); }
  .amostra.st-a-vencer, .seg.st-a-vencer   { background: var(--fraco); }
  .amostra.st-vencido, .seg.st-vencido     { background: var(--erro); }

  /* ------------------------------------------------ a barra empilhada (situação) */
  .barra-empilhada { display: flex; gap: 2px; height: 22px; margin: 4px 0 14px; }
  .barra-empilhada .seg { min-width: 3px; height: 100%; }
  .barra-empilhada.vazia { background: var(--fundo-recuo); }
  .situacao-lista { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .situacao-lista li {
    display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center;
    padding-bottom: 8px; border-bottom: 1px solid var(--borda-suave);
  }
  .situacao-lista li:last-child { border-bottom: 0; padding-bottom: 0; }
  .situacao-lista .pct { color: var(--fraco); font-size: var(--t-meta); min-width: 4.5ch; text-align: right; }

  /* ------------------------------------------------ colunas (o ano, os 24 meses) */
  .grafico { position: relative; margin: 4px 0 16px; }
  .grafico-area {
    position: relative; display: grid; align-items: end; gap: 2px;
    height: 190px; padding-top: 18px; border-bottom: 1px solid var(--borda-forte);
  }
  .grafico-linha {
    position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed var(--borda);
    pointer-events: none;
  }
  .grafico-linha > span {
    position: absolute; right: 0; bottom: 2px; font-size: var(--t-rotulo); color: var(--fraco);
    background: var(--fundo2); padding: 0 3px; z-index: 1;
    background: var(--fundo2); padding-left: 4px;
  }
  .coluna { position: relative; height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
  .coluna.no-periodo { background: var(--fundo-recuo); }
  .coluna.em-foco { background: var(--fundo-hover); }
  .coluna .barra { width: 42%; max-width: 22px; min-height: 0; }
  .coluna .barra.previsto { background: var(--fundo-recuo); border: 1px solid var(--borda-forte); box-sizing: border-box; }
  .coluna .barra.pago     { background: var(--acento); }
  .coluna .pilha { width: 72%; max-width: 26px; height: 100%; display: flex; flex-direction: column-reverse; gap: 2px; }
  .coluna .pilha .seg { width: 100%; }
  .coluna .pilha .seg.lancado { background: var(--texto); }
  .grafico-eixo {
    display: grid; gap: 2px; margin-top: 6px; font-size: var(--t-rotulo); color: var(--fraco);
    text-align: center; white-space: nowrap;
  }
  .grafico-eixo > span { overflow: hidden; text-overflow: clip; }
  @media (max-width: 700px) {
    .grafico-eixo.denso > span:not(:nth-child(3n+1)) { visibility: hidden; }
    .grafico-area { height: 160px; }
  }

  /* A DICA DO MOUSE: o mês e os números da coluna sob o ponteiro. O que ela diz
     está também na tabela logo abaixo — é atalho do olho, não a única fonte. */
  .dica-grafico {
    position: absolute; top: 0; z-index: 2; transform: translateX(-50%);
    min-width: 168px; padding: 8px 10px; pointer-events: none;
    background: var(--fundo2); color: var(--texto); border: 1px solid var(--borda-forte);
    /* sem sombra: o g3ref e plano, e a borda forte basta para descolar a dica */
    font-size: var(--t-meta); line-height: 1.4;
  }
  .dica-grafico .dica-tit { font-weight: 600; margin-bottom: 4px; }
  .dica-grafico .dica-linha { display: flex; align-items: center; gap: 6px; }
  .dica-grafico .dica-linha > span:last-child { margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }

  /* ------------------------------------------------ a proporção dentro da célula */
  .barra-pct { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; width: 100%; }
  .barra-pct .trilho { flex: none; width: 56px; height: 6px; background: var(--fundo-recuo); }
  .barra-pct .trilho > span { display: block; height: 100%; background: var(--acento); }
  .tabela-cartoes td .barra-pct { justify-content: flex-start; }

  /* ------------------------------------------------ o cartão de indicador com nota */
  .kpi .valor .kpi-nota {
    display: block; margin-top: 6px; font-family: var(--fonte); font-size: var(--t-meta);
    font-weight: 400; line-height: 1.35; color: var(--fraco);
  }
  .kpi .valor .kpi-nota a { color: inherit; }
  .progresso { display: block; height: 4px; margin-top: 8px; background: var(--fundo-recuo); }
  .progresso > span { display: block; height: 100%; background: var(--ok); }

  /* ------------------------------------------------ linhas de total e de período */
  tr.linha-total > td { font-weight: 650; border-top: 1px solid var(--borda-forte); }
  tr.no-periodo > td { background: var(--fundo-recuo); }
  .marca-periodo { margin-left: 6px; font-size: var(--t-rotulo); color: var(--fraco); white-space: nowrap; }

  .escolha-de-periodo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 0 16px; }
  .escolha-de-periodo label { color: var(--fraco); font-size: var(--t-meta); }

  /* [02/10, revisão visual] Os seis indicadores do Painel em 3 × 2: no
     auto-fit, a 1366px eles caíam em 5 + 1 e o «Próximos 12 meses» ficava
     sozinho numa linha. */
  .kpis.kpis-seis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 560px) { .kpis.kpis-seis { grid-template-columns: minmax(0, 1fr); } }
  .painel-pilha { display: grid; gap: var(--gap); margin-bottom: var(--gap-secao); }
  .painel-pilha > .cartao { margin: 0; min-width: 0; }
`;
