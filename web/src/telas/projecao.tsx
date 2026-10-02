// PROJEÇÃO DE GASTOS — a aba «Projeção» de `G3Solar_Financeiro.xlsx`.
//
// ============================================================================
// POR QUE ESTA TELA EXISTE
//
// A planilha respondia «quanto a empresa vai gastar nos próximos meses?» em 24
// linhas: o que já está lançado em cada mês mais o que as contas recorrentes
// vão repetir, com o acumulado, um período de análise (de, até) e o total por
// plano de contas. Esta tela é a mesma conta — `projetar()` em
// `despesas-regras.ts`, com suíte —, com uma diferença a favor da exatidão: a
// série de uma conta recorrente é um id, e não o texto do histórico (na
// planilha, uma vírgula a mais no histórico quebrava a recorrência sem aviso).
//
// DE ONDE VEM CADA NÚMERO, e a tela diz:
//   - LANÇADO é todo título vivo que vence no mês, pago ou não;
//   - PROJETADO é a repetição do ÚLTIMO título de cada série mensal,
//     trimestral, semestral ou anual, até o «recorrente até»; avulsa e
//     parcelada não projetam (a parcelada já tem cada parcela lançada).
// A lista «De onde vem o projetado» no pé existe para nenhum número aparecer
// sem origem: cada série que projeta está ali, com o valor que ela repete.
//
// O QUE ELA NÃO FAZ: lançar. «Lançar o próximo» de uma série mora em Despesas.

import { useState } from 'react';
import { api, type ListaDeDespesas, type CadastrosDaEmpresa } from '../api.ts';
import { useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Kpi, Carregando, BotaoDeIcone, Escolha, linha } from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { emReais } from '../dinheiro.ts';
import { mesPorExtenso, mesAbreviado, mesCurtoDoAno, diaEmBr } from '../formato.ts';
import {
  mesDe, somarMeses, mesesEntre, dia, projetar, indicadoresDoPeriodo, projecaoPorPlano, seriesQueProjetam,
  ROTULO_DA_RECORRENCIA,
} from '../despesas-regras.ts';
import { GraficoDeColunas } from './painel-empresa.tsx';

/** Os 24 meses da planilha. */
const HORIZONTE = 24;
/** O período padrão: o mês de início e os cinco seguintes — o da planilha (10/2026 a 03/2027). */
const PERIODO_PADRAO = 6;

export function TelaProjecao() {
  const carga = useDados<ListaDeDespesas>(() => api.get('/despesas'));
  const cadastros = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const [inicioEscolhido, setInicio] = useState<string | null>(null);
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);

  const dados = carga.dado;
  const hoje = dados?.hoje ?? null;
  const mesDeHoje = hoje ? mesDe(hoje) : null;
  const inicio = inicioEscolhido ?? mesDeHoje;

  /* Trocar o início devolve o período ao padrão: um «de» que ficou fora dos 24
     meses novos mostraria um período vazio sem dizer por quê. */
  const mudarInicio = (novo: string | null) => { setInicio(novo); setDe(null); setAte(null); };

  const acao = inicio && (
    <div style={{ ...linha, gap: 6 }}>
      <BotaoDeIcone icone="mes_anterior" rotulo="Começar um mês antes" ao={() => mudarInicio(somarMeses(inicio, -1))} />
      <BotaoDeIcone icone="mes_seguinte" rotulo="Começar um mês depois" ao={() => mudarInicio(somarMeses(inicio, 1))} />
      {mesDeHoje && inicio !== mesDeHoje && (
        <button type="button" className="discreto" onClick={() => mudarInicio(null)}>Começar neste mês</button>
      )}
    </div>
  );

  return (
    <Pagina titulo="Projeção de gastos" acao={acao}
            sub={inicio
              ? `Os próximos 24 meses a partir de ${mesPorExtenso(inicio)}: o que já está lançado e o que as despesas recorrentes vão repetir.`
              : 'Os próximos 24 meses: o que já está lançado e o que as despesas recorrentes vão repetir.'}>
      {carga.erro && (
        <Aviso tipo="erro">
          Não foi possível ler as despesas: {carga.erro}. Os números abaixo não estão zerados — estão{' '}
          <strong>desconhecidos</strong>.
        </Aviso>
      )}
      {carga.carregando && <Carregando texto="Projetando os próximos meses…" />}

      {dados && dados.total > dados.linhas.length && (
        <Aviso tipo="alerta">
          A leitura parou em {dados.linhas.length} de {dados.total} despesas. A projeção conta só essas.
        </Aviso>
      )}

      {dados && dados.linhas.length === 0 && (
        <Aviso tipo="alerta" vivo={false}>
          Nenhuma despesa lançada ainda, e por isso não há o que projetar.{' '}
          <Ligacao para="/despesas">Lançar a primeira despesa</Ligacao>
        </Aviso>
      )}

      {dados && inicio && dados.linhas.length > 0 && (
        <Conteudo dados={dados} inicio={inicio} de={de} ate={ate} setDe={setDe} setAte={setAte}
                  categorias={cadastros.dado?.categorias ?? []} />
      )}
    </Pagina>
  );
}

function Conteudo(p: {
  dados: ListaDeDespesas; inicio: string;
  de: string | null; ate: string | null;
  setDe: (v: string | null) => void; setAte: (v: string | null) => void;
  categorias: CadastrosDaEmpresa['categorias'];
}) {
  const { dados, inicio } = p;
  const proj = projetar(dados.linhas, inicio, HORIZONTE);
  const fim = somarMeses(inicio, HORIZONTE - 1);
  const dentro = (m: string | null): m is string => m !== null && m >= inicio && m <= fim;

  /* O PERÍODO SEMPRE VÁLIDO: dentro dos 24 meses e com o «de» antes do «até».
     Escolher um «de» depois do «até» leva o «até» junto, em vez de mostrar um
     período de zero meses. */
  const de = dentro(p.de) ? p.de : inicio;
  const ateBruto = dentro(p.ate) ? p.ate : somarMeses(inicio, PERIODO_PADRAO - 1);
  const ate = ateBruto < de ? de : ateBruto;
  const noPeriodo = (m: string) => m >= de && m <= ate;

  const ind = indicadoresDoPeriodo(proj, de, ate);
  const porPlano = projecaoPorPlano(proj, de, ate, p.categorias);
  const series = seriesQueProjetam(dados.linhas);
  const opcoes = proj.meses.map((m) => ({ valor: m.mes, texto: mesAbreviado(m.mes) }));
  const nomeDoPeriodo = de === ate ? mesPorExtenso(de) : `${mesAbreviado(de)} a ${mesAbreviado(ate)}`;
  const maximo = Math.max(0, ...proj.meses.map((m) => m.total));

  return (
    <>
      <div className="escolha-de-periodo">
        <span className="rot-alta">Período de análise</span>
        <label htmlFor="projecao-de">de</label>
        <Escolha id="projecao-de" valor={de} opcoes={opcoes}
                 ao={(v) => { p.setDe(v); if (v > ate) p.setAte(v); }} />
        <label htmlFor="projecao-ate">até</label>
        <Escolha id="projecao-ate" valor={ate} opcoes={opcoes.filter((o) => o.valor >= de)}
                 ao={(v) => p.setAte(v)} />
        <span className="sub" style={{ margin: 0 }}>
          {mesesEntre(de, ate) + 1} {mesesEntre(de, ate) === 0 ? 'mês' : 'meses'}
        </span>
      </div>

      <div className="kpis">
        <Kpi nome="Próximos 12 meses" icone="calendario" valor={emReais(ind.proximos_12)} />
        <Kpi nome="Próximos 24 meses" icone="calendario" valor={emReais(ind.proximos_24)} />
        <Kpi nome="Total no período" icone="projecao"
             valor={<>{emReais(ind.total)}<span className="kpi-nota">{nomeDoPeriodo}</span></>} />
        <Kpi nome="Média mensal no período" icone="projecao" valor={emReais(ind.media)} />
        <Kpi nome="Maior mês no período" icone="relatorios"
             valor={<>{emReais(ind.maior?.total ?? 0)}<span className="kpi-nota">
               {ind.maior && ind.maior.total > 0 ? mesPorExtenso(ind.maior.mes) : 'Nenhum gasto no período'}</span></>} />
      </div>

      <section className="cartao secao">
        <h2>Mês a mês</h2>
        <p className="sub">O realce marca o período de análise. Passe o mouse numa coluna para ver os números do mês.</p>
        <ul className="legenda">
          <li><span className="amostra lancado" />Lançado</li>
          <li><span className="amostra projetado" />Projetado (repetição das recorrentes)</li>
        </ul>
        <GraficoDeColunas
          itens={proj.meses}
          maximo={maximo}
          denso
          rotuloAcessivel={`Gastos por mês, de ${mesPorExtenso(inicio)} a ${mesPorExtenso(fim)}. `
            + `Total em 24 meses ${emReais(ind.proximos_24)}; maior mês ${emReais(maximo)}. A tabela abaixo traz cada mês.`}
          eixo={(m) => (m.mes.endsWith('-01') ? `${mesCurtoDoAno(1)}/${m.mes.slice(2, 4)}` : mesCurtoDoAno(Number(m.mes.slice(5, 7))))}
          tituloDaDica={(m) => mesPorExtenso(m.mes)}
          dica={(m) => [
            { classe: 'lancado', rotulo: 'Lançado', valor: m.lancado },
            { classe: 'projetado', rotulo: 'Projetado', valor: m.projetado },
          ]}
          destaque={(m) => noPeriodo(m.mes)}
          desenho={(m, altura) => (
            <span className="pilha" style={{ height: altura(m.total) }}>
              {m.lancado > 0 && <span className="seg lancado" style={{ flexGrow: m.lancado, flexBasis: 0 }} />}
              {m.projetado > 0 && <span className="seg projetado" style={{ flexGrow: m.projetado, flexBasis: 0 }} />}
            </span>
          )}
        />
        <Tabela cartoes="estreita"
                cabecalho={<><th>Mês</th><th className="num">Lançado</th><th className="num">Projetado</th>
                  <th className="num">Total</th><th className="num">Acumulado</th></>}>
          {proj.meses.map((m) => (
            <tr key={m.mes} className={noPeriodo(m.mes) ? 'no-periodo' : undefined}>
              <td>{mesPorExtenso(m.mes)}{noPeriodo(m.mes) && <span className="marca-periodo">no período</span>}</td>
              <td className="num">{emReais(m.lancado)}</td>
              <td className="num">{emReais(m.projetado)}</td>
              <td className="num c-val">{emReais(m.total)}</td>
              <td className="num">{emReais(m.acumulado)}</td>
            </tr>
          ))}
          <tr className="linha-total">
            <td>Total em 24 meses</td>
            <td className="num">{emReais(proj.meses.reduce((s, m) => s + m.lancado, 0))}</td>
            <td className="num">{emReais(proj.meses.reduce((s, m) => s + m.projetado, 0))}</td>
            <td className="num c-val">{emReais(ind.proximos_24)}</td>
            <td className="num" />
          </tr>
        </Tabela>
      </section>

      <div className="duas-colunas">
        <section className="cartao">
          <h2>Por plano de contas no período</h2>
          <p className="sub">Lançado e projetado de {nomeDoPeriodo}, na ordem do plano de contas.</p>
          <Tabela cartoes="estreita" vazio="Nenhum gasto no período."
                  cabecalho={<><th>Plano de contas</th><th className="num">No período</th></>}>
            {porPlano.linhas.map((l) => (
              <tr key={l.categoria_id ?? 'sem'}>
                <td>{l.nome}</td>
                <td className="num c-val">{emReais(l.total)}</td>
              </tr>
            ))}
            {porPlano.linhas.length > 0 && (
              <tr className="linha-total">
                <td>Total projetado</td>
                <td className="num c-val">{emReais(porPlano.total)}</td>
              </tr>
            )}
          </Tabela>
        </section>

        {/*
          DE ONDE VEM O PROJETADO. Sem esta lista, a coluna laranja seria um
          número sem origem — e a planilha também não dizia qual conta estava
          repetindo. Cada série aparece pelo seu molde (o último título), com o
          valor que ela repete e o próximo vencimento ainda não lançado.
        */}
        <section className="cartao">
          <h2>De onde vem o projetado</h2>
          <p className="sub">Cada despesa recorrente repete o valor do último título lançado.</p>
          <Tabela cartoes="estreita"
                  vazio={<>Nenhuma despesa recorrente. Só despesas mensais, trimestrais, semestrais ou anuais projetam;
                    avulsa e parcelada, não. <Ligacao para="/despesas">Abrir Despesas</Ligacao></>}
                  cabecalho={<><th>Despesa</th><th className="num">Repete</th><th>Próximo</th></>}>
            {series.map((s) => (
              <tr key={s.serie_id}>
                <td>
                  <strong>{s.molde.descricao}</strong>
                  <div className="uc-meta">
                    {[s.molde.beneficiario_nome, ROTULO_DA_RECORRENCIA[s.molde.recorrencia!]].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="num c-val">{emReais(s.molde.valor_centavos)}</td>
                <td>
                  {s.proximo_vencimento ? diaEmBr(s.proximo_vencimento) : 'Terminou'}
                  {s.molde.recorrente_ate && (
                    <div className="uc-meta">até {mesPorExtenso(dia(s.molde.recorrente_ate))}</div>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        </section>
      </div>
    </>
  );
}
