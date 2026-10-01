// CONTAS A PAGAR — a vertente da EMPRESA (PRD §4.4), na fatia que tinha prazo.
//
// POR QUE ESTA TELA EXISTE, e a razão está numa data e não numa preferência. Até
// 03/08/2026 o sistema sabia ao centavo QUANTO devia ao dono da usina e ao
// originador — os relatórios já respondiam isso — e **não tinha onde registrar
// que pagou**. Extrato de apuração, não de quitação, e nada impedia pagar duas
// vezes o mesmo repasse. `Q-PAGAMENTO-01`.
//
// A JANELA fechava na primeira liquidação, enquanto `split_item` tem 0 linhas.
//
// O VAZIO AQUI TEM SIGNIFICADO PRECISO, e não é "erro" — é a mesma distinção que
// a tela de Relatórios faz: as contas de repasse e comissão **nascem do split**,
// e o split só roda quando uma fatura é liquidada (PRD §5.2). Com 0 faturas em
// produção, a lista vazia é o estado CERTO. A tela diz isso.
//
// O QUE ELA NÃO OFERECE, e a ausência é a regra: **não há botão de criar repasse
// ou comissão**. Esses nascem do split e só de lá — um segundo caminho
// provisionaria a mesma despesa duas vezes ao mesmo beneficiário, e as duas se
// somariam sem ninguém notar. O formulário cria `outro`, e só.
//
// E O PAPEL `cobrança` NÃO ENTRA AQUI. A matriz do PRD §3 lhe dá traço na coluna
// Corporativo, e a rota responde 403 — não é defeito, é a coluna funcionando.

import { useState } from 'react';
import { api } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Icone, DetalheTecnico,
  Carregando, AjudaDoMes, CampoData, useOrdenacao, ordenar, contem, BotaoDeCriar, PainelDeCriar,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { SELO_DA_CONTA_A_PAGAR, SELO_DA_ESPERA_DO_REPASSE, tipoDoAviso } from '../tom-do-estado.ts';
import { emReais, paraCentavos, competenciaISO, centavosParaCampo } from '../dinheiro.ts';
import { diaEmBr, mesEmBr, hojeEmSP, contagem } from '../formato.ts';
import { PerguntaNaTela } from '../serie.tsx';
import {
  saldoCentavos, nomeDoBeneficiario, estaAtrasada, recibo, emBr,
  podePagar, podeCancelar, podeCriar,
  ROTULO_DO_STATUS, ROTULO_DA_FORMA, ROTULO_DO_BENEFICIARIO,
  type ContaAPagar, type FormaDePagamento, type PagamentoDaConta,
} from '../contas-regras.ts';
import {
  motivoDaEspera, podeRepartirAgora, ordenarPelaEspera, resumoDaEspera, totalCentavos,
  ROTULO_DO_MOTIVO, ROTULO_CURTO_DO_MOTIVO, EXPLICACAO_DO_MOTIVO, COMO_DESTRAVAR, ORDEM_DOS_MOTIVOS,
  type RepassePendente, type MotivoDaEspera,
} from '../repasse-pendente.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo, type Coluna } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';
import { FaixaDoPasso } from '../roteiro-corpo.tsx';

type ResumoLinha = {
  tipo: string; beneficiario: string; titulos: number;
  devido_centavos: number; pago_centavos: number; saldo_centavos: number; atrasados: number;
};

type ItemSemConta = {
  split_item_id: string; tipo: string; valor_centavos: number; competencia: string;
};

/* AS SITUACOES DA CONTA E DA ESPERA nos tons do selo vem de `tom-do-estado.ts`
 * desde 01/10/2026 (etapa 7b): `SELO_DA_CONTA_A_PAGAR` e
 * `SELO_DA_ESPERA_DO_REPASSE`. A regra de 30/09 continua — aberta e parcial sao
 * tarefa, o vermelho e da VENCIDA, o selo ao lado da data —, com duas trocas:
 * «Em aberto» deixou o lapis da lacuna de cadastro pela mao que entrega moedas,
 * e «aguardando o banco» saiu da interrogacao ambar para o neutro com o relogio
 * (em curso, sem voce: o sistema pergunta ao banco todo dia). */

export function TelaContasAPagar() {
  const contas = useDados<ContaAPagar[]>(() => api.get('/contas-a-pagar'));
  const resumo = useDados<ResumoLinha[]>(() => api.get('/contas-a-pagar/resumo'));
  const semProvisao = useDados<ItemSemConta[]>(() => api.get('/contas-a-pagar/sem-provisao'));
  const espera = useDados<RepassePendente[]>(() => api.get('/liquidacoes/pendentes-de-split'));
  const acao = useAcao();

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const { ordem, alternar } = useOrdenacao('vencimento');
  /* O LANÇAMENTO À MÃO SAIU DO MEIO DA TELA (30/09/2026, etapa 4a). Ele ficava
     entre o resumo por beneficiário e a lista — um botão, ou um formulário
     inteiro, cortando a tela ao meio. Agora é o padrão das telas de cadastro:
     «Nova despesa avulsa» ao lado do título, e o painel logo abaixo dele. */
  const [lancando, setLancando] = useState(false);

  /*
   * `hoje` é calculado UMA vez por render e passado às funções puras, em vez de
   * cada uma chamar `new Date()`. Duas leituras do relógio na mesma tela podem
   * cair em dias diferentes à meia-noite, e a lista mostraria uma conta atrasada
   * na coluna e não-atrasada no total.
   */
  const hoje = new Date();

  const todas = contas.dado ?? [];
  const visiveis = ordenar(
    todas.filter((c) =>
      (contem(c.descricao, busca) || contem(nomeDoBeneficiario(c), busca))
      && (!situacao || c.status === situacao)),
    ordem,
    {
      vencimento: (c) => c.vencimento,
      beneficiario: (c) => nomeDoBeneficiario(c),
      descricao: (c) => c.descricao,
      valor: (c) => c.valor_centavos,
      saldo: (c) => saldoCentavos(c),
      situacao: (c) => c.status,
    },
  );

  const emAberto = todas.filter((c) => c.status === 'aberta' || c.status === 'parcial');
  const totalSaldo = emAberto.reduce((a, c) => a + saldoCentavos(c), 0);
  const atrasadas = emAberto.filter((c) => estaAtrasada(c, hoje));
  const totalAtrasado = atrasadas.reduce((a, c) => a + saldoCentavos(c), 0);

  const COLUNAS: Coluna<ContaAPagar>[] = [
    { titulo: 'Vencimento', de: (c) => String(c.vencimento).slice(0, 10) },
    { titulo: 'Mes de referencia', de: (c) => String(c.competencia).slice(0, 7) },
    { titulo: 'Beneficiario', de: (c) => nomeDoBeneficiario(c) },
    { titulo: 'Tipo', de: (c) => ROTULO_DO_BENEFICIARIO[c.beneficiario_tipo] },
    { titulo: 'Descricao', de: (c) => c.descricao },
    { titulo: 'Valor R$', de: (c) => reaisParaPlanilha(c.valor_centavos) },
    { titulo: 'Pago R$', de: (c) => reaisParaPlanilha(c.valor_pago_centavos) },
    { titulo: 'Saldo R$', de: (c) => reaisParaPlanilha(saldoCentavos(c)) },
    { titulo: 'Situacao', de: (c) => ROTULO_DO_STATUS[c.status] },
    { titulo: 'Origem', de: (c) => (c.origem_split_item_id ? 'automática' : 'manual') },
  ];

  return (
    <Pagina titulo="Contas a pagar"
            sub="O que a empresa deve — a parte do dono da usina, a comissão de quem trouxe o cliente, a concessionária e despesas avulsas. A parte do dono e a comissão nascem sozinhas quando um cliente paga."
            acao={<BotaoDeCriar controla="nova-despesa" aberto={lancando} ao={() => setLancando(!lancando)}>
              Nova despesa avulsa
            </BotaoDeCriar>}>
      {lancando && (
        <FormularioDeConta acao={acao} aoFechar={() => setLancando(false)}
                           aoCriar={() => { contas.recarregar(); resumo.recarregar(); }} />
      )}
      <RetornoDoAto texto={!lancando && acao.sucesso} />

      {/*
        O FIM DO MÊS DO RATEIO MORA AQUI, do outro lado da barra (30/09/2026). O
        passo 5 do mês — receber e repartir — termina nesta lista: quando o
        cliente paga, a parte do dono da usina e a comissão nascem aqui. Até esta
        data a tela não dizia isso, e o roteiro mandava para cá sem que a tela
        de chegada soubesse de que mês ela era o fim. A faixa é a mesma das telas
        Contas de luz e Cobranças, e o link volta para o mês inteiro.
      */}
      <FaixaDoPasso rota="/contas-a-pagar" />

      {/*
        * A CONFERÊNCIA ENTRE APURAÇÃO E QUITAÇÃO, e ela vem ANTES da lista de
        * propósito: um `split_item` sem conta a pagar é dinheiro apurado que
        * ninguém vai pagar, e isso não aparece em nenhuma outra tela. Lista
        * vazia é o estado correto, então o aviso só existe quando há buraco.
        */}
      {(semProvisao.dado?.length ?? 0) > 0 && (
        <Aviso tipo="erro">
          {contagem(semProvisao.dado!.length, 'valor já apurado não virou', 'valores já apurados não viraram')} conta
          a pagar. É
          dinheiro que alguém tem a receber e que ninguém vai pagar sem ajuste — normalmente de
          pagamentos registrados antes de 03/08/2026. Somam:{' '}
          <strong>{emReais(semProvisao.dado!.reduce((a, i) => a + i.valor_centavos, 0))}</strong>.
        </Aviso>
      )}

      {/* [01/10/2026, etapa 7b] O AVISO TEM O TOM DO SELO DE QUE ELE FALA: era
          âmbar em cima de linhas com o selo VENCIDA vermelho. `tipoDoAviso` lê
          o mesmo selo das linhas, e os dois não têm mais como discordar. */}
      {atrasadas.length > 0 && (
        <Aviso tipo={tipoDoAviso(SELO_DA_CONTA_A_PAGAR.vencida)}>
          {contagem(atrasadas.length, 'conta vencida', 'contas vencidas')}, somando <strong>{emReais(totalAtrasado)}</strong>.
        </Aviso>
      )}

      {/*
        * DINHEIRO QUE ENTROU E AINDA NAO VIROU CONTA A PAGAR — o cartao entrou em
        * 08/09/2026 e ele fecha um vao que era invisivel nesta tela.
        *
        * O subtitulo da pagina promete que a parte do dono "nasce sozinha quando
        * um cliente paga". A partir desta data ela nasce um passo depois: o banco
        * avisa o pagamento, e o repasse espera a CONFIRMACAO desse pagamento.
        * Entre um e outro o dinheiro existe, e esta tela dizia "nada a pagar".
        *
        * Some quando nao ha espera, e sumir e o certo: fila vazia e o estado
        * normal, e um cartao permanente escrito "0" poe na tela um problema que
        * nao existe.
        */}
      {(espera.dado?.length ?? 0) > 0 && (
        <DinheiroParado linhas={espera.dado!} ocupado={acao.ocupado}
                        repartir={async (l) => {
                          const ok = await acao.executar(
                            () => api.post(`/liquidacoes/${l.liquidacao_id}/repartir`, {}));
                          if (ok) { espera.recarregar(); contas.recarregar(); resumo.recarregar(); }
                        }} />
      )}

      {/* ------------------------------------------------ o resumo por quem recebe */}
      <div className="cartao secao">
        {/* [01/10/2026, etapa 5] h2, e não h3: era o primeiro título depois do
            h1, e o salto h1 → h3 foi o que o detector acusou nesta tela. */}
        <h2 className="cartao-tit">
          <Icone nome="contas_a_pagar" tamanho={17} /> A pagar, por beneficiário
        </h2>
        {resumo.carregando ? <Carregando /> : resumo.erro ? (
          <Aviso tipo="erro">Não foi possível ler o resumo: {resumo.erro}</Aviso>
        ) : (resumo.dado?.length ?? 0) === 0 ? (
          <p className="nota">
            Nada a pagar. A parte do dono da usina e a comissão só nascem quando um cliente paga —
            com nenhuma cobrança paga ainda, este vazio é o esperado, e não um erro.
          </p>
        ) : (
          <Tabela cabecalho={<><th>Beneficiário</th><th>Tipo</th><th className="num">Títulos</th>
                              <th className="num">Devido</th><th className="num">Pago</th>
                              <th className="num">Saldo</th><th className="num">Vencidos</th></>}>
            {resumo.dado!.map((r, i) => (
              <tr key={`${r.tipo}-${r.beneficiario}-${i}`}>
                <td><strong>{r.beneficiario}</strong></td>
                <td>{ROTULO_DO_BENEFICIARIO[r.tipo as ContaAPagar['beneficiario_tipo']] ?? r.tipo}</td>
                <td className="num">{r.titulos}</td>
                <td className="num">{emReais(r.devido_centavos)}</td>
                <td className="num">{emReais(r.pago_centavos)}</td>
                <td className="num"><strong>{emReais(r.saldo_centavos)}</strong></td>
                <td className="num">{r.atrasados > 0
                  ? <Marca selo={SELO_DA_CONTA_A_PAGAR.vencida}>{r.atrasados}</Marca>
                  : <span className="nota">—</span>}</td>
              </tr>
            ))}
          </Tabela>
        )}
      </div>

      {/* ------------------------------------------------------------ a lista */}
      <Ferramentas contagem={`${visiveis.length} de ${todas.length} · saldo em aberto ${emReais(totalSaldo)}`}>
        <Busca valor={busca} ao={setBusca} dica="beneficiário ou descrição" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Situação" opcoes={[
          { valor: '', texto: 'Todas as situações' },
          { valor: 'aberta', texto: ROTULO_DO_STATUS.aberta },
          { valor: 'parcial', texto: ROTULO_DO_STATUS.parcial },
          { valor: 'paga', texto: ROTULO_DO_STATUS.paga },
          { valor: 'cancelada', texto: ROTULO_DO_STATUS.cancelada },
        ]} />
        <button disabled={visiveis.length === 0}
                onClick={() => baixarCsv(nomeDoArquivo('contas-a-pagar'), paraCsv(COLUNAS, visiveis))}>
          <Icone nome="baixar" tamanho={15} /> CSV
        </button>
      </Ferramentas>

      {contas.carregando ? <Carregando /> : contas.erro ? (
        <Aviso tipo="erro">Não foi possível ler as contas a pagar: {contas.erro}</Aviso>
      ) : (
        <Tabela vazio={todas.length === 0
                  ? 'Nenhuma conta a pagar. As de repasse e comissão aparecem quando a primeira cobrança for paga.'
                  : 'Nenhuma conta com esses filtros.'}
                cabecalho={<>
                  <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                  <ThOrd chave="beneficiario" ordem={ordem} ao={alternar}>Beneficiário</ThOrd>
                  <ThOrd chave="descricao" ordem={ordem} ao={alternar}>Descrição</ThOrd>
                  <ThOrd chave="valor" ordem={ordem} ao={alternar} num>Valor</ThOrd>
                  <ThOrd chave="saldo" ordem={ordem} ao={alternar} num>Saldo</ThOrd>
                  <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                  <th>Ações</th>
                </>}>
          {visiveis.map((c) => (
            <LinhaDeConta key={c.id} conta={c} hoje={hoje} acao={acao}
                          aoMudar={() => { contas.recarregar(); resumo.recarregar(); }} />
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}

// ---------------------------------------------------------------- a linha

function LinhaDeConta(p: {
  conta: ContaAPagar; hoje: Date;
  acao: ReturnType<typeof useAcao>; aoMudar: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  /* [30/09/2026, etapa 4b] CANCELAR PERGUNTA ANTES — até aqui a lixeira cancelava
     no primeiro clique, sem nome e sem volta pela tela. A pergunta mora na
     linha, com o foco em «Manter a conta». */
  const [cancelando, setCancelando] = useState(false);
  const c = p.conta;
  const atrasada = estaAtrasada(c, p.hoje);
  const cancelar = podeCancelar(c);
  const r = recibo(c);
  const pagamentos = c.pagamento ?? [];
  const aceitaPagamento = c.status !== 'paga' && c.status !== 'cancelada';

  async function confirmarCancelamento() {
    setCancelando(false);
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${c.id}/cancelar`, {}));
    if (ok) { p.acao.anunciar('Conta cancelada.'); p.aoMudar(); }
  }

  return (
    <>
      <tr>
        <td>
          {diaEmBr(c.vencimento)}
          {atrasada && <> <Marca selo={SELO_DA_CONTA_A_PAGAR.vencida}>vencida</Marca></>}
        </td>
        <td className="c-id">
          <strong>{nomeDoBeneficiario(c)}</strong>
          <div className="nota">{ROTULO_DO_BENEFICIARIO[c.beneficiario_tipo]}</div>
        </td>
        <td>
          {c.descricao}
          {/* De onde a conta veio importa: a que nasceu do split tem valor
              IMUTÁVEL (PRD §4.4), e quem olha precisa saber por que não há
              como editá-la. [30/09/2026, etapa 4b] «split» saiu da tela: a
              GLOSSARIO.md proíbe a palavra sozinha (colide com o split payment
              tributário), e na tela o nome é «divisão do pagamento». */}
          <div className="nota">{c.origem_split_item_id ? 'nascida da divisão de um pagamento' : 'lançada à mão'}</div>
        </td>
        <td className="num">{emReais(c.valor_centavos)}</td>
        <td className="num c-val">
          <strong>{emReais(saldoCentavos(c))}</strong>
          {/* O RECIBO EM UMA LINHA, e ele é a metade que faltava: até 10/09/2026
              esta tela registrava pagamento e não mostrava nenhum, então depois
              de pagar a única coisa que mudava era este número. Numa conta paga
              em duas vezes, «quando foi a primeira?» não tinha resposta aqui. */}
          {/* 13,5px (o corpo de meta) e nao 11,5: o detector mediu o recibo
              como texto miudo, em dezessete linhas (01/10/2026, etapa 5). */}
          <div className={r.alerta ? 'recibo-da-linha' : 'recibo-da-linha fraco'}>
            {r.alerta && <><Icone nome="aviso_alerta" tamanho={12} /> </>}{r.frase}
          </div>
        </td>
        <td className="c-sit"><Marca selo={SELO_DA_CONTA_A_PAGAR[c.status]}>
          {ROTULO_DO_STATUS[c.status]}
        </Marca></td>
        <td className="c-aco">
          <div style={{ display: 'flex', gap: 6 }}>
            {/* A CONTA PAGA TAMBÉM ABRE, e é o caso que mais se quer olhar: é
                nela que a pergunta «isto já foi pago mesmo, e quando?» aparece.
                O rótulo muda junto — «Pagar» numa conta quitada seria a oferta
                de fazer de novo o que já foi feito. */}
            <button disabled={!aceitaPagamento && pagamentos.length === 0}
                    aria-expanded={abrindo}
                    onClick={() => setAbrindo(!abrindo)}>
              <Icone nome={aceitaPagamento ? 'confirmar' : 'buscar'} tamanho={15} />{' '}
              {aceitaPagamento ? 'Pagar' : 'Ver pagamentos'}
            </button>
            <button disabled={!cancelar.pode || cancelando} title={cancelar.pode ? 'Cancelar a conta' : cancelar.porque}
                    aria-label={cancelar.pode ? `Cancelar a conta de ${nomeDoBeneficiario(c)}` : cancelar.porque}
                    aria-expanded={cancelando}
                    onClick={() => setCancelando(true)}>
              <Icone nome="remover" tamanho={15} />
            </button>
          </div>
        </td>
      </tr>
      {cancelando && (
        <tr className="linha-pergunta">
          <td colSpan={7}>
            <PerguntaNaTela tom="perigo" forma="linha" rotulo="Confirmar o cancelamento da conta"
                            manter="Manter a conta" confirmar="Cancelar a conta" ocupado={p.acao.ocupado}
                            aoManter={() => setCancelando(false)} aoConfirmar={() => void confirmarCancelamento()}>
              Cancelar a conta de <strong>{nomeDoBeneficiario(c)}</strong> ({emReais(c.valor_centavos)})? Ela
              fica registrada como cancelada e sai do que a empresa deve.
            </PerguntaNaTela>
          </td>
        </tr>
      )}
      {abrindo && (
        <tr>
          <td colSpan={7}>
            {pagamentos.length > 0 && <PagamentosDaConta pagamentos={pagamentos} />}
            {aceitaPagamento && (
              <FormularioDePagamento conta={c} acao={p.acao}
                                     aoPagar={() => { setAbrindo(false); p.aoMudar(); }} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------- o que ja foi pago

/**
 * OS PAGAMENTOS JÁ REGISTRADOS.
 *
 * A REFERÊNCIA TEM COLUNA PRÓPRIA, e não é enfeite: é o número do comprovante —
 * o end-to-end do Pix, o documento da TED — e é por ele que alguém confere esta
 * linha contra o extrato do banco. Sem ela, «pago em 03/09» é uma afirmação que
 * não dá para checar em lugar nenhum.
 */
function PagamentosDaConta({ pagamentos }: { pagamentos: readonly PagamentoDaConta[] }) {
  const total = pagamentos.reduce((s, x) => s + x.valor_centavos, 0);
  return (
    <div className="cartao" style={{ margin: '0 0 12px' }}>
      <h3 style={{ marginTop: 0 }}>
        Já pago — {emReais(total)} em {pagamentos.length}{' '}
        {pagamentos.length === 1 ? 'vez' : 'vezes'}
      </h3>
      {/* A "Tabela" da casa desde 01/10/2026 (era um <table> escrito a mão):
          no celular os pagamentos viram cartão como o resto da tela. */}
      <Tabela cabecalho={<><th>Data</th><th className="num">Valor</th><th>Forma</th><th>Comprovante</th><th>Observação</th></>}>
        {pagamentos.map((x) => (
          <tr key={x.id}>
            <td>{emBr(x.data_pagamento)}</td>
            <td className="num c-val"><strong>{emReais(x.valor_centavos)}</strong></td>
            <td>{ROTULO_DA_FORMA[x.forma] ?? x.forma}</td>
            <td>{x.referencia_externa || <span className="fraco">—</span>}</td>
            <td>{x.observacao || <span className="fraco">—</span>}</td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}

// ------------------------------------------------------------ o pagamento

function FormularioDePagamento(p: {
  conta: ContaAPagar; acao: ReturnType<typeof useAcao>; aoPagar: () => void;
}) {
  const saldo = saldoCentavos(p.conta);
  /* O campo já vem com o SALDO, não com o valor da conta: numa conta parcial,
     preencher o valor cheio produziria uma tentativa que o servidor recusa. */
  const [valor, setValor] = useState(() => centavosParaCampo(saldo));
  const [data, setData] = useState(hojeEmSP);
  const [forma, setForma] = useState<FormaDePagamento>('pix');
  const [ref, setRef] = useState('');
  const [obs, setObs] = useState('');

  let centavos = 0;
  let erroDoValor: string | null = null;
  try { centavos = paraCentavos(valor); } catch (e) { erroDoValor = (e as Error).message; }

  const trava = erroDoValor ? { pode: false as const, porque: erroDoValor } : podePagar(p.conta, centavos);

  async function pagar() {
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${p.conta.id}/pagamentos`, {
      data_pagamento: data, valor_centavos: centavos, forma,
      referencia_externa: ref.trim() || null, observacao: obs.trim() || null,
    }));
    if (ok) { p.acao.anunciar('Pagamento registrado.'); p.aoPagar(); }
  }

  return (
    <div className="cartao" style={{ margin: 0 }}>
      <h3 style={{ marginTop: 0 }}>Registrar pagamento — saldo {emReais(saldo)}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Campo rotulo="Valor (R$)" valor={valor} ao={setValor} dica="0,00" />
        <Campo rotulo="Data do pagamento" valor={data} ao={setData} tipo="date" />
        <Campo rotulo="Forma" valor={forma} ao={(v) => setForma(v as FormaDePagamento)}
               opcoes={Object.entries(ROTULO_DA_FORMA).map(([valor, texto]) => ({ valor, texto }))} />
        <Campo rotulo="Referência (end-to-end, comprovante)" valor={ref} ao={setRef}
               dica="opcional — mas única quando informada" />
        <Campo rotulo="Observação" valor={obs} ao={setObs} dica="opcional" />
      </div>
      {!trava.pode && <p className="nota" style={{ marginBottom: 0 }}>{trava.porque}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="primario" disabled={!trava.pode} onClick={pagar}>
          <Icone nome="confirmar" tamanho={15} /> Registrar pagamento
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------- a conta lançada à mão

function FormularioDeConta(p: {
  acao: ReturnType<typeof useAcao>; aoCriar: () => void; aoFechar: () => void;
}) {
  const [f, setF] = useState({
    descricao: '', beneficiario_nome: '', valor: '', competencia: '', vencimento: '',
  });
  const campo = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  let centavos = 0;
  try { centavos = paraCentavos(f.valor); } catch { centavos = 0; }

  const trava = podeCriar({
    descricao: f.descricao, beneficiario_nome: f.beneficiario_nome, valorCentavos: centavos,
    competencia: f.competencia, vencimento: f.vencimento,
  });

  async function criar() {
    const ok = await p.acao.executar(() => api.post('/contas-a-pagar', {
      descricao: f.descricao.trim(), beneficiario_nome: f.beneficiario_nome.trim(),
      valor_centavos: centavos,
      competencia: competenciaISO(f.competencia),
      vencimento: f.vencimento,
    }));
    if (ok) {
      p.acao.anunciar('Conta a pagar lançada.');
      p.aoCriar();
      p.aoFechar();
    }
  }

  return (
    <PainelDeCriar id="nova-despesa" titulo="Nova despesa avulsa" aoFechar={p.aoFechar}>
      <div className="campos">
        <Campo rotulo="Descrição" valor={f.descricao} ao={campo('descricao')} dica="Aluguel do escritório" />
        <Campo rotulo="Quem recebe" porqueDe="pagar-dono" valor={f.beneficiario_nome} ao={campo('beneficiario_nome')} />
        <Campo rotulo="Valor (R$)" valor={f.valor} ao={campo('valor')} dica="0,00" />
        <div>
          <label htmlFor="despesa-mes">Mês de referência</label>
          <CampoData id="despesa-mes" mes valor={f.competencia} ao={campo('competencia')} />
          <AjudaDoMes />
        </div>
        <Campo rotulo="Vencimento" porqueDe="pagar-dono" valor={f.vencimento} ao={campo('vencimento')} tipo="date" />
      </div>
      {/* A frase existe porque a ausência do caminho é a regra, e ausência não
          se explica sozinha — quem procurar "lançar um repasse" precisa achar
          por que não há. */}
      <p className="nota-do-painel">
        Para despesa avulsa — aluguel, serviço, imposto. <strong>Repasse e comissão não se lançam
        aqui:</strong> nascem sozinhos quando o cliente paga, e um segundo caminho lançaria a mesma
        despesa duas vezes para o mesmo beneficiário.
      </p>
      {p.acao.erro && <Aviso tipo="erro">{p.acao.erro}</Aviso>}
      <div className="painel-criar-pe">
        <button className="primario" disabled={!trava.pode || p.acao.ocupado} onClick={() => void criar()}>
          <Icone nome="confirmar" tamanho={15} /> Lançar
        </button>
        <button type="button" onClick={p.aoFechar}>Cancelar</button>
        {!trava.pode && <span className="nota">{trava.porque}</span>}
      </div>
    </PainelDeCriar>
  );
}

/* ================================================ o dinheiro que espera
 *
 * DINHEIRO QUE ENTROU E AINDA NAO VIROU CONTA A PAGAR — o cartao entrou em
 * 08/09/2026 e fecha um vao que era invisivel nesta tela: o banco avisa o
 * pagamento, e o repasse espera a CONFIRMACAO dele. Entre um e outro o dinheiro
 * existe, e esta tela dizia "nada a pagar". Some quando nao ha espera: fila
 * vazia e o estado normal.
 *
 * [30/09/2026, etapa 4a] A EXPLICACAO E DITA UMA VEZ, POR GRUPO. Em cada uma
 * das dezesseis linhas havia tres linhas de prosa — a mesma, dezesseis vezes —,
 * e a tabela passava de uma tela e meia so para repetir que falta o dono. Agora
 * as linhas se agrupam pelo motivo da espera; o cabecalho do grupo diz o que e
 * e como destrava (os dois passos de «falta o dono», com os links), e a linha
 * fica com o estado curto e a acao ou o destino.
 */
function DinheiroParado(p: {
  linhas: readonly RepassePendente[]; ocupado: boolean;
  repartir: (l: RepassePendente) => Promise<void>;
}) {
  const ordenadas = ordenarPelaEspera(p.linhas);
  const grupos = ORDEM_DOS_MOTIVOS
    .map((m) => ({
      motivo: m,
      linhas: ordenadas.filter((l) => motivoDaEspera(l) === m),
      /* O último passo do caminho é o que a LINHA oferece: o dono já existe
         quando alguém chega nela, e o que falta é o vínculo com a usina dela. */
      ultimoPasso: COMO_DESTRAVAR[m]?.[COMO_DESTRAVAR[m]!.length - 1] ?? null,
    }))
    .filter((g) => g.linhas.length > 0);

  return (
    <div className="cartao secao">
      <h2 className="cartao-tit">
        <Icone nome="pode_repartir" tamanho={17} /> Dinheiro recebido que ainda não foi repartido
      </h2>
      <p className="nota">
        {resumoDaEspera(p.linhas).replace(/^./, (c) => c.toUpperCase())}. Somam{' '}
        <strong>{emReais(totalCentavos(p.linhas))}</strong>.
      </p>
      <Tabela cabecalho={<><th>Pago em</th><th>Mês de referência</th><th>Usina</th>
                          <th className="num">Valor</th><th>Situação</th><th>O que fazer</th></>}>
        {grupos.flatMap((g) => [
          <tr key={`grupo:${g.motivo}`} className="grupo-da-tabela">
            <td colSpan={6}>
              <h3>
                <Marca selo={SELO_DA_ESPERA_DO_REPASSE[g.motivo]}>{ROTULO_DO_MOTIVO[g.motivo]}</Marca>
                <span className="fraco">
                  {g.linhas.length} {g.linhas.length === 1 ? 'pagamento' : 'pagamentos'},{' '}
                  {emReais(totalCentavos(g.linhas))}
                </span>
              </h3>
              <p>{EXPLICACAO_DO_MOTIVO[g.motivo]}</p>
              {COMO_DESTRAVAR[g.motivo] && (
                <ol className="grupo-passos">
                  {COMO_DESTRAVAR[g.motivo]!.map((x) => (
                    <li key={x.destino.endereco}>
                      {x.ato} em <Ligacao para={x.destino.endereco}>{x.destino.rotulo}</Ligacao>
                    </li>
                  ))}
                </ol>
              )}
            </td>
          </tr>,
          ...g.linhas.map((l) => (
            <tr key={l.liquidacao_id}>
              <td>{diaEmBr(l.data_liquidacao)}</td>
              <td>{mesEmBr(l.competencia)}</td>
              <td className="c-id">{l.codigo_geradora}</td>
              <td className="num c-val"><strong>{emReais(l.valor_liquidado_centavos)}</strong></td>
              <td className="c-sit"><Marca selo={SELO_DA_ESPERA_DO_REPASSE[g.motivo]}>{ROTULO_CURTO_DO_MOTIVO[g.motivo]}</Marca></td>
              <td className="c-aco">
                {/* A AÇÃO OU O DESTINO: repartir, quando dá; o último passo do
                    caminho, quando é trabalho de alguém; e a frase de que não há
                    nada a fazer, quando o banco é que confirma. */}
                {podeRepartirAgora(l) ? (
                  <button disabled={p.ocupado} onClick={() => void p.repartir(l)}>Repartir agora</button>
                ) : g.ultimoPasso ? (
                  <Ligacao para={g.ultimoPasso.destino.endereco}
                           rotulo={`Vincular em ${g.ultimoPasso.destino.rotulo} o dono da usina ${l.codigo_geradora}`}>
                    Vincular em {g.ultimoPasso.destino.rotulo}
                  </Ligacao>
                ) : (
                  <span className="nota">O sistema reparte sozinho</span>
                )}
              </td>
            </tr>
          )),
        ])}
      </Tabela>
      <DetalheTecnico>
        <p className="nota">
          A lista vem de <code>GET /liquidacoes/pendentes-de-split</code>: liquidações sem
          execução de repasse. «Aguardando o banco confirmar» é baixa de origem
          <code> webhook_sicoob</code>, que a Sicoob define como intenção de pagamento — a
          consulta ativa diária confirma e reparte (Q-BAIXAOPER-01). «Falta o dono» é a R12.
        </p>
      </DetalheTecnico>
    </div>
  );
}
