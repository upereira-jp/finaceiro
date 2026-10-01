// O LOTE DO MES NA TELA — a fila, as contas registradas e a gaveta de uma conta.
// O que a Fatura unificada DESENHA na aba «1 · Leitura e cálculo»; o que ela
// BUSCA e GRAVA continua em `telas/fatura-unificada.tsx`.
//
// ============================================================================
// POR QUE ISTO SAIU DA TELA EM 30/09/2026 (etapa 1 do redesenho)
//
// A aba 1 era o porte de uma ferramenta de fatura AVULSA — um formulario de
// vinte campos na coluna larga e o lote espremido numa coluna de 380px ao lado.
// Medido no espelho com 7 contas na fila e 59 registradas: a tabela da fila
// tinha 754px e mostrava 332 (Situacao e as acoes so com rolagem lateral), o
// formulario vazio e o painel navy de UMA fatura eram o maior peso da tela, e as
// registradas davam 7.024px de pagina com dois meses misturados.
//
// O DESENHO NOVO poe o trabalho do mes em largura total — a fila, depois as
// registradas — e a conta aberta numa GAVETA por cima. Estes componentes
// recebem tudo por propriedade e nao tem efeito de rede, pelo mesmo motivo de
// `ajuda-corpo.tsx`: o que nao busca nada pode ser montado num teste
// (`web/tests/caso-render.tsx`), e o que nao e montado num teste e promessa.
//
// ============================================================================
// AS DECISOES QUE VALEM PARA OS TRES
//
//   UM PRIMARIO POR VEZ, e ele segue o passo do mes. Com conta conferida na
//   fila, o laranja e «Registrar N contas conferidas»; sem nada a registrar, ele
//   passa para «Gerar N cobrancas». Os dois laranjas ao mesmo tempo seriam duas
//   instrucoes — que e a mesma coisa que nenhuma (regra 1 do roteiro do mes).
//
//   SITUACAO E ACAO NUNCA SAEM DA TELA. Abaixo de 720px as duas tabelas viram
//   cartoes (CSS em `estilo.ts`, secao da Fatura unificada), e o mesmo HTML
//   serve os dois: cada celula carrega o proprio rotulo em `data-rotulo`.
//
//   «UC» NAO APARECE ESCRITO. A suite de vocabulario das telas recusa a sigla;
//   a tela diz «unidade».

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RegistroDeFatura } from './api.ts';
import { Aviso, BotaoDeIcone, Filtro, Icone, Interruptor, Marca, Tabela } from './ui.tsx';
import { Ligacao } from './rota.tsx';
import { emReais } from './dinheiro.ts';
import { numeroDaUcNaTela } from './formato.ts';
import { ItemDaSerie, PerguntaNaTela, RevisaoEmSerie } from './serie.tsx';
import {
  competenciaDoItem, pendenciaDoItem, avisoDoItem, chavesRepetidas,
  podeRegistrar, resumoDoLote, ordemDaFila, type ItemDoLote,
} from './lote-de-contas.ts';
import {
  mesDoRegistro, rotuloDoMes, mesCurto, vencimentoEmBr, semCobranca, podeGerar,
  selecaoParaGerar, somaEmCentavos, economiaAcumulada, resumoDaRodada, cobrancas,
  type FiltroDasRegistradas, type EstadoDaGeracao,
} from './registradas-regras.ts';

/* ================================================================ a fila */

/** A linha de status miuda — icone quando ha tom, porque cor sozinha nao e sinal
 *  (restricao 3 do tema). Mesmo desenho do `Status` da tela. */
function Motivo({ tom, children }: { tom?: 'ok' | 'alerta'; children: ReactNode }) {
  return (
    <span className={['fu-motivo', tom].filter(Boolean).join(' ')}>
      {tom && <Icone nome={tom === 'ok' ? 'aviso_ok' : 'aviso_alerta'} tamanho={14} peso="bold" />}
      <span>{children}</span>
    </span>
  );
}

/** A pilula de estado da linha da fila. Cor, icone e PALAVRA — os tres sinais. */
export function SituacaoDaLinha({ item, pendente }: { item: ItemDoLote; pendente: boolean }) {
  if (item.estado === 'registrado') return <Marca tom="ok" icone="confirmar">Registrada</Marca>;
  if (item.estado === 'registrando') return <Marca tom="nao_medido" icone="carregando">Gravando…</Marca>;
  if (item.estado === 'lendo') return <Marca tom="nao_medido" icone="carregando">Lendo…</Marca>;
  if (item.estado === 'na_fila') return <Marca tom="nao_medido">Na fila</Marca>;
  if (item.estado === 'falhou') return <Marca tom="erro">{item.campos ? 'Recusada' : 'Não leu'}</Marca>;
  return pendente
    ? <Marca tom="a_fazer">Corrigir</Marca>
    : <Marca tom="ok">Conferida</Marca>;
}

export type PropsDaFila = {
  itens: ItemDoLote[];
  ucs: ReadonlySet<string>;
  /** O número de cada unidade como o CADASTRO o guarda, pela chave completada
   *  (`formato.ts:mapaDoCadastro`). Sem ele a unidade sai como a conta a leu. */
  cadastro?: ReadonlyMap<string, string>;
  registrando: boolean;
  /** Se o «Registrar N» e o laranja da tela. Ver o cabecalho deste arquivo. */
  principal: boolean;
  /** A linha que esta aberta na gaveta, para a tabela dizer qual e. */
  abertaId?: string | null;
  registrar: (ids: readonly string[]) => void;
  conferir: (i: ItemDoLote) => void;
  remover: (id: string) => void;
  limpar: () => void;
};

/**
 * A FILA DAS CONTAS DO MES — uma linha por arquivo, e o trabalho no topo.
 *
 * O QUE ELA MOSTRA E O QUE DECIDE SE A CONTA PODE SER GRAVADA: unidade, mes,
 * total e vencimento sao os quatro campos que respondem "esta e a conta certa,
 * deste mes?". A gravacao e por (unidade, mes), entao um mes lido errado
 * sobrescreve a conta certa sem levantar erro nenhum.
 *
 * O NOME DO ARQUIVO E TRUNCADO NUMA LINHA, com o nome inteiro no `title`. Na
 * coluna de 380px ele quebrava em quatro, e cada linha da fila tinha de 150 a
 * 280px de altura — sete contas eram duas telas.
 *
 * O CARTAO SO APARECE COM FILA. Vazio, ele seria uma tabela vazia ocupando a
 * primeira dobra da tela mais usada do sistema.
 */
export function TabelaDaFila(p: PropsDaFila) {
  /* [30/09, etapa 2] «LIMPAR A FILA» PERGUNTA — na propria barra, e so quando
     ha o que perder. Ate aqui ela tirava tudo num clique, inclusive contas lidas
     e conferidas que ainda nao tinham sido registradas: cada uma delas custou
     uma leitura paga, e voltar exigia enviar e ler de novo. */
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const repetidas = chavesRepetidas(p.itens);
  const resumo = resumoDoLote(p.itens, p.ucs);
  const ordenados = ordemDaFila(p.itens, p.ucs);
  const prontos = ordenados.filter((i) => podeRegistrar(i, p.ucs, repetidas)).map((i) => i.id);

  if (p.itens.length === 0) return null;
  const naoRegistradas = p.itens.filter((i) => i.estado !== 'registrado').length;

  const partes = [
    `${resumo.total} ${resumo.total === 1 ? 'arquivo' : 'arquivos'}`,
    resumo.lendo > 0 && `${resumo.lendo} em leitura`,
    resumo.prontos > 0 && `${resumo.prontos} ${resumo.prontos === 1 ? 'conferida' : 'conferidas'}`,
    resumo.comPendencia > 0 && `${resumo.comPendencia} a corrigir`,
    resumo.registrados > 0 && `${resumo.registrados} ${resumo.registrados === 1 ? 'registrada' : 'registradas'}`,
  ].filter(Boolean);

  return (
    <section className="fu-bloco" aria-labelledby="fu-fila-titulo">
      <div className="fu-bloco-topo">
        <div className="fu-bloco-titulo">
          <h2 id="fu-fila-titulo">Fila deste mês</h2>
          <p className="fu-bloco-resumo">{partes.join(' · ')}</p>
        </div>
        {confirmandoLimpeza ? (
          <PerguntaNaTela forma="linha" tom="perigo" rotulo="Confirmar a limpeza da fila"
                          manter="Manter a fila" confirmar="Limpar a fila"
                          aoManter={() => setConfirmandoLimpeza(false)}
                          aoConfirmar={() => { setConfirmandoLimpeza(false); p.limpar(); }}>
            {naoRegistradas === 1
              ? 'Limpar a fila? 1 conta lida ainda não foi registrada e precisaria ser enviada de novo.'
              : `Limpar a fila? ${naoRegistradas} contas lidas ainda não foram registradas e precisariam ser enviadas de novo.`}
            {' '}As registradas ficam.
          </PerguntaNaTela>
        ) : (
          <div className="fu-bloco-acoes">
            {/* SO PERGUNTA QUANDO HA O QUE PERDER: com tudo registrado, limpar
                a fila nao tira nada que nao esteja gravado. */}
            <button type="button" className="discreto" disabled={p.registrando}
                    onClick={() => (naoRegistradas > 0 ? setConfirmandoLimpeza(true) : p.limpar())}>
              Limpar a fila
            </button>
            {/* O BOTAO DIZ QUANTAS, e nao "registrar tudo": ele age SO sobre as
                linhas conferidas, e o numero e a promessa do que vai acontecer. */}
            <button type="button" className={p.principal ? 'primario' : undefined}
                    disabled={p.registrando || prontos.length === 0}
                    onClick={() => p.registrar(prontos)}>
              {p.registrando && <Icone nome="carregando" tamanho={15} />}
              {p.registrando
                ? 'Registrando…'
                : `Registrar ${prontos.length} ${prontos.length === 1 ? 'conta conferida' : 'contas conferidas'}`}
            </button>
          </div>
        )}
      </div>

      {resumo.comPendencia > 0 && (
        <Aviso tipo="alerta">
          {resumo.comPendencia === 1
            ? 'Uma conta precisa de correção antes de ser registrada — ela está no topo da lista. '
            : `${resumo.comPendencia} contas precisam de correção antes de serem registradas — elas estão no topo da lista. `}
          Abra em «Conferir» e ajuste os campos: a linha se resolve sozinha quando a correção basta.
        </Aviso>
      )}

      <div className="fu-tabela fu-fila">
        {/* `cartoes={false}`: esta tabela tem cartao proprio desde a etapa 1 (a
            grade "sit / arq / uc mes / tot ven / aco"), e o generico da casa
            brigaria com ela. */}
        <Tabela cartoes={false} cabecalho={<>
          <th>Arquivo</th><th>Unidade</th><th>Mês</th>
          <th className="num">Total da conta</th><th>Vencimento</th><th>Situação</th>
          <th><span className="so-leitor">Ações</span></th>
        </>}>
          {ordenados.map((i) => {
            const pendencia = pendenciaDoItem(i, p.ucs, repetidas);
            const aviso = avisoDoItem(i, p.ucs);
            /* A UNIDADE COMO O CADASTRO A GUARDA, e nunca com os zeros que a
               chave de comparacao poe (`normalizarUc`). [30/09/2026, etapa 4b]
               Ate aqui era o texto que o leitor da conta devolvia — e ele pode
               vir completado com zeros («000006732614380»), que nao e como o
               numero aparece em nenhuma outra tela. Quando a conta e de uma
               unidade do cadastro, sai o numero de la (os mesmos digitos, sem o
               enchimento); quando nao e, sai como foi lido. */
            const uc = i.campos?.unidade_consumidora?.trim()
              ? numeroDaUcNaTela(i.campos.unidade_consumidora, p.cadastro) : '';
            const aberta = p.abertaId === i.id;
            return (
              <tr key={i.id} className={aberta ? 'fu-aberta' : undefined}
                  aria-current={aberta ? 'true' : undefined}>
                <td className="c-arq">
                  <span className="fu-nome" title={i.nome}>{i.nome}</span>
                  {pendencia && <Motivo tom="alerta">{pendencia}</Motivo>}
                  {!pendencia && aviso && <Motivo>{aviso}</Motivo>}
                </td>
                <td className="c-uc" data-rotulo="Unidade">{uc || '—'}</td>
                <td className="c-mes" data-rotulo="Mês">
                  {competenciaDoItem(i) || (i.campos?.mes_referencia || '—')}
                </td>
                <td className="c-tot num" data-rotulo="Total da conta">
                  {i.campos?.valor_total_equatorial || '—'}
                </td>
                <td className="c-ven" data-rotulo="Vencimento">{i.campos?.vencimento || '—'}</td>
                <td className="c-sit"><SituacaoDaLinha item={i} pendente={pendencia !== null} /></td>
                <td className="c-aco">
                  <div className="fu-acoes">
                    {i.campos && i.estado !== 'registrando' && (
                      /* `data-conferir` e o endereco da volta: fechar a gaveta
                         devolve o foco a ESTE botao, e nao ao topo da pagina. */
                      <button type="button" data-conferir={i.id} onClick={() => p.conferir(i)}
                              aria-label={`Conferir ${i.nome}`}>Conferir</button>
                    )}
                    {i.estado === 'lido' && !pendencia && (
                      <button type="button" disabled={p.registrando}
                              aria-label={`Registrar ${i.nome}`}
                              onClick={() => p.registrar([i.id])}>Registrar</button>
                    )}
                    {i.estado !== 'registrando' && (
                      <button type="button" className="discreto" disabled={p.registrando}
                              aria-label={`Tirar ${i.nome} da fila`}
                              onClick={() => p.remover(i.id)}>Tirar</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Tabela>
      </div>
    </section>
  );
}

/* ====================================================== as contas registradas */

export type PropsDasRegistradas = {
  /** `null` enquanto carrega. */
  lista: RegistroDeFatura[] | null;
  /** O que o filtro deixa passar — ja filtrado por quem chama. */
  visiveis: RegistroDeFatura[];
  erro: string | null;
  filtro: FiltroDasRegistradas;
  meses: string[];
  /** A lista bateu no teto: o mes mais velho pode estar pela metade. */
  parcial: boolean;
  aoFiltrar: (f: FiltroDasRegistradas) => void;
  desmarcadas: ReadonlySet<string>;
  aoMarcar: (id: string, marcada: boolean) => void;
  aoMarcarTodas: (marcar: boolean) => void;
  principal: boolean;
  revisando: boolean;
  aoRevisar: (abrir: boolean) => void;
  /** A rodada em curso ou a ultima, por id — na ORDEM em que foi pedida. */
  rodada: Record<string, EstadoDaGeracao>;
  rodadaIds: readonly string[];
  rodando: boolean;
  aoGerar: () => void;
  ensaio: Readonly<Record<string, { vira: boolean; frase: string }>>;
  ensaiando: string | null;
  aoEnsaiar: (r: RegistroDeFatura) => void;
  aoEnsaiarTodas: () => void;
  aoSegundaVia: (r: RegistroDeFatura) => void;
  /** [30/09, etapa 2] A conta em edicao que a 2a via substituiria («unidade
   *  1234»), ou `null` quando nao ha nenhuma — e ai a 2a via abre sem perguntar,
   *  porque nao ha nada a perder. */
  emEdicao?: string | null;
  /** A linha cuja 2a via espera confirmacao, na propria linha. */
  confirmandoSegundaVia?: string | null;
  aoPedirSegundaVia?: (id: string | null) => void;
  excluindo: string | null;
  aoPedirExclusao: (id: string | null) => void;
  aoExcluir: (r: RegistroDeFatura) => void;
  aoVerUnidade: (uc: string | null) => void;
  /** Ver `PropsDaFila.cadastro`. */
  cadastro?: ReadonlyMap<string, string>;
};

/** O titulo diz O QUE a lista esta mostrando — o mes, a unidade ou tudo. Ate
 *  30/09 o titulo mudava para "desta unidade" sem ninguem ter pedido. */
function tituloDasRegistradas(f: FiltroDasRegistradas): string {
  if (f.unidade) return `Contas registradas da unidade ${f.unidade}`;
  if (f.mes) return `Contas registradas de ${rotuloDoMes(f.mes)}`;
  return 'Contas registradas — todos os meses';
}

function SituacaoDoRegistro({ r, g }: { r: RegistroDeFatura; g: EstadoDaGeracao | undefined }) {
  if (g?.estado === 'gerando') return <Marca tom="nao_medido" icone="carregando">Gerando…</Marca>;
  if (r.fatura_id || g?.estado === 'gerada') return <Marca tom="ok" icone="confirmar">Cobrança gerada</Marca>;
  if (g?.estado === 'recusada') return <Marca tom="erro">Recusada</Marca>;
  if (g?.estado === 'na_vez') return <Marca tom="nao_medido">Na vez</Marca>;
  if (!r.cobranca_disponivel) return <Marca tom="nao_medido">Registrada</Marca>;
  /* AMBAR E NAO VERMELHO: sem cobranca e trabalho A FAZER, nao erro — o
     vermelho com X fica para a recusa. O relogio diz "esperando". */
  return <Marca tom="nao_medido" icone="a_receber">Sem cobrança</Marca>;
}

/**
 * AS CONTAS REGISTRADAS, numa tabela propria e larga.
 *
 * O QUE MUDOU EM 30/09, e cada item responde a um defeito medido (ver
 * `registradas-regras.ts`): abre no mes que tem trabalho, filtra por mes e por
 * "sem cobranca", a unidade e um chip que se tira, e as cobrancas saem em LOTE —
 * «Gerar N cobrancas» abre UMA revisao com a lista e a soma, e as chamadas
 * continuam uma a uma por baixo, com a situacao de cada linha mudando na hora.
 *
 * «EXCLUIR» SAIU DO LADO DE «GERAR COBRANCA». Os dois eram texto miudo colado,
 * e um erro de mira apagava da economia acumulada o desconto de um mes. Agora e
 * um icone no fim da linha, e o clique abre a confirmacao NA PROPRIA LINHA, com
 * «Manter» no foco.
 */
export function TabelaDasRegistradas(p: PropsDasRegistradas) {
  const marcadas = selecaoParaGerar(p.visiveis, p.desmarcadas);
  const elegiveis = p.visiveis.filter(podeGerar);
  const todas = elegiveis.length > 0 && marcadas.length === elegiveis.length;
  const algumas = marcadas.length > 0 && !todas;
  const pendentes = p.visiveis.filter(semCobranca).length;
  const mostraMes = !p.filtro.mes;
  const temRodada = p.rodadaIds.length > 0;

  /* O `indeterminate` so existe como propriedade do DOM — nao ha atributo HTML
     para ele. Sem isto a caixa de cima diria "nenhuma" com tres marcadas. */
  const todasRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (todasRef.current) todasRef.current.indeterminate = algumas; }, [algumas]);

  const resumo = p.lista == null ? 'Lendo as contas registradas…' : [
    `${p.visiveis.length} ${p.visiveis.length === 1 ? 'conta' : 'contas'}`,
    p.visiveis.length > 0 && emReais(somaEmCentavos(p.visiveis)),
    pendentes > 0 && `${pendentes} sem cobrança`,
  ].filter(Boolean).join(' · ');

  const colunas = 7 + (mostraMes ? 1 : 0);
  const economia = p.filtro.unidade ? economiaAcumulada(p.visiveis) : null;

  return (
    <section className="fu-bloco" aria-labelledby="fu-registradas-titulo" id="fu-registradas">
      <div className="fu-bloco-topo">
        <div className="fu-bloco-titulo">
          <h2 id="fu-registradas-titulo">{tituloDasRegistradas(p.filtro)}</h2>
          <p className="fu-bloco-resumo">{resumo}</p>
        </div>
        {!p.revisando && (
          <div className="fu-bloco-acoes">
            <button type="button" className={p.principal && marcadas.length > 0 ? 'primario' : undefined}
                    disabled={marcadas.length === 0 || p.rodando}
                    onClick={() => p.aoRevisar(true)}>
              {`Gerar ${cobrancas(marcadas.length)}`}
            </button>
          </div>
        )}
      </div>

      <div className="ferramentas fu-filtros">
        {/* O FILTRO DE MES CONTINUA LA COM A UNIDADE LIGADA: a serie de uma
            unidade atravessa meses, e e por isso que o chip abre em «Todos». */}
        <Filtro rotulo="Mês de referência" valor={p.filtro.mes ?? 'todos'}
                ao={(v) => p.aoFiltrar({ ...p.filtro, mes: v === 'todos' ? null : v })}
                opcoes={[
                  ...p.meses.map((m, k) => ({
                    valor: m,
                    texto: rotuloDoMes(m) + (p.parcial && k === p.meses.length - 1 ? ' (parcial)' : ''),
                  })),
                  { valor: 'todos', texto: 'Todos os meses' },
                ]} />
        <Interruptor ligado={p.filtro.soSemCobranca} rotulo="Só sem cobrança"
                     ao={(v) => p.aoFiltrar({ ...p.filtro, soSemCobranca: v })} />
        {p.filtro.unidade && (
          <span className="fu-chip">
            Unidade {numeroDaUcNaTela(p.filtro.unidade, p.cadastro)}
            <button type="button" className="fu-chip-x" onClick={() => p.aoVerUnidade(null)}
                    aria-label={`Tirar o filtro da unidade ${numeroDaUcNaTela(p.filtro.unidade, p.cadastro)}`} title="Tirar o filtro">
              <Icone nome="fechar" tamanho={13} peso="bold" />
            </button>
          </span>
        )}
        {p.lista != null && (
          <span className="contagem">{p.visiveis.length} de {p.lista.length}</span>
        )}
      </div>

      {p.revisando && (
        <Revisao marcadas={marcadas} rodada={p.rodada} rodadaIds={p.rodadaIds} lista={p.lista ?? []}
                 cadastro={p.cadastro}
                 rodando={p.rodando} ensaio={p.ensaio} ensaiando={p.ensaiando}
                 aoGerar={p.aoGerar} aoEnsaiarTodas={p.aoEnsaiarTodas}
                 aoFechar={() => p.aoRevisar(false)} />
      )}

      {p.erro && <Aviso tipo="erro">{p.erro}</Aviso>}

      <div className="fu-tabela fu-registradas">
        <Tabela
          cartoes={false}
          vazio={p.lista == null ? 'Lendo as contas registradas…'
            : p.lista.length === 0
              ? 'Nenhuma conta registrada ainda. Cada conta enviada acima, conferida e registrada, aparece aqui — e é daqui que ela vira cobrança.'
              : p.filtro.soSemCobranca
                ? 'Nenhuma conta sem cobrança neste filtro — todas já viraram cobrança.'
                : 'Nenhuma conta neste filtro.'}
          cabecalho={<>
            <th className="c-sel">
              {/* O TEXTO SO APARECE NO CELULAR, onde o cabecalho vira a primeira
                  linha da lista de cartoes; na tabela a coluna fala sozinha. */}
              <label>
                <input type="checkbox" ref={todasRef} checked={todas}
                       disabled={elegiveis.length === 0 || p.rodando}
                       aria-label={`Marcar todas as ${elegiveis.length} sem cobrança`}
                       onChange={(e) => p.aoMarcarTodas(e.target.checked)} />
                <span className="so-celular">Marcar todas as {elegiveis.length} sem cobrança</span>
              </label>
            </th>
            <th>Unidade</th><th>Cliente</th>
            {mostraMes && <th>Mês</th>}
            <th>Vencimento</th><th className="num">Valor</th><th>Situação</th>
            <th><span className="so-leitor">Ações</span></th>
            <th><span className="so-leitor">Excluir</span></th>
          </>}>
          {p.visiveis.flatMap((r) => {
            const g = p.rodada[r.id];
            const e = p.ensaio[r.id];
            const mes = mesCurto(mesDoRegistro(r));
            const marcada = podeGerar(r) && !p.desmarcadas.has(r.id);
            const uc = numeroDaUcNaTela(r.numero_uc, p.cadastro);
            const linha = (
              <tr key={r.id} className={marcada ? 'fu-marcada' : undefined}>
                <td className="c-sel">
                  {podeGerar(r) && (
                    <label className="alvo-caixa">
                      <input type="checkbox" checked={marcada} disabled={p.rodando}
                             aria-label={`Incluir a unidade ${uc} em «Gerar cobranças»`}
                             onChange={(ev) => p.aoMarcar(r.id, ev.target.checked)} />
                    </label>
                  )}
                </td>
                <td className="c-uc">
                  {/* A UNIDADE E O CAMINHO PARA A SERIE DELA: o clique liga o chip.
                      E o mesmo pedido que antes se fazia digitando o numero no
                      formulario — agora explicito, e sem mexer no formulario. */}
                  <button type="button" className="fu-link" title="Ver só esta unidade"
                          aria-label={`Ver só a unidade ${uc}`}
                          onClick={() => p.aoVerUnidade(r.numero_uc)}>{uc}</button>
                </td>
                <td className="c-cli">
                  <span className="fu-nome" title={r.cliente_nome ?? undefined}>{r.cliente_nome || '—'}</span>
                  {g?.estado === 'recusada' && <Motivo tom="alerta">{g.motivo}</Motivo>}
                  {g?.estado !== 'recusada' && e && !r.fatura_id && (
                    <Motivo tom={e.vira ? 'ok' : 'alerta'}>{e.frase}</Motivo>
                  )}
                </td>
                {mostraMes && <td className="c-mes" data-rotulo="Mês">{mes}</td>}
                <td className="c-ven" data-rotulo="Vencimento">{vencimentoEmBr(r)}</td>
                <td className="c-val num" data-rotulo="Valor">{emReais(r.total_centavos)}</td>
                <td className="c-sit"><SituacaoDoRegistro r={r} g={g} /></td>
                <td className="c-aco">
                  <div className="fu-acoes">
                    {/* A 2a VIA VALE SEMPRE, cobrada ou nao: e o documento daquele
                        mes, remontado do que foi gravado. */}
                    <button type="button" className="discreto"
                            aria-label={`2ª via de ${mes} da unidade ${uc}`}
                            onClick={() => (p.emEdicao && p.aoPedirSegundaVia
                              ? p.aoPedirSegundaVia(r.id) : p.aoSegundaVia(r))}>2ª via</button>
                    {semCobranca(r) && (
                      <button type="button" className="discreto"
                              disabled={p.ensaiando !== null || p.rodando}
                              aria-label={`Conferir antes a unidade ${uc}`}
                              onClick={() => p.aoEnsaiar(r)}>
                        {p.ensaiando === r.id ? 'conferindo…' : 'conferir antes'}
                      </button>
                    )}
                  </div>
                </td>
                <td className="c-exc">
                  {/* JA COBRADA NAO SE EXCLUI: apagar o registro de um mes ja cobrado
                      deixaria a cobranca sem a conta que a originou. */}
                  {semCobranca(r) && (
                    <BotaoDeIcone icone="remover" desabilitado={p.rodando}
                                  rotulo={`Excluir o registro de ${mes} da unidade ${uc}`}
                                  ao={() => p.aoPedirExclusao(r.id)} />
                  )}
                </td>
              </tr>
            );
            if (p.confirmandoSegundaVia === r.id && p.emEdicao) {
              /* A 2a VIA SUBSTITUI A CONTA EM EDICAO, e a pergunta mora na linha
                 que a pediu — ate 30/09 era um `window.confirm`. Ambar e nao
                 vermelho: nada e apagado do banco, o que sai e o rascunho da
                 tela. O foco nasce em «Manter a edição». */
              return [linha, (
                <tr key={`${r.id}-segunda-via`} className="fu-confirma">
                  <td colSpan={colunas + 1}>
                    <PerguntaNaTela forma="linha" tom="aviso" rotulo="Confirmar a 2ª via"
                                    manter="Manter a edição" confirmar="Abrir a 2ª via"
                                    aoManter={() => p.aoPedirSegundaVia?.(null)}
                                    aoConfirmar={() => { p.aoPedirSegundaVia?.(null); p.aoSegundaVia(r); }}>
                      Abrir a 2ª via de <strong>{mes}</strong> da unidade <strong>{uc}</strong>?
                      {' '}A conta em edição agora ({p.emEdicao}) sai da tela — o que nela não foi
                      registrado se perde.
                    </PerguntaNaTela>
                  </td>
                </tr>
              )];
            }
            if (p.excluindo !== r.id) return [linha];
            return [linha, (
              <tr key={`${r.id}-excluir`} className="fu-confirma">
                <td colSpan={colunas + 1}>
                  {/* O FOCO NASCE EM «MANTER»: um Enter distraido nao apaga. */}
                  <PerguntaNaTela forma="linha" tom="perigo" rotulo="Confirmar a exclusão"
                                  manter="Manter" confirmar="Excluir o registro"
                                  aoManter={() => p.aoPedirExclusao(null)} aoConfirmar={() => p.aoExcluir(r)}>
                    Excluir o registro de <strong>{mes}</strong> da unidade <strong>{uc}</strong>?
                    {' '}O desconto de {emReais(r.desconto_centavos)} sai da economia acumulada que a
                    folha do cliente imprime.
                  </PerguntaNaTela>
                </td>
              </tr>
            )];
          })}
        </Tabela>
      </div>

      {economia && economia.faturas > 1 && (
        <p className="fu-nota">
          Economia acumulada desta unidade: <strong>{emReais(economia.centavos)}</strong> em{' '}
          <strong>{economia.faturas}</strong> contas — é o número impresso na folha 2.
        </p>
      )}
    </section>
  );
}

/**
 * A REVISAO ANTES DE GRAVAR — uma so, no lugar de um `window.confirm` por linha.
 *
 * Ela lista o que vai ser cobrado (unidade, cliente, valor) e a soma, e so entao
 * oferece o ato. Durante a rodada ela vira o placar: cada linha diz se foi
 * gerada ou por que foi recusada, e o resumo conta. As chamadas continuam UMA A
 * UMA por baixo — sao duas escritas na mesma transacao do servidor, e duas em
 * paralelo disputariam a trava que impede o mesmo mes de ser cobrado duas vezes.
 */
function Revisao(p: {
  marcadas: RegistroDeFatura[];
  rodada: Record<string, EstadoDaGeracao>;
  rodadaIds: readonly string[];
  lista: RegistroDeFatura[];
  rodando: boolean;
  ensaio: Readonly<Record<string, { vira: boolean; frase: string }>>;
  ensaiando: string | null;
  aoGerar: () => void;
  aoEnsaiarTodas: () => void;
  aoFechar: () => void;
  cadastro?: ReadonlyMap<string, string>;
}) {
  const emRodada = p.rodadaIds.length > 0;
  const porId = new Map(p.lista.map((r) => [r.id, r]));
  const linhas = emRodada
    ? p.rodadaIds.map((id) => porId.get(id)).filter((r): r is RegistroDeFatura => r !== undefined)
    : p.marcadas;
  const n = linhas.length;
  const meses = [...new Set(linhas.map(mesDoRegistro))];
  const deMes = meses.length === 1 ? ` de ${rotuloDoMes(meses[0]!)}` : '';
  const placar = resumoDaRodada(p.rodada);
  const acabou = emRodada && !p.rodando;

  const titulo = !emRodada
    ? `Gerar ${cobrancas(n)}${deMes}?`
    : p.rodando
      ? `Gerando ${placar.geradas + placar.recusadas + 1} de ${placar.total}…`
      : `${placar.geradas} de ${placar.total} ${placar.total === 1 ? 'cobrança gerada' : 'cobranças geradas'}`;

  /* A CASCA E A DE `serie.tsx` desde 30/09/2026 (etapa 4b) — a mesma da revisão
     de Cobranças. O que é desta tela fica aqui: as frases, o «Conferir antes» e
     o caminho para Cobranças no fim. */
  return (
    <RevisaoEmSerie id="fu-revisao" titulo={titulo} resultado={acabou}
                    nota={<>
                      {!emRodada && 'Cada uma nasce como rascunho — nada é enviado ao cliente agora. Emitir é o passo seguinte, em «Cobranças».'}
                      {p.rodando && 'Uma de cada vez, na ordem abaixo. Pode acompanhar aqui; não feche a página.'}
                      {acabou && (placar.recusadas === 0
                        ? 'Todas nasceram como rascunho. O próximo passo é emiti-las.'
                        : `${placar.recusadas} ${placar.recusadas === 1 ? 'foi recusada' : 'foram recusadas'} — o motivo está na linha. As outras nasceram como rascunho.`)}
                    </>}
                    soma={<>Soma: <strong>{emReais(somaEmCentavos(linhas))}</strong> em {n} {n === 1 ? 'conta' : 'contas'}</>}
                    atos={<>
                      {!emRodada && (
                        <>
                          <button type="button" className="discreto" onClick={p.aoFechar}>Cancelar</button>
                          <button type="button" disabled={p.ensaiando !== null || n === 0} onClick={p.aoEnsaiarTodas}>
                            {`Conferir antes as ${n}`}
                          </button>
                          <button type="button" className="primario" disabled={n === 0 || p.ensaiando !== null}
                                  onClick={p.aoGerar}>
                            {n === 1 ? 'Sim, gerar a cobrança' : `Sim, gerar as ${n}`}
                          </button>
                        </>
                      )}
                      {acabou && (
                        <>
                          <button type="button" onClick={p.aoFechar}>Fechar</button>
                          {placar.geradas > 0 && (
                            <Ligacao para="/faturas" className="fu-ir">Emitir em «Cobranças»</Ligacao>
                          )}
                        </>
                      )}
                    </>}>
      {linhas.map((r) => {
        const g = p.rodada[r.id];
        const e = p.ensaio[r.id];
        return (
          <ItemDaSerie key={r.id} estado={g?.estado}
                       unidade={numeroDaUcNaTela(r.numero_uc, p.cadastro)} cliente={r.cliente_nome}
                       valor={emReais(r.total_centavos)}
                       situacao={g ? <SituacaoDoRegistro r={r} g={g} />
                         : p.ensaiando === r.id ? <Marca tom="nao_medido" icone="carregando">Conferindo…</Marca>
                         : e ? <Motivo tom={e.vira ? 'ok' : 'alerta'}>{e.vira ? 'Vira cobrança' : 'Não vira cobrança'}</Motivo>
                         : null}
                       motivo={(g?.estado === 'recusada' || (!g && e && !e.vira)) && (
                         <Motivo tom="alerta">{g?.estado === 'recusada' ? g.motivo : e!.frase}</Motivo>
                       )} />
        );
      })}
    </RevisaoEmSerie>
  );
}

/* =============================================================== a gaveta */

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * A GAVETA DA CONTA — o formulario de UMA conta, por cima da fila.
 *
 * GAVETA E NAO UM PAINEL QUE TROCA A LISTA, e a escolha tem tres motivos:
 *
 *   1. A FILA CONTINUA A VISTA, a esquerda, com a linha aberta marcada. Quem
 *      confere a quarta de sete sabe onde esta sem ler um contador;
 *   2. CONFERIR E UM SUBTRABALHO COM FIM E COM ATO PROPRIO («Registrar este
 *      mes»). Enquanto ele esta aberto, as acoes da tabela atras ficariam
 *      cobertas pela gaveta — e um clique numa acao coberta e o tipo de erro que
 *      nao se ve. Por isso ela e MODAL: `aria-modal`, foco preso, e Esc fecha;
 *   3. «ANTERIOR» E «PROXIMA» ANDAM PELA FILA SEM FECHAR. Sete contas sao sete
 *      conferencias seguidas, e fechar e reabrir a cada uma e o trabalho que a
 *      fila existe para tirar.
 *
 * O FOCO VOLTA A QUEM ABRIU: quem chama recebe `aoFechar` e devolve o foco ao
 * gatilho (o «Conferir» da linha, por `data-conferir`). Aqui dentro, o foco
 * nasce no TITULO — o leitor de tela anuncia a conta, e o proximo Tab entra no
 * primeiro controle.
 *
 * SEM SOMBRA: o veu Navy e a linha de 1px ja dizem "isto esta por cima". O
 * g3ref separa por linha, nunca por volume (I8c2).
 */
export function GavetaDaConta(p: {
  titulo: string;
  sub?: ReactNode;
  /** Anterior / Proxima, ao lado do titulo. */
  navegacao?: ReactNode;
  rodape: ReactNode;
  children: ReactNode;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  /* `aoFechar` MUDA A CADA RENDER de quem chama. Com ele na lista do efeito, cada
     tecla digitada num campo desmontaria e remontaria o efeito — e o remonte
     devolve o foco ao titulo, arrancando o cursor do campo. A referencia guarda
     o mais novo sem reinstalar nada. */
  const fechar = useRef(p.aoFechar);
  fechar.current = p.aoFechar;

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    caixa.current?.querySelector<HTMLElement>('[data-foco-inicial]')?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return; }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = [...caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0]!;
      const ultimo = focaveis[focaveis.length - 1]!;
      const dentro = caixa.current.contains(document.activeElement);
      if (e.shiftKey && (!dentro || document.activeElement === primeiro
                         || document.activeElement === caixa.current.querySelector('[data-foco-inicial]'))) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
        e.preventDefault(); primeiro.focus();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = anterior;
    };
  }, []);

  return (
    <div className="naoimprime">
      {/* O VEU FECHA NO CLIQUE, como o da ajuda: e o gesto que todo painel por
          cima ensina. Nada se perde — o que esta na gaveta e o rascunho, e ele
          continua gravado. */}
      <div className="fu-veu" onClick={p.aoFechar} aria-hidden="true" />
      <div className="fu-gaveta" ref={caixa} role="dialog" aria-modal="true"
           aria-labelledby="fu-gaveta-titulo">
        <header className="fu-gaveta-topo">
          <div className="fu-gaveta-cabeca">
            <h2 id="fu-gaveta-titulo" tabIndex={-1} data-foco-inicial="">{p.titulo}</h2>
            {p.sub && <div className="fu-gaveta-sub">{p.sub}</div>}
          </div>
          {p.navegacao && <div className="fu-gaveta-nav">{p.navegacao}</div>}
          <button type="button" className="so-icone fu-gaveta-x" onClick={p.aoFechar}
                  title="Fechar (Esc)" aria-label="Fechar a conferência">
            <Icone nome="fechar" tamanho={16} peso="bold" />
          </button>
        </header>
        <div className="fu-gaveta-corpo">{p.children}</div>
        <footer className="fu-gaveta-pe">{p.rodape}</footer>
      </div>
    </div>
  );
}
