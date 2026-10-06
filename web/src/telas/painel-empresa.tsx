// PAINEL DA EMPRESA — as abas «Dashboard» e «Painel» de `G3Solar_Financeiro.xlsx`.
//
// ============================================================================
// POR QUE ESTA TELA EXISTE
//
// Até 02/10/2026 os sócios olhavam as contas a pagar da empresa numa planilha:
// escolhiam ano e mês nas células amarelas e liam seis números, a despesa por
// plano de contas, uma pizza da situação dos títulos e o previsto × realizado
// do ano. A pergunta é a de quem cuida do caixa — «quanto sai este mês, quanto
// já saiu, o que atrasou» —, e esta tela responde a mesma coisa, com os MESMOS
// critérios (todos em `despesas-regras.ts`, que tem suíte): o mês conta pelo
// VENCIMENTO, o vencido é acumulado, «vence em 7 dias» vai de hoje a hoje+7.
//
// O QUE ELA NÃO FAZ: lançar nem dar baixa. Isso é Despesas; aqui só se lê, e
// cada número aponta para onde se age. As duas abas da planilha viraram uma
// tela só porque diziam a mesma coisa duas vezes (o Dashboard lia o Painel).
//
// A PIZZA DA PLANILHA virou uma barra empilhada: três fatias de um total se
// comparam melhor em comprimento do que em ângulo, e a barra cabe no celular.
//
// O MÊS É DESTA TELA, e não o mês de trabalho do Rateio: a planilha tinha o
// próprio seletor, e o mês de trabalho segue as telas do mês (Mês, Contas de
// luz, Cobranças). Abre no mês de hoje — o `hoje` do SERVIDOR.
//
// 06/10/2026 (etapa 1 do controle total) — o que a auditoria da planilha achou:
//   - o mês se DIGITA (as células amarelas da planilha), além das setas, e vai
//     para a URL (`?mes=AAAA-MM`): o link e o F5 abrem no mesmo mês (lacuna 13);
//   - a SITUAÇÃO DOS TÍTULOS da planilha soma a carteira INTEIRA, sem filtro de
//     mês; a tela mostrava só a do mês. Agora mostra as duas (lacuna 2);
//   - IMPRIMIR: a planilha tinha área de impressão no Dashboard (lacuna 15). A
//     folha é o `#documento` — o mesmo caminho de impressão da fatura unificada,
//     que imprime só ele; esta é outra rota, então nunca há dois na tela;
//   - o plano mostra a subcategoria dentro do grupo, e marca o grupo que sai do
//     caixa sem ser despesa (investimento, retirada de sócio).

import { useState, type ReactNode } from 'react';
import { api, type ListaDeDespesas, type CadastrosDaEmpresa } from '../api.ts';
import { useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Kpi, Carregando, BotaoDeIcone, CampoData, Icone, linha } from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { PainelDeSaude } from '../painel-de-saude-tela.tsx';
import { emReais } from '../dinheiro.ts';
import { mesPorExtenso, mesCurtoDoAno } from '../formato.ts';
import {
  mesDe, somarMeses, painelDoMes, situacaoDoMes, situacaoDaCarteira, porPlanoNoMes, anoMesAMes, projetar,
  indicadoresDoPeriodo, devidoAosSocios, mesDaBusca, buscaComMes,
} from '../despesas-regras.ts';

/**
 * O mês guardado na URL (`?mes=`), lido uma vez e reescrito a cada troca com
 * `replaceState` — o link e o F5 ficam certos, e o «voltar» não vira uma lista de
 * meses. É o mesmo comportamento do mês de trabalho do Rateio.
 */
export function useMesDaUrl(): [string | null, (m: string | null) => void] {
  const [mes, setMes] = useState<string | null>(() => (typeof window === 'undefined' ? null : mesDaBusca(window.location.search)));
  const trocar = (m: string | null) => {
    setMes(m);
    try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${buscaComMes(window.location.search, m)}`); } catch { /* sem history: só a tela muda */ }
  };
  return [mes, trocar];
}

/** «Imprimir»: o navegador imprime só o `#documento` da tela (estilo.ts). */
export const BotaoDeImprimir = () => (
  <button type="button" className="discreto naoimprime" onClick={() => window.print()}>
    <Icone nome="imprimir" tamanho={15} /> Imprimir
  </button>
);

// ------------------------------------------------------ o gráfico de colunas
//
// Um componente só para as duas telas (o ano aqui, os 24 meses na Projeção):
// as colunas, duas linhas de grade com o valor, o eixo dos meses e a dica do
// mouse. O desenho de DENTRO de cada coluna (par de barras ou pilha) é de quem
// chama. O gráfico inteiro é `role="img"` com os números no nome acessível, e a
// tabela que vem logo abaixo dele, em cada tela, é o equivalente para o teclado
// e para o leitor de tela.

export type LinhaDaDica = { classe: string; rotulo: string; valor: number };

export function GraficoDeColunas<T>(p: {
  itens: readonly T[];
  rotuloAcessivel: string;
  maximo: number;
  eixo: (t: T) => string;
  tituloDaDica: (t: T) => string;
  dica: (t: T) => LinhaDaDica[];
  desenho: (t: T, altura: (centavos: number) => string) => ReactNode;
  destaque?: (t: T) => boolean;
  /** Muitas colunas (24): no celular o eixo mostra um mês a cada três. */
  denso?: boolean;
  /**
   * Uma LINHA por cima das colunas, com escala própria: um valor de 0 a 1 por
   * coluna (o acumulado da Projeção, que a planilha desenhava no gráfico de 24
   * meses — lacuna 8). Passa pelo meio de cada coluna.
   */
  linha?: readonly number[];
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const n = p.itens.length;
  const max = p.maximo > 0 ? p.maximo : 1;
  const altura = (c: number) => `${Math.max(0, Math.min(100, (c / max) * 100))}%`;
  const colunas = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const emFoco = foco === null ? null : p.itens[foco] ?? null;

  return (
    <div className="grafico">
      <div className="grafico-area" style={colunas} role="img" aria-label={p.rotuloAcessivel}
           onMouseLeave={() => setFoco(null)}>
        {p.maximo > 0 && (
          <>
            <div className="grafico-linha" style={{ bottom: '100%' }} aria-hidden="true">
              <span>{emReais(p.maximo)}</span>
            </div>
            <div className="grafico-linha" style={{ bottom: '50%' }} aria-hidden="true">
              <span>{emReais(Math.round(p.maximo / 2))}</span>
            </div>
          </>
        )}
        {p.itens.map((t, i) => (
          <div key={i} aria-hidden="true"
               className={`coluna${p.destaque?.(t) ? ' no-periodo' : ''}${foco === i ? ' em-foco' : ''}`}
               onMouseEnter={() => setFoco(i)}>
            {p.desenho(t, altura)}
          </div>
        ))}
        {p.linha && p.linha.length === n && (
          <svg className="grafico-curva" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={p.linha.map((v, i) => `${i + 0.5},${100 - Math.max(0, Math.min(1, v)) * 100}`).join(' ')}
                      vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {emFoco && foco !== null && (
          <div className="dica-grafico" aria-hidden="true"
               style={{ left: `clamp(84px, ${((foco + 0.5) / n) * 100}%, calc(100% - 84px))` }}>
            <div className="dica-tit">{p.tituloDaDica(emFoco)}</div>
            {p.dica(emFoco).map((l) => (
              <div key={l.rotulo} className="dica-linha">
                <span className={`amostra ${l.classe}`} />
                <span>{l.rotulo}</span>
                <span>{emReais(l.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`grafico-eixo${p.denso ? ' denso' : ''}`} style={colunas} aria-hidden="true">
        {p.itens.map((t, i) => <span key={i}>{p.eixo(t)}</span>)}
      </div>
    </div>
  );
}

/** Um percentual com uma casa, à brasileira: `10,4%`. Percentual não é dinheiro (regra 1). */
export const pctEmBr = (v: number): string => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** `2026-10` → `out` (o eixo) e `out/26` quando o ano importa. */
const mesCurto = (mes: string): string => mesCurtoDoAno(Number(mes.slice(5, 7)));

// ------------------------------------------------------ a tela

export function TelaPainelDaEmpresa() {
  const carga = useDados<ListaDeDespesas>(() => api.get('/despesas'));
  const cadastros = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const [escolhido, setEscolhido] = useMesDaUrl();

  const dados = carga.dado;
  const hoje = dados?.hoje ?? null;
  const mesDeHoje = hoje ? mesDe(hoje) : null;
  const mes = escolhido ?? mesDeHoje;
  const linhas = dados?.linhas ?? [];
  const categorias = cadastros.dado?.categorias ?? [];
  const ano = mes ? Number(mes.slice(0, 4)) : null;

  const acao = mes && (
    <div className="naoimprime" style={{ ...linha, gap: 6 }}>
      <BotaoDeIcone icone="mes_anterior" rotulo="Mês anterior" ao={() => setEscolhido(somarMeses(mes, -1))} />
      <div className="pe-mes"><CampoData mes valor={mes} rotuloAcessivel="Mês do painel" ao={(v) => { if (v) setEscolhido(v); }} /></div>
      <BotaoDeIcone icone="mes_seguinte" rotulo="Mês seguinte" ao={() => setEscolhido(somarMeses(mes, 1))} />
      {mesDeHoje && mes !== mesDeHoje && (
        <button type="button" className="discreto" onClick={() => setEscolhido(null)}>Voltar para este mês</button>
      )}
      {(dados?.linhas.length ?? 0) > 0 && <BotaoDeImprimir />}
    </div>
  );

  return (
    <Pagina titulo="Painel da empresa" mes={mes ? mesPorExtenso(mes) : null} acao={acao}
            sub="As contas a pagar da empresa no mês: quanto vence, quanto já saiu e o que atrasou.">
      {carga.erro && (
        <Aviso tipo="erro">
          Não foi possível ler as despesas: {carga.erro}. Os números abaixo não estão zerados — estão{' '}
          <strong>desconhecidos</strong>.
        </Aviso>
      )}
      {carga.carregando && <Carregando texto="Somando as despesas…" />}

      {dados && dados.total > linhas.length && (
        <Aviso tipo="alerta">
          A leitura parou em {linhas.length} de {dados.total} despesas. Os números abaixo contam só essas.
        </Aviso>
      )}

      {dados && linhas.length === 0 && (
        <Aviso tipo="alerta" vivo={false}>
          Nenhuma despesa lançada ainda, e por isso o painel está vazio.{' '}
          {cadastros.dado && categorias.length === 0 ? (
            <>Comece pelo <Ligacao para="/plano-de-contas">plano de contas</Ligacao> e depois{' '}
              <Ligacao para="/despesas">lance a primeira despesa</Ligacao>.</>
          ) : (
            <Ligacao para="/despesas">Lançar a primeira despesa</Ligacao>
          )}
        </Aviso>
      )}

      {dados && hoje && mes && ano !== null && linhas.length > 0 && (
        <div id="documento" className="pe-folha">
          <h1 className="so-impressao">Painel da empresa — {mesPorExtenso(mes)}</h1>
          <Conteudo dados={dados} hoje={hoje} mes={mes} ano={ano} categorias={categorias} />
        </div>
      )}

      {/* O PAINEL DE SAÚDE NA PRIMEIRA TELA DE CADA SETOR (03/10/2026, plano de
          22/09 §5): o mesmo do Mês, no Rateio. Fora das condições de cima de
          propósito — «o sistema está de pé?» não depende de as despesas terem
          sido lidas. */}
      <PainelDeSaude />
    </Pagina>
  );
}

function Conteudo({ dados, hoje, mes, ano, categorias }: {
  dados: ListaDeDespesas; hoje: string; mes: string; ano: number;
  categorias: CadastrosDaEmpresa['categorias'];
}) {
  const linhas = dados.linhas;
  const p = painelDoMes(linhas, mes, hoje);
  const situacao = situacaoDoMes(linhas, mes, hoje);
  const carteira = situacaoDaCarteira(linhas, hoje);
  const porPlano = porPlanoNoMes(linhas, mes, categorias);
  const doAno = anoMesAMes(linhas, ano);
  const proximos12 = indicadoresDoPeriodo(projetar(linhas, mesDe(hoje), 12), mesDe(hoje), somarMeses(mesDe(hoje), 11)).proximos_12;
  const devido = devidoAosSocios(linhas);
  const nomeDoMes = mesPorExtenso(mes);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <>
      <div className="kpis kpis-seis">
        <Kpi nome="Previsto no mês" icone="calendario"
             valor={<>{emReais(p.previsto)}<span className="kpi-nota">{plural(p.titulos_do_mes, 'título vence', 'títulos vencem')} em {nomeDoMes}</span></>} />
        <Kpi nome="Pago no mês" icone="confirmar" tom={p.pago ? 'ok' : undefined}
             valor={<>{emReais(p.pago)}
               <span className="kpi-nota">{pctEmBr(p.liquidado_pct)} liquidado
                 <span className="progresso" role="img" aria-label={`${pctEmBr(p.liquidado_pct)} do previsto do mês liquidado`}>
                   <span style={{ width: `${Math.min(100, p.liquidado_pct)}%` }} />
                 </span>
               </span></>} />
        <Kpi nome="Em aberto no mês" icone="a_pagar" valor={emReais(p.em_aberto)} />
        <Kpi nome="Vencido (acumulado)" icone="vencidas" tom={p.vencidos ? 'erro' : undefined}
             valor={<>{emReais(p.vencido_acumulado)}<span className="kpi-nota">
               {p.vencidos ? `${plural(p.vencidos, 'título', 'títulos')}, de qualquer mês` : 'Nada atrasado'}</span></>} />
        <Kpi nome="Vence em 7 dias" icone="calendario" tom={p.vencem_em_7_dias ? 'alerta' : undefined}
             valor={<>{emReais(p.vence_em_7_dias)}<span className="kpi-nota">
               {p.vencem_em_7_dias ? plural(p.vencem_em_7_dias, 'título', 'títulos') : 'Nada nos próximos 7 dias'}</span></>} />
        <Kpi nome="Próximos 12 meses" icone="projecao"
             valor={<>{emReais(proximos12)}<span className="kpi-nota">
               <Ligacao para="/projecao">Lançado e recorrente, na Projeção</Ligacao></span></>} />
      </div>

      {/* A DÍVIDA COM OS SÓCIOS (Q-SOCIOS-01): fica FORA dos seis números — a
          despesa que o sócio pagou já está neles — e aparece aqui, de qualquer
          mês, até a empresa reembolsar. */}
      {devido.total > 0 && (
        <p className="painel-socios">
          <strong>A empresa deve {emReais(devido.total)} aos sócios</strong>
          {' — '}{devido.socios.map((x) => `${x.nome} ${emReais(x.centavos)}`).join(' · ')}.
          {' '}<Ligacao para="/despesas?vista=socios">Reembolsar em Despesas</Ligacao>
        </p>
      )}

      {/* [02/10, revisão visual] A SITUAÇÃO VEM PRIMEIRO e as duas ocupam a
          largura toda: lado a lado, a tabela por plano cortava a coluna «% do
          total» a 1366px, e a barra da situação é uma faixa, não um bloco. */}
      <div className="painel-pilha">
        <section className="cartao">
          <h2>Situação dos títulos</h2>
          <p className="sub">O que já foi liquidado, o que ainda vem e o que atrasou. Juros e descontos ficam no «Pago no mês», acima.</p>
          <div className="pe-situacoes">
            <div>
              <h3>Em {nomeDoMes}</h3>
              <BarraDaSituacao {...situacao} vazio={`Nenhum título vence em ${nomeDoMes}`} />
            </div>
            <div>
              <h3>Na carteira inteira</h3>
              <BarraDaSituacao {...carteira} vazio="Nenhum título lançado" />
              <p className="sub">Todos os títulos, de todos os meses — como a situação da planilha.</p>
            </div>
          </div>
        </section>
        {/*
          POR PLANO DE CONTAS, na ordem do plano (a da planilha). Os itens sem
          despesa no mês ficam de fora — a planilha mostrava as quinze linhas,
          e as zeradas empurravam o que importa para baixo.
        */}
        <section className="cartao">
          <h2>Por plano de contas</h2>
          <p className="sub">Despesas que vencem em {nomeDoMes}, por plano de contas.</p>
          <Tabela cartoes="estreita" vazio={`Nada vence em ${nomeDoMes}.`}
                  cabecalho={<><th>Plano de contas</th><th className="num">Previsto</th><th className="num">Pago</th>
                    <th className="num">Em aberto</th><th className="num">% do total</th></>}>
            {porPlano.linhas.flatMap((l) => [
              <tr key={l.categoria_id ?? 'sem'}>
                <td>{l.nome}{l.fora_do_resultado && <div className="sub">fora do resultado: sai do caixa, não é despesa</div>}</td>
                <td className="num c-val">{emReais(l.previsto)}</td>
                <td className="num">{emReais(l.pago)}</td>
                <td className="num">{emReais(l.em_aberto)}</td>
                <td className="num">
                  <span className="barra-pct">
                    {pctEmBr(l.pct)}
                    <span className="trilho" aria-hidden="true"><span style={{ width: `${Math.min(100, l.pct)}%` }} /></span>
                  </span>
                </td>
              </tr>,
              ...(l.subs ?? []).map((s) => (
                <tr key={s.categoria_id} className="pc-sub">
                  <td>{s.nome}</td>
                  <td className="num">{emReais(s.previsto)}</td>
                  <td className="num">{emReais(s.pago)}</td>
                  <td className="num">{emReais(s.em_aberto)}</td>
                  <td />
                </tr>
              )),
            ])}
            {porPlano.linhas.length > 0 && (
              <tr className="linha-total">
                <td>Total</td>
                <td className="num c-val">{emReais(porPlano.total.previsto)}</td>
                <td className="num">{emReais(porPlano.total.pago)}</td>
                <td className="num">{emReais(porPlano.total.em_aberto)}</td>
                <td className="num">{pctEmBr(porPlano.total.pct)}</td>
              </tr>
            )}
          </Tabela>
        </section>

      </div>

      <section className="cartao secao">
        <h2>Previsto × realizado em {ano}</h2>
        <p className="sub">Por mês de vencimento. O previsto é o valor dos títulos; o pago, o que saiu do banco, com juros e descontos.</p>
        <ul className="legenda">
          <li><span className="amostra previsto" />Previsto</li>
          <li><span className="amostra pago" />Pago</li>
        </ul>
        <GraficoDeColunas
          itens={doAno.meses}
          maximo={Math.max(0, ...doAno.meses.flatMap((m) => [m.previsto, m.pago]))}
          rotuloAcessivel={`Previsto e pago por mês em ${ano}. ${doAno.meses
            .filter((m) => m.previsto || m.pago)
            .map((m) => `${mesPorExtenso(m.mes)}: previsto ${emReais(m.previsto)}, pago ${emReais(m.pago)}`)
            .join('; ') || 'Nenhuma despesa no ano.'}`}
          eixo={(m) => mesCurto(m.mes)}
          tituloDaDica={(m) => mesPorExtenso(m.mes)}
          dica={(m) => [
            { classe: 'previsto', rotulo: 'Previsto', valor: m.previsto },
            { classe: 'pago', rotulo: 'Pago', valor: m.pago },
          ]}
          destaque={(m) => m.mes === mes}
          desenho={(m, altura) => (
            <>
              <span className="barra previsto" style={{ height: altura(m.previsto) }} />
              <span className="barra pago" style={{ height: altura(m.pago) }} />
            </>
          )}
        />
        <Tabela cartoes="estreita"
                cabecalho={<><th>Mês</th><th className="num">Previsto</th><th className="num">Pago</th>
                  <th className="num">Em aberto</th><th className="num">Fixas</th><th className="num">Variáveis</th></>}>
          {doAno.meses.map((m) => (
            <tr key={m.mes} className={m.mes === mes ? 'no-periodo' : undefined}>
              <td>{mesPorExtenso(m.mes)}{m.mes === mes && <span className="marca-periodo">mês do painel</span>}</td>
              <td className="num c-val">{emReais(m.previsto)}</td>
              <td className="num">{emReais(m.pago)}</td>
              <td className="num">{emReais(m.em_aberto)}</td>
              <td className="num">{emReais(m.fixas)}</td>
              <td className="num">{emReais(m.variaveis)}</td>
            </tr>
          ))}
          <tr className="linha-total">
            <td>Total do ano</td>
            <td className="num c-val">{emReais(doAno.total.previsto)}</td>
            <td className="num">{emReais(doAno.total.pago)}</td>
            <td className="num">{emReais(doAno.total.em_aberto)}</td>
            <td className="num">{emReais(doAno.total.fixas)}</td>
            <td className="num">{emReais(doAno.total.variaveis)}</td>
          </tr>
        </Tabela>
        <FixasEVariaveis fixas={doAno.total.fixas} variaveis={doAno.total.variaveis}
                         semTipo={doAno.total.previsto - doAno.total.fixas - doAno.total.variaveis} ano={ano} />
      </section>
    </>
  );
}

/** A PIZZA DA PLANILHA, em barra: pago · a vencer · vencido, com valor e % escritos. */
function BarraDaSituacao({ pago, a_vencer, vencido, vazio = 'Nenhum título no mês' }: {
  pago: number; a_vencer: number; vencido: number; vazio?: string;
}) {
  const total = pago + a_vencer + vencido;
  const partes = [
    { classe: 'st-pago', rotulo: 'Liquidado', valor: pago },
    { classe: 'st-a-vencer', rotulo: 'A vencer', valor: a_vencer },
    { classe: 'st-vencido', rotulo: 'Vencido', valor: vencido },
  ];
  const pct = (v: number) => (total ? Math.round((v * 1000) / total) / 10 : 0);
  return (
    <>
      <div className={`barra-empilhada${total ? '' : ' vazia'}`} role="img"
           aria-label={total ? partes.map((x) => `${x.rotulo}: ${emReais(x.valor)} (${pctEmBr(pct(x.valor))})`).join('; ')
                             : vazio}>
        {partes.filter((x) => x.valor > 0).map((x) => (
          <span key={x.classe} className={`seg ${x.classe}`} style={{ flexGrow: x.valor, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="situacao-lista">
        {partes.map((x) => (
          <li key={x.classe}>
            <span className={`amostra ${x.classe}`} aria-hidden="true" />
            <span>{x.rotulo}</span>
            <strong className="num">{emReais(x.valor)}</strong>
            <span className="pct">{pctEmBr(pct(x.valor))}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** «FIXAS × VARIÁVEIS (ANO)», o segundo gráfico do Dashboard. A despesa lançada sem tipo aparece à parte, em vez de sumir. */
function FixasEVariaveis({ fixas, variaveis, semTipo, ano }: { fixas: number; variaveis: number; semTipo: number; ano: number }) {
  const total = fixas + variaveis + semTipo;
  if (!total) return null;
  const partes = [
    { classe: 'fixas', rotulo: 'Fixas', valor: fixas },
    { classe: 'variaveis', rotulo: 'Variáveis', valor: variaveis },
    { classe: 'sem-tipo', rotulo: 'Sem tipo', valor: semTipo },
  ].filter((x) => x.valor > 0);
  const pct = (v: number) => Math.round((v * 1000) / total) / 10;
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ margin: '0 0 8px' }}>Fixas × variáveis em {ano}</h3>
      <div className="barra-empilhada" role="img"
           aria-label={partes.map((x) => `${x.rotulo}: ${emReais(x.valor)} (${pctEmBr(pct(x.valor))})`).join('; ')}>
        {partes.map((x) => (
          <span key={x.rotulo} className={`seg ${x.classe}`} style={{ flexGrow: x.valor, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="legenda">
        {partes.map((x) => (
          <li key={x.rotulo}><span className={`amostra ${x.classe}`} />{x.rotulo} <strong>{emReais(x.valor)}</strong> · {pctEmBr(pct(x.valor))}</li>
        ))}
      </ul>
    </div>
  );
}
