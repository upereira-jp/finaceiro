// A TELA DE PRONTIDAO, e ela e a primeira de propósito.
//
// Hoje o sistema nao consegue emitir uma fatura, e o motivo nao e codigo: sao
// quatro camadas de cadastro vazias. Esta tela e o mesmo `--prontidao` do
// script, com a mesma disciplina: mostra as doze camadas, com dono nomeado, e
// nao decide nenhuma.
//
// `nao_medido` E AMARELO E NAO VERDE. Tres camadas tem por universo as UCs
// CONTRATADAS; com zero contratos o universo e vazio, e pintar "0 de 0" de verde
// seria o relatorio autorizando o que nao conferiu. Foi um defeito real, achado
// rodando contra producao em 28/07.
//
// E DESDE 19/08/2026 CADA LINHA DIZ ONDE SE RESOLVE, a pedido do dono. A tela
// dizia com precisao O QUE falta e DE QUEM e, e deixava o CAMINHO implicito -
// quem opera tinha de saber de cabeca que a tarifa e coluna da aba Unidades
// desde 14/08 (antes era a aba Tarifas, que saiu), que o documento so ganhou
// tela em 17/08, e que geracao nao tem tela porque e espelhada do CRM.
//
// Caminho implicito e o MESMO defeito que esta tela existe para combater: a
// triagem dizia `sem_contrato_vigente` e nao dizia que atras havia mais tres
// camadas vazias. O mapa mora em `destino-da-camada.ts`, `.ts` puro e com suite
// propria (regra 8), e ele conta duas verdades que a tela nao inventa: a de que
// ha tela, e a de que NAO ha - geracao e regra de comissao nao tem formulario, e
// a coluna diz isso em vez de desenhar um link para lugar nenhum.

import { useEffect, useState } from 'react';
import {
  api, ErroDaApi,
  type Camada, type ExecucaoDoConector, type Automacao,
} from '../api.ts';
import { useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Marca, Carregando, CampoData, AjudaDoMes, Icone, DetalheTecnico, Recolhido,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { DESTINO_DA_CAMADA, enderecoDoDestino, telaDoDestino } from '../destino-da-camada.ts';
import { estadoDoCertificado } from '../cobranca-regras.ts';
import { CorpoDaSaude } from '../saude-corpo.tsx';
import { FaixasDasAutomacoes, PainelDasAutomacoes } from '../automacoes-corpo.tsx';
import type { NivelDoAviso } from '../saude-do-dinheiro.ts';
import type { TomDoSelo } from '../iconografia.ts';
import {
  VERBETE_DA_CAMADA, SITUACAO,
  agruparPorEfeito, tituloDoGrupo, subDoGrupo, contagemDaCamada, aindaEmAberto, jaFechadas,
  mesPorExtenso,
} from '../vocabulario.ts';
import { CorpoDoRoteiro } from '../roteiro-corpo.tsx';
import { mesNoFunil } from '../roteiro-do-mes.ts';
import { useLeiturasDoMes, procurarMesDoTrabalho, armazemDoNavegador } from '../leitura-do-mes.ts';
import { fraseDaOrigem, lembrarMes, type EscolhaDoMes } from '../emissao-regras.ts';
import { mesDaQuery } from '../dinheiro.ts';
import { abrirAjuda } from '../ajuda-gatilho.tsx';

/**
 * A SITUAÇÃO DA LINHA -> o tom do selo. [30/09/2026, etapa 4a] Até aqui a tela
 * passava `c.situacao` direto como tom, e `pendente` era o vermelho: «Falta
 * preencher» saía na mesma tinta de «Recusada pelo banco». Faltar cadastro é
 * TAREFA — âmbar, com o lápis —, e o vermelho ficou para a falha (`TomDoSelo`).
 */
const TOM_DA_SITUACAO: Record<string, TomDoSelo> = {
  ok: 'ok', pendente: 'a_fazer', nao_medido: 'nao_medido',
};

/* ==========================================================================
 * A SAUDE DO CAMINHO DO DINHEIRO, no alto da PRIMEIRA tela
 * ==========================================================================
 *
 * ELA E O SEGUNDO DOS DOIS CANAIS, e ate 09/09/2026 nao havia canal nenhum. Os
 * alertas do A1 e do aviso de pagamento chegavam ao journal do systemd e a tela
 * de **Cobranca** — e a de Cobranca e a pior das duas para isso: e a tela de
 * CONFIGURAR o banco, aberta uma vez por trimestre. O alerta morava na tela que
 * ninguem abre.
 *
 * O outro canal e a unidade `financeiro-saude-cobranca`, que fica vermelha em
 * `systemctl list-units --failed`. Ela cobre quando NINGUEM esta olhando; esta
 * faixa cobre quando alguem esta.
 *
 * ⚠️ NENHUM ERRO SOBE, e a regra e a mesma da vizinha em `cobranca.tsx`, um
 * degrau mais forte: a Sicoob fora do ar nao pode derrubar a PRIMEIRA tela do
 * sistema — a que a operacao usa para saber o que fazer hoje. Falha vira
 * `nao_verificavel`, que e o que ela e, e o 412 ("nao ha conector") vira
 * `sem_conector`, que nao gera faixa nenhuma.
 *
 * E ELA NAO BLOQUEIA A TELA: sao dois `useDados` proprios, entao a tabela das
 * camadas renderiza no tempo dela, sem esperar o handshake mTLS com o banco.
 *
 * POR QUE NAO HA CACHE, e a pergunta e legitima depois do §2 da retomada de
 * 09/09 — o diagnostico foi tirado da fila de 5 minutos justamente por discar a
 * Sicoob 288 vezes por dia. A diferenca e a natureza de quem chama: la era um
 * TIMER, aqui e uma PESSOA abrindo uma tela. A cadencia e humana e limitada por
 * construcao, e a leitura so acontece na montagem (o `useDados` nao faz polling).
 * Se um dia isso deixar de ser verdade, o lugar do cache e o servidor, e nao aqui.
 */
type CertificadoNaTela = { dias: number | null; expira_em: string | null } | null;

const certificadoOuNada = async (): Promise<CertificadoNaTela> => {
  try {
    return await api.get<{ dias: number | null; expira_em: string | null }>(
      '/conector-cobranca/certificado');
  } catch (e) {
    /* O 412 e RESPOSTA ("nao ha conector"), nao falha de leitura — mesma
     * distincao de `cobranca.tsx`. Aqui os dois casos caem no mesmo `null`
     * porque `sem_conector` e `nao_medido` nao geram faixa nem um nem outro:
     * o que esta tela nao pode e inventar alarme sobre um banco que ninguem
     * ligou. Ver `faixasDaSaude`. */
    void (e instanceof ErroDaApi);
    return null;
  }
};

/** `sem_conector` vem do servidor como campo proprio, e nao como um quinto
 *  nivel — ver o comentario da rota. Ele e o que impede esta tela de acusar
 *  ambar para sempre numa instalacao que ainda nao ligou banco nenhum.
 *
 *  Falha de leitura vira `sem_conector: false` + `nao_verificavel`: e a leitura
 *  honesta dos dois casos juntos, porque a tela PERGUNTOU e nao soube. O unico
 *  silencio autorizado e o de quem nao tem banco. */
type LeituraDoAviso = { sem_conector: boolean; nivel: NivelDoAviso };

const avisoOuNaoVerificavel = async (): Promise<LeituraDoAviso> => {
  try {
    return await api.get<LeituraDoAviso>('/conector-cobranca/aviso-pagamento');
  } catch {
    return { sem_conector: false, nivel: 'nao_verificavel' };
  }
};

function SaudeDoDinheiro() {
  const cert = useDados<CertificadoNaTela>(certificadoOuNada);
  const aviso = useDados<LeituraDoAviso>(avisoOuNaoVerificavel);

  /* SEM CONECTOR NAO GERA FAIXA NENHUMA, nem do A1 nem do aviso: nao ha banco
   * ligado, entao nao ha caminho do dinheiro sobre o qual alarmar. Enquanto a
   * leitura nao voltar (`aviso.dado === null`), `temConector` tambem e falso —
   * uma faixa que pisca vermelho durante o carregamento e ruido, e o custo de
   * esperar um segundo e zero. */
  const temConector = aviso.dado != null && !aviso.dado.sem_conector;

  /* O QUE FICOU AQUI E SO A BUSCA; QUEM DESENHA E `CorpoDaSaude`, e a separacao
   * existe para o desenho poder ser MONTADO num teste. `renderToStaticMarkup`
   * nao roda efeito: enquanto a faixa vivia inteira aqui, qualquer render de
   * prova saia vazio, e vazio e exatamente o sintoma do defeito que se queria
   * pegar. Ver o cabecalho de `saude-corpo.tsx`. */
  return (
    <CorpoDaSaude
      certificado={estadoDoCertificado({ temConector, dias: cert.dado?.dias ?? null })}
      aviso={temConector ? aviso.dado!.nivel : null}
    />
  );
}

export function TelaProntidao() {
  /*
   * O MÊS EM QUE A TELA ABRE — desde 30/09/2026 (etapa 4a), o MESMO da tela
   * Cobranças: o do endereço (`?mes=`), senão o mais recente com trabalho
   * (cobrança por emitir ou sem boleto no banco), senão o último escolhido,
   * senão o mais recente com cobrança, senão o de hoje. A procura é uma só
   * (`procurarMesComTrabalho`), e a frase ao lado do seletor diz por que a tela
   * está nele. Até esta data a tela abria no mês de HOJE — e o mês de hoje
   * costuma estar vazio justamente quando o trabalho está no anterior.
   */
  const [escolha, setEscolha] = useState<EscolhaDoMes | null>(() => {
    const q = mesDaQuery(location.search);
    return q ? { mes: q, origem: 'endereco' } : null;
  });
  const mes = escolha?.mes ?? null;
  const escolherMes = (v: string) => {
    /* Campo apagado não é mês: a tela fica no que estava, como em Cobranças. */
    if (!/^\d{4}-\d{2}$/.test(v)) return;
    setEscolha({ mes: v, origem: 'escolhido' });
    lembrarMes(armazemDoNavegador(), v);
  };

  /* AS CINCO LEITURAS DO MÊS, num gancho só desde 30/09/2026: a prontidão (o
   * cadastro e a conta lida), a carteira do mês, as cobranças do mês, as contas
   * registradas e as cobranças sem boleto. A Central de Ajuda usa o MESMO gancho
   * — é o que faz a frase do estado do mês ser a mesma nos dois lugares. Cada
   * uma falha sozinha, e o passo que dependia dela diz «não medido». Com o mês
   * ainda sendo procurado (`null`), só as duas que atravessam meses saem — e a
   * das cobranças sem boleto é justamente a que a procura lê primeiro. */
  const leituras = useLeiturasDoMes(mes);
  const { dado, carregando, erro } = leituras.prontidao;

  useEffect(() => {
    if (escolha || leituras.semBoleto.carregando) return;
    let vivo = true;
    void procurarMesDoTrabalho(leituras.semBoleto.dado?.linhas ?? []).then((e) => { if (vivo) setEscolha(e); });
    return () => { vivo = false; };
  }, [escolha, leituras.semBoleto.carregando]);

  /* AS TRES RODADAS AUTOMATICAS, LIDAS UMA VEZ SO e desenhadas em dois lugares:
   * o alarme no alto, junto das faixas do caminho do dinheiro, e a afirmacao no
   * rodape. Duas chamadas dariam duas respostas possiveis para a mesma pergunta
   * na mesma tela.
   *
   * ELA NAO DEPENDE DO MES: as camadas dizem o que falta para ESTE mes fechar;
   * isto diz se o sistema esta trabalhando, e trocar o mes no seletor nao muda a
   * resposta - por isso a leitura nao tem `[mes]` nas dependencias.
   *
   * E NAO BLOQUEIA A TELA, pelo mesmo motivo da faixa vizinha: e `useDados`
   * proprio, entao a tabela das camadas renderiza no tempo dela. */
  const automacoes = useDados<Automacao[]>(() => api.get('/automacoes'));

  /*
   * A FAIXA «N FATURAS EMITIDAS ESTÃO SEM BOLETO» SAIU DESTA TELA EM 30/09/2026,
   * e o que ela dizia não se perdeu: mudou de lugar. O passo 4 do funil carrega
   * o mesmo número e a mesma recusa, e ganha o destaque quando é ele que tem
   * risco no mês; o de OUTROS meses virou o aviso com link logo abaixo da frase
   * do mês (etapa 4a). A lista inteira continua na tela Cobranças.
   */
  const funil = leituras.leitura ? mesNoFunil(leituras.leitura) : null;

  const naoMedidas = dado?.camadas.filter((c) => c.situacao === 'nao_medido').length ?? 0;

  /*
   * A TELA MOSTRA PENDENCIA. Decisao do dono em 10/09/2026: *"deixe as
   * pendencias que nao foram resolvidas apenas"*. O que fica fechado NAO SOME:
   * "0 de 29" numa conferencia fechada e PROVA de que ela foi medida, e por isso
   * as fechadas ficam a UM clique, com a contagem sempre visivel. `nao_medido`
   * continua na lista de cima: "ainda nao da para conferir" nao e pronto.
   */
  const [verFechadas, setVerFechadas] = useState(false);
  const fechadas = jaFechadas(dado?.camadas ?? []);
  const emAberto = aindaEmAberto(dado?.camadas ?? []);

  return (
    /*
      O TÍTULO É O NOME DA ABA, e a aba se chama «Mês» desde 30/09/2026 (antes
      «Pendências», e antes «Prontidão para faturar»): quem clica numa palavra
      tem de chegar na mesma palavra. «Prontidão» continua sendo o nome do
      CÁLCULO no servidor (`repos/prontidao.ts`); aqui vale o nome da barra.
    */
    <Pagina titulo="Mês"
            sub="Em que passo está cada unidade do mês, e o que o cadastro ainda trava.">
      {/* O MÊS PRIMEIRO, com o porquê de a tela estar nele — o mesmo bloco da
          tela Cobranças, pela mesma razão: abrir em agosto com setembro no
          calendário parece defeito se a tela não disser por quê. */}
      <div className="cartao secao em-mes">
        <div className="em-mes-campo">
          <label>Mês de referência</label>
          {mes
            ? <CampoData mes valor={mes} ao={escolherMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} />
            : <span className="em-mes-procurando">Procurando…</span>}
          <AjudaDoMes />
        </div>
        {escolha && escolha.origem !== 'escolhido' && (
          <p className="em-mes-porque" role="status">
            <Icone nome="calendario" tamanho={15} />
            <span>{fraseDaOrigem(escolha.origem)}</span>
          </p>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* ANTES DO FUNIL, e de proposito. O funil diz o que falta fazer no mes;
          esta faixa diz se o que ja foi faturado consegue ser cobrado e baixado.
          E a pergunta mais alta das duas, e so aparece quando ha o que dizer. */}
      <SaudeDoDinheiro />
      {/* LOGO ABAIXO DA VIZINHA: a de cima diz que o caminho do dinheiro esta
          quebrado; esta diz que o sistema parou de andar por ele. */}
      <FaixasDasAutomacoes rodadas={automacoes.dado} />
      {/* "Conferindo o mês" e nao "Contando as camadas", desde 21/08/2026:
          "camada" e nome da estrutura interna do relatorio. */}
      {(carregando || !mes) && <Carregando texto={mes ? 'Conferindo o mês…' : 'Procurando o mês com trabalho…'} />}

      {dado && (
        <>
          {/*
            O FUNIL É O HERÓI DESTA TELA (etapa 4a). Ele responde «o que eu faço
            agora, e como» — a pergunta de quem abriu o sistema para trabalhar —
            e tudo o que vem abaixo dele ficou mais quieto: a lista do cadastro
            sem prosa por linha, e as duas seções de conferência recolhidas.

            OS TRÊS CARTÕES «Pode faturar / emitir boleto / repartir» SAÍRAM, com
            os de «Unidades a faturar» e «O que ainda falta». Repetiam em sim e
            não a linha de cadastro do funil, e em número a contagem da lista
            logo abaixo — três lugares dizendo a mesma coisa em três formas. O
            «não» de cada um continua visível: é o GRUPO da lista que aparece
            («Para gerar as faturas», «Para o boleto sair», «Para dividir o
            dinheiro»), e grupo só aparece com linha em aberto.

            A LOGICA E `roteiro-do-mes.ts`, `.ts` puro com suite propria (regra 8),
            e quem desenha e `roteiro-corpo.tsx`, que recebe tudo por propriedade.
          */}
          <CorpoDoRoteiro
            competencia={mesPorExtenso(dado.competencia) || mes}
            {...leituras.leitura!}
          />

          {/*
            A LINHA DE ESTADO DA LISTA, e ela não repete o funil: diz quantas
            conferências estão em aberto e quantas já fecharam — com o «ver
            quais» que era um parágrafo embaixo da tabela — e leva o «Como ler
            esta tela», que saiu da página e virou assunto da Central de Ajuda.
          */}
          <div className="mes-lista-cab">
            <h2>Conferências do mês</h2>
            <p className="mes-lista-estado">
              <span>
                <strong>{emAberto.length}</strong> em aberto de {dado.camadas.length}
                {naoMedidas > 0 && <>, {naoMedidas} ainda sem conferir</>}
                {fechadas.length > 0 && (
                  <>
                    {'. '}<strong>{fechadas.length}</strong> {fechadas.length === 1 ? 'já fechada' : 'já fechadas'}{' '}
                    <button type="button" className="em-link" aria-expanded={verFechadas}
                            onClick={() => setVerFechadas(!verFechadas)}>
                      {verFechadas ? 'esconder as fechadas' : 'ver quais'}
                    </button>
                  </>
                )}
              </span>
              <button type="button" className="em-link mes-como-ler" onClick={() => abrirAjuda('o-que-e-pendencia')}>
                <Icone nome="ajuda" tamanho={14} /> Como ler esta lista
              </button>
            </p>
          </div>

          {/*
            AS LINHAS ENTRAM AGRUPADAS desde 24/08/2026, a pedido do dono, e o
            agrupamento não classifica nada de novo: `efeito` já vem do servidor.

            [30/09, etapa 4a] A EXPLICAÇÃO MORA NO CABEÇALHO DO GRUPO, UMA VEZ SÓ.
            Até aqui cada linha trazia 120 a 260px de prosa — o que falta, em
            frase, e a consequência — e a coluna «Efeito» repetia, linha a linha,
            o título do grupo em que ela estava. A coluna saiu; a linha ficou com
            o fato curto: o que falta, quantas e onde resolver. A consequência
            de cada uma continua a um clique, no «ver detalhe técnico», e na
            Central de Ajuda.

            UMA TABELA SÓ, e não três: as colunas são as mesmas e três tabelas
            desalinhariam «Quantos», que é a coluna que se compara de relance.
          */}
          <Tabela cabecalho={<><th>O que falta</th><th>Situação</th><th className="num">Quantos</th><th>Onde resolver</th></>}
                  vazio={
                    /* A LISTA VAZIA AQUI E BOA NOTICIA, e por isso ela FALA — com a
                       frase do mês, a mesma do alto da tela e da Central de Ajuda. */
                    <>Nenhuma conferência em aberto: as <strong>{fechadas.length}</strong> fecharam.
                    {' '}{funil?.frase}</>
                  }>
            {agruparPorEfeito(verFechadas ? dado.camadas : emAberto).flatMap((g) => [
              <tr key={`grupo:${g.chave}`} className="grupo-da-tabela">
                <td colSpan={4}>
                  <h3>{tituloDoGrupo(g.chave, dado.competencia)}</h3>
                  <p>{subDoGrupo(g.chave, dado.ucs_ativas)}</p>
                </td>
              </tr>,
              ...g.camadas.map((c) => (
                <tr key={c.camada}>
                  <td><OQueFalta camada={c} /></td>
                  <td>
                    <Marca tom={TOM_DA_SITUACAO[c.situacao] ?? 'nao_medido'}>
                      {SITUACAO[c.situacao]?.curto ?? c.situacao}
                    </Marca>
                  </td>
                  {/* O SUBSTANTIVO ENTROU EM 24/08/2026: o mesmo `X de Y`
                      significava seis coisas nesta coluna. */}
                  <td className="num">
                    {c.situacao === 'nao_medido' ? '—' : <>
                      {c.faltam} de {c.total}{' '}
                      <span className="fraco" style={{ fontSize: 12, fontWeight: 500 }}>
                        {contagemDaCamada(c.camada, c.total)}
                      </span>
                    </>}
                  </td>
                  <td><OndeResolver camada={c.camada} situacao={c.situacao} /></td>
                </tr>
              )),
            ])}
          </Tabela>

          <SinaisDoConector />
        </>
      )}

      {/* FORA DO `{dado && ...}` DE PROPOSITO. O painel responde "o sistema esta
          trabalhando?", e essa resposta nao pode depender de a leitura do MES ter
          dado certo. [30/09, etapa 4a] Recolhido, com o resumo de uma linha. */}
      <PainelDasAutomacoes rodadas={automacoes.dado} erro={automacoes.erro} />
    </Pagina>
  );
}

/**
 * O QUE FALTA — o nome, e o resto atrás de um clique.
 *
 * [30/09/2026, etapa 4a] A LINHA FICOU COM O FATO CURTO. Até aqui a superfície
 * trazia o nome, a frase do que falta e a CONSEQUÊNCIA — 120 a 260px de prosa
 * por linha, e a consequência de cada linha repetia em outras palavras o que o
 * cabeçalho do grupo já dizia. O nome e o «Quantos» ao lado dizem o que falta e
 * quantas; a explicação do que o grupo trava mora no cabeçalho dele, uma vez.
 *
 * NADA FOI JOGADO FORA — a decisão do dono de 21/08 continua valendo: «esconder,
 * não remover». A frase e a consequência de cada linha abrem primeiro no
 * «ver detalhe técnico», e atrás delas o texto de engenharia que o servidor manda
 * (`c.explicacao`, o dono, a questão e o comando em lote), como antes.
 */
function OQueFalta({ camada: c }: { camada: Camada }) {
  const v = VERBETE_DA_CAMADA[c.camada];
  const d = DESTINO_DA_CAMADA[c.camada];

  return (
    <div className="mes-oque">
      {/* Sem verbete, cai no nome cru: feio e honesto. A suíte `ajuda.ts` (A5)
          impede que chegue aqui. */}
      <strong>{v?.titulo ?? c.camada}</strong>

      {/* O TOGGLE É O `DetalheTecnico` DO `ui.tsx` desde 21/08/2026: um padrão
          que cada tela reimplementa é um padrão que a maioria não implementa. */}
      <DetalheTecnico>
        {v && (
          <p style={{ margin: '0 0 6px' }}>
            {v.simples}{' '}
            {/* A consequência só em quem ainda não fechou: numa linha resolvida
                ela seria um aviso sobre um problema que não há. */}
            {c.situacao !== 'ok' && v.consequencia}
          </p>
        )}
        <p style={{ margin: '0 0 6px' }}>{c.explicacao}</p>
        {d?.nota && <p style={{ margin: '0 0 6px' }}>{d.nota}</p>}
        {d?.caminho && (
          <p style={{ margin: '0 0 6px' }}>
            Para a carteira inteira de uma vez: <code>{d.caminho}</code>
          </p>
        )}
        <p style={{ margin: 0 }}>
          Responsável: {c.dono}{c.questao && <> · questão {c.questao}</>} · chave <code>{c.camada}</code>
        </p>
      </DetalheTecnico>
    </div>
  );
}

/**
 * ONDE A CAMADA SE RESOLVE — o link, o caminho em lote e a ressalva.
 *
 * O QUE ELE MOSTRA MUDA COM O ESTADO, e as tres respostas sao diferentes:
 *
 *   `ok`          "Fechada". Uma chamada para a ação numa camada resolvida
 *                 mandaria alguém digitar o que já está digitado — e a tela
 *                 passaria a pedir trabalho que ela mesma diz não existir;
 *   sem `rota`    o rótulo diz **não há tela**, e o caminho real aparece do
 *                 lado. Duas camadas caem aqui, e as duas por decisão registrada:
 *                 geração é espelho do CRM (regra 4) e regra de comissão é
 *                 decisão com dono. Desenhar link para elas seria mandar
 *                 procurar um formulário que não existe;
 *   com `rota`    o link, com o ícone e o nome que a barra de navegação já usa
 *                 para aquela aba — quem conhece a barra reconhece o destino
 *                 antes de ler o rótulo.
 *
 * `nao_medido` LEVA LINK IGUAL A `pendente`, e isso é deliberado: universo vazio
 * quase sempre se destrava uma camada acima, e a nota de cada destino diz qual.
 * Esconder o caminho de quem não foi medido deixaria a linha sem saída.
 */
function OndeResolver({ camada, situacao }: Pick<Camada, 'camada' | 'situacao'>) {
  const d = DESTINO_DA_CAMADA[camada];

  // Camada nova no servidor sem destino aqui. A suite pega isso lendo
  // `src/repos/prontidao.ts` (D1), então na prática não acontece — mas a tela
  // não pode quebrar por uma linha a mais no relatório.
  if (!d) return <span className="fraco">—</span>;
  /* NADA, E NAO "Fechada", desde 24/08/2026. A coluna "Situacao" da mesma linha
     ja diz "Pronto"; duas palavras para o mesmo estado, lado a lado, fazem
     procurar a diferenca entre elas — e nao ha nenhuma. O travessao e a mesma
     convencao que a coluna "Quantos" ja usa para "nao ha o que mostrar". */
  if (situacao === 'ok') return <span className="fraco">—</span>;

  const endereco = enderecoDoDestino(d);
  const tela = telaDoDestino(d);

  /*
   * A NOTA E O COMANDO SAÍRAM DAQUI em 21/08 e foram para o «detalhe técnico» da
   * primeira coluna. A razão é que esta coluna passou a ter UM trabalho — dizer
   * para onde ir — e ela o fazia embaixo de sessenta palavras de ressalva, com
   * `npm run documentos` no meio. Quem chega amanhã não roda comando nenhum.
   *
   * Nada se perdeu de lugar nenhum: os dois continuam na tela, a um clique, e
   * agora ao lado do resto do texto de engenharia em vez de espalhados por duas
   * colunas.
   */
  return (
    <div style={{ maxWidth: 260 }}>
      {endereco && tela ? (
        <Ligacao para={endereco}
                 rotulo={`${d.rotulo} — abre a aba ${tela.titulo}`}
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Icone nome={tela.icone} tamanho={16} /> {d.rotulo}
        </Ligacao>
      ) : (
        <>
          <strong>{d.rotulo}</strong>
          {d.caminho && (
            <div className="fraco" style={{ fontSize: 12, marginTop: 4 }}>
              O caminho é <code>{d.caminho}</code>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================================================== o que o conector achou
 *
 * A TELA RESPONDIA «o que falta?» E NAO «o que aconteceu?», e a segunda pergunta
 * tinha resposta gravada no banco a cada 15 minutos sem ninguem para ler.
 *
 * `conector_execucao` recebe os contadores do ciclo e um `detalhe` com as
 * divergencias, as recusas e a fila de revisao. Varredura de 08/09/2026: ZERO
 * ocorrencias da tabela em `src/http/rotas.ts`, em `src/repos/` e em `web/`. A
 * `SPEC-002` invariante 8 diz que *"`recusados > 0` e visivel em tabela, nunca
 * so em log"* — e "visivel" queria dizer visivel para quem abrisse o `psql`.
 *
 * POR QUE ELE MORA AQUI, e nao numa tela propria: quem abre Pendencias esta
 * perguntando o que impede o mes de fechar, e uma divergencia do conector e
 * exatamente isso, so que vinda do outro lado — nao e um campo vazio, e um campo
 * que discorda. Uma tela nova seria mais um lugar para lembrar de olhar.
 *
 * O QUE ELE NAO FAZ: nao resolve nada. Toda correcao de dado espelhado acontece
 * no CRM, que e o dono dele — e o proprio sinal diz qual registro olhar.
 */
function SinaisDoConector() {
  const execucoes = useDados<ExecucaoDoConector[]>(() => api.get('/conector-execucao?limite=1'));
  const ultima = execucoes.dado?.[0];

  if (execucoes.erro) {
    return <Aviso tipo="alerta">Não foi possível ler o que o conector achou: {execucoes.erro}</Aviso>;
  }
  if (!ultima) return null;

  const sinais = [
    ...ultima.recusas.map((x) => ({ ...x, tipo: 'recusa' as const })),
    ...ultima.fila_de_revisao.map((x) => ({ ...x, tipo: 'revisão' as const })),
    ...ultima.divergencias.map((x) => ({ ...x, tipo: 'divergência' as const })),
  ];
  const quando = new Date(ultima.terminado_em ?? ultima.iniciado_em);
  const relogio = `${String(quando.getHours()).padStart(2, '0')}:${String(quando.getMinutes()).padStart(2, '0')}`;

  /* O RESUMO DE UMA LINHA, e ele é o que se lê com a seção fechada (30/09/2026,
     etapa 4a): quando foi a última leitura, quanto ela leu e quantos
     apontamentos há — com a recusa nomeada à parte, porque é a única que impede. */
  const resumo = (
    <>
      Última leitura às {relogio}: {ultima.lidos} {ultima.lidos === 1 ? 'registro lido' : 'registros lidos'}
      {sinais.length === 0
        ? ', nada a apontar.'
        : <>, {sinais.length} {sinais.length === 1 ? 'apontamento' : 'apontamentos'}
            {ultima.recusados > 0 && <> ({ultima.recusados} {ultima.recusados === 1 ? 'recusa' : 'recusas'})</>}.</>}
    </>
  );

  return (
    <>
      {/* AS FALHAS DO CONECTOR FICAM FORA DO RECOLHIDO, e é de propósito: conector
          caído é uma das quatro coisas que são vermelhas no sistema, e alarme
          não se guarda atrás de um clique. */}
      {ultima.erro && <Aviso tipo="erro">A última leitura do outro sistema terminou mal: {ultima.erro}</Aviso>}
      {ultima.garantia_de_tenant_degradada && (
        <Aviso tipo="erro">
          A leitura do outro sistema rodou por um caminho degradado de separação entre empresas. Não é
          para acontecer, e precisa ser olhado antes de confiar no que veio.
        </Aviso>
      )}
      {ultima.views_ausentes.length > 0 && (
        <Aviso tipo="erro">
          O outro sistema deixou de expor: {ultima.views_ausentes.join(', ')}. Enquanto isso durar,
          o que vinha de lá não está chegando.
        </Aviso>
      )}

      {/*
        RECOLHIDA, COM O RESUMO À VISTA (30/09/2026, etapa 4a). Aberta, esta
        seção eram quatro linhas de prosa sobre recusa e divergência e um segundo
        «ver quais» — lida por todo mundo, toda vez, embaixo do funil. Ela existe
        para ser CONFERIDA, e o resumo diz se há o que conferir.
      */}
      <Recolhido icone="recarregar" titulo="O que a leitura do outro sistema achou" resumo={resumo}>
        {ultima.credito_conferido === false && (
          <Aviso tipo="alerta">
            O sistema não conseguiu conferir quem vendeu cada unidade nesta leitura — a comparação
            abaixo pode estar incompleta.
          </Aviso>
        )}
        <p className="sub" style={{ marginBottom: 0 }}>
          A cada 15 minutos o sistema relê o outro e compara: {ultima.lidos} lidos
          {ultima.criados > 0 && <>, {ultima.criados} criados</>}
          {ultima.atualizados > 0 && <>, {ultima.atualizados} atualizados</>}
          {ultima.recusados > 0 && <>, {ultima.recusados} recusados</>}.{' '}
          {/*
            ⚠️ A RECUSA IMPEDE E A DIVERGÊNCIA NÃO, e a frase diz as duas coisas
            desde 10/09/2026: uma unidade foi recusada a cada 15 minutos DESDE O
            DIA 4 — 519 vezes — sob um texto que mandava corrigir «no outro, que é
            o dono do dado». Naquele caso o outro sistema já estava certo: o que
            estava velho era o vínculo daqui, e a saída é na linha da unidade.
          */}
          {ultima.recusados > 0 && (
            <>
              As <strong>recusas</strong> impedem: a linha recusada não foi gravada. Quando for de
              unidade que trocou de contrato, abra a linha dela em Unidades consumidoras e confira o
              vínculo.{' '}
            </>
          )}
          As <strong>divergências</strong> não impedem nada: a correção é feita no outro sistema, que
          é o dono do dado.
        </p>
        {sinais.length > 0 && (
          <Tabela cabecalho={<><th>Tipo</th><th>Registro</th><th>O que o sistema achou</th></>}>
            {sinais.slice(0, 60).map((x, i) => (
              <tr key={`${x.entidade}-${x.chave}-${i}`}>
                <td>
                  {/* A recusa é falha (a linha não foi gravada); a divergência
                      e a revisão são coisa a olhar. */}
                  <Marca tom={x.tipo === 'recusa' ? 'erro' : 'nao_medido'}>{x.tipo}</Marca>
                </td>
                <td><span className="fraco">{x.entidade}</span> {x.chave}</td>
                <td>{x.sinal}</td>
              </tr>
            ))}
          </Tabela>
        )}
        {sinais.length > 60 && <p className="sub">Mostrando os 60 primeiros de {sinais.length}.</p>}
      </Recolhido>
    </>
  );
}
