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

import { useState } from 'react';
import {
  api, ErroDaApi,
  type Camada, type Prontidao, type ExecucaoDoConector, type Automacao, type PosicaoDaCarteira,
} from '../api.ts';
import { useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Marca, Kpi, KpiSimNao, Carregando, CampoData, AjudaDoMes, Icone,
  DetalheTecnico,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { competenciaISO } from '../dinheiro.ts';
import { DESTINO_DA_CAMADA, enderecoDoDestino, telaDoDestino } from '../destino-da-camada.ts';
import { estadoDoCertificado } from '../cobranca-regras.ts';
import { CorpoDaSaude } from '../saude-corpo.tsx';
import { FaixasDasAutomacoes, PainelDasAutomacoes } from '../automacoes-corpo.tsx';
import { FaixaDaEmissao } from '../emissao-travada-corpo.tsx';
import type { EmissaoTravadaNaTela } from '../emissao-travada.ts';
import type { NivelDoAviso } from '../saude-do-dinheiro.ts';
import {
  VERBETE_DA_CAMADA, EFEITO, SITUACAO,
  agruparPorEfeito, tituloDoGrupo, subDoGrupo, contagemDaCamada, aindaEmAberto, jaFechadas,
  mesPorExtenso,
} from '../vocabulario.ts';
import { CorpoDoRoteiro } from '../roteiro-corpo.tsx';

const mesAtual = () => new Date().toISOString().slice(0, 7);

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
  const [mes, setMes] = useState(mesAtual);
  const { dado, carregando, erro } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mes)}/prontidao`), [mes]);

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

  /* O QUE NAO CHEGOU AO BANCO — a mesma disciplina da leitura acima: nao depende
   * do mes do seletor. A pergunta e "ha cliente sem boleto?", e ela vale para a
   * carteira inteira: uma fatura de MAI que nunca virou boleto continua sendo
   * dinheiro parado em SET, e trocar o mes aqui a esconderia.
   *
   * A FAIXA CONTA E NAO LISTA. A lista mora na aba de emissao e cobranca, que e
   * onde se age sobre ela; esta faixa existe para ninguem precisar abrir aquela
   * tela para descobrir que precisa abri-la. */
  const emissao = useDados<EmissaoTravadaNaTela>(() => api.get('/emissao/travada'));

  /* A POSICAO DO MES, para o roteiro poder dizer QUANTAS ja foram geradas,
   * emitidas e pagas. Ela DEPENDE do mes, ao contrario das duas leituras acima:
   * a pergunta e sobre esta competencia, e so sobre ela.
   *
   * `/carteira` devolve uma LISTA (ate 12 competencias); com o filtro ela volta
   * com zero ou uma linha, e zero e a resposta legitima do mes em que nada foi
   * gerado ainda. `?? null` deixa o roteiro dizer "esperando" em vez de "feito"
   * enquanto a leitura nao chega — nada e afirmado sem medida. */
  const carteira = useDados<PosicaoDaCarteira[]>(
    () => api.get(`/carteira?competencia=${competenciaISO(mes)}`), [mes]);

  const naoMedidas = dado?.camadas.filter((c) => c.situacao === 'nao_medido').length ?? 0;

  /*
   * ============================================================================
   * A TELA DE PENDENCIAS MOSTRA PENDENCIA. Decisao do dono em 10/09/2026, depois
   * de abrir a tela com a leva nova no ar: *"deixe as pendencias que nao foram
   * resolvidas apenas"*.
   *
   * O QUE ELA MOSTRAVA: as catorze conferencias, fechadas e abertas na mesma
   * lista. Hoje sao NOVE fechadas para cinco abertas - dois tercos da tabela
   * eram trabalho que ja tinha sido feito, e as cinco que importam ficavam
   * espalhadas no meio delas. Uma tela chamada "Pendencias" que lista sobretudo
   * o que nao e pendencia treina a percorrer a tabela inteira para achar as
   * linhas que valem.
   *
   * ⚠️ E O QUE FICA FECHADO NAO SOME, e essa e a metade que nao pode ser perdida:
   * "0 de 29" numa conferencia fechada e PROVA de que ela foi medida, e esta
   * casa trata "medido e certo" e "nunca medido" como coisas diferentes desde
   * sempre. Por isso as fechadas ficam a UM clique, com a contagem sempre visivel
   * - o mesmo desenho dos apontamentos do conector, logo abaixo nesta tela.
   *
   * `nao_medido` CONTINUA NA LISTA DE CIMA, e nao entra nas fechadas: a propria
   * tela define, no "Como ler esta tela", que "ainda nao da para conferir" NAO e
   * o mesmo que pronto. Ela e pendencia de outra natureza, e nao ausencia de
   * pendencia.
   */
  const [verFechadas, setVerFechadas] = useState(false);
  const fechadas = jaFechadas(dado?.camadas ?? []);
  const emAberto = aindaEmAberto(dado?.camadas ?? []);

  return (
    /*
      O TÍTULO ERA "Prontidão para faturar" e a aba se chama "Pendências" desde
      30/07 — quem clicava em uma palavra chegava na outra. "Prontidão" é o nome
      do CÁLCULO no servidor (`repos/prontidao.ts`), e ele fica lá: aqui vale o
      nome que a barra já usa.
    */
    <Pagina titulo="Pendências"
            sub="O que ainda falta para este mês poder ser cobrado. Cada linha diz o que é, quantos faltam e onde se resolve. Esta tela só confere — ela não muda nada sozinha.">
      <div className="ferramentas">
        <label style={{ margin: 0 }}>Mês de referência</label>
        <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} /><AjudaDoMes />
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* ANTES DAS CAMADAS, e de proposito. As camadas dizem o que falta para
          FATURAR este mes; esta faixa diz se o que ja foi faturado consegue ser
          cobrado e baixado. E a pergunta mais alta das duas, e um mes inteiro de
          camadas fechadas nao vale nada com o caminho do dinheiro quebrado. */}
      <SaudeDoDinheiro />
      {/* LOGO ABAIXO DA VIZINHA, e a ordem entre as duas nao e arbitraria: a de
          cima diz que o caminho do dinheiro esta quebrado; esta diz que o
          sistema parou de andar por ele. Quem le de cima para baixo encontra
          primeiro a coisa que impede, e depois a que atrasa. */}
      <FaixasDasAutomacoes rodadas={automacoes.dado} />
      {/* A TERCEIRA FAIXA, e a ordem continua sendo de consequencia: a primeira
          diz que o caminho do dinheiro esta quebrado, a segunda que o sistema
          parou de andar por ele, e esta diz que o caminho esta de pe, o sistema
          esta andando — e mesmo assim ha cliente sem boleto. E a mais especifica
          das tres, e por isso vem por ultimo. */}
      <FaixaDaEmissao dados={emissao.dado} />
      {/* "Conferindo o mês" e nao "Contando as camadas", desde 21/08/2026.
          "Camada" e o nome da estrutura interna do relatorio — a propria suite da
          ajuda o proibe no texto exibido (V4) —, e esta frase era a PRIMEIRA
          coisa que um usuario novo lia no sistema, na primeira tela da barra.
          E a mesma palavra que o painel de ajuda ja usava para a mesma espera. */}
      {carregando && <Carregando texto="Conferindo o mês…" />}

      {dado && (
        <>
          {/*
            O ROTEIRO VEM ANTES DE TUDO O QUE ESTA TELA JA MOSTRAVA, e a razao e a
            pergunta que ele responde.

            As faixas acima dizem se o caminho do dinheiro esta de pe. Os cartoes
            e a tabela abaixo dizem O QUE FALTA. Nenhum dos dois responde **«o que
            eu faco agora, e como»** — que e a pergunta de quem abriu o sistema
            para trabalhar, e a unica que a operacao faz todo dia.

            Medido em 10/09/2026: o caminho real de um mes atravessa DUAS telas
            cujos nomes nao o anunciam, em seis atos com nomes diferentes dos das
            abas — e a tela de nome mais obvio da barra, «Faturamento», e o
            caminho APOSENTADO. Nada nesta tela dizia isso.

            A LOGICA E `roteiro-do-mes.ts`, `.ts` puro com suite propria (regra 8),
            e quem desenha e `roteiro-corpo.tsx`, que recebe tudo por propriedade —
            mesmo par de `saude-do-dinheiro.ts` + `saude-corpo.tsx`, e pelo mesmo
            motivo: `renderToStaticMarkup` nao roda efeito, entao um componente que
            busca sozinho renderiza vazio e o teste mede o nada.
          */}
          <CorpoDoRoteiro
            competencia={mesPorExtenso(dado.competencia) || mes}
            camadas={dado.camadas}
            posicao={carteira.dado?.[0] ?? null}
            semCobranca={emissao.dado ? emissao.dado.total : null}
          />

          {/*
            OS TRES PRIMEIROS CARTOES SAO AS TRES RESPOSTAS DE CONSEQUENCIA, e por
            isso sao os unicos com icone grande de sim/nao: "pode faturar" decide
            se a cobranca existe, "pode emitir boleto" decide se ela vira titulo,
            e "pode repartir" decide se o dinheiro que entrar e distribuido. A
            palavra continua escrita ao lado do desenho.

            O DO MEIO ENTROU EM 08/09/2026 e fechou um verde falso. Com dois
            cartoes, a tela podia dizer «Pode faturar: sim» num mes em que
            NENHUMA unidade conseguiria ter boleto registrado — porque desde
            28/08 a emissao recusa pagador sem endereco, e o relatorio nao
            contava isso. Um cartao que responde a pergunta errada com confianca
            e pior que um cartao a menos: ele autoriza.
          */}
          <div className="kpis">
            <KpiSimNao nome="Pode faturar" sim={dado.pode_faturar} icone="pode_faturar" />
            <KpiSimNao nome="Pode emitir boleto" sim={dado.pode_cobrar} icone="boleto" />
            <KpiSimNao nome="Pode repartir" sim={dado.pode_repartir} icone="pode_repartir" />
            {/* "Unidades a faturar" E NAO "Unidades ativas", desde 24/08/2026. O campo
                se chama `ucs_ativas` e o significado dele mudou em 04/08 para
                "faturaveis" — o servidor registra que "o nome ficou por
                compatibilidade de payload". O ROTULO nao tem essa obrigacao, e
                mantê-lo custava caro: o cartao dizia 29 e a aba Unidades lista
                46 com status ativa. Quem conferisse concluiria que a tela erra. */}
            <Kpi nome="Unidades a faturar" icone="unidades" valor={dado.ucs_ativas} />
            {/* "O que ainda falta" e nao "Camadas pendentes": o cartao mostra
                "3 de 11", e o numero so quer dizer alguma coisa se o nome disser
                de QUE ele e contagem. "Camada" nomeia a estrutura interna do
                relatorio e nao existe para quem opera. */}
            {/* O CARTAO DESOBEDECIA A PROPRIA REGRA DA TELA ate 24/08/2026.
                Ele contava so `pendente`, entao "4 de 13" fazia concluir que 9
                estavam prontas — e duas delas eram `nao_medido`, que a lista
                "Como ler esta tela" define, tres paragrafos abaixo, como NAO
                sendo o mesmo que pronto. Era o defeito que esta tela inteira
                existe para combater, na propria tela.

                O NUMERO GRANDE CONTINUA SENDO O DAS PENDENTES, de proposito:
                e ele que responde "quanto trabalho tenho agora". As nao medidas
                nao sao trabalho ainda — o que as destrava esta uma linha acima.
                O que mudou e que elas pararam de ser CONTADAS COMO PRONTAS. */}
            <Kpi nome="O que ainda falta" icone="prontidao"
                 valor={<>
                   {dado.camadas.filter((c) => c.situacao === 'pendente').length}
                   <span className="fraco" style={{ fontSize: 14, fontWeight: 500 }}> de {dado.camadas.length}</span>
                   {naoMedidas > 0 && (
                     <div className="fraco" style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                       e mais {naoMedidas} ainda sem conferir
                     </div>
                   )}
                 </>} />
          </div>

          {/*
            A COLUNA "DONO" SAIU DA TABELA em 21/08/2026, com o jargão, e as duas
            pelo mesmo motivo: a partir de 22/08 entram usuários novos e não há
            divisão de suporte. "Vinicius + operacao" e "Q-PAGADOR-01" são
            rastreio interno — para quem abre o sistema pela primeira vez, é
            ruído ocupando duas colunas na largura útil.

            NADA FOI JOGADO FORA. O `dono`, a `questao` e o `explicacao` do
            servidor continuam chegando e aparecem em "detalhe técnico", atrás de
            um clique, por decisão do dono no mesmo dia. Quem precisa dos códigos
            continua a um clique deles; quem não sabe o que são não tropeça.
          */}
          {/*
            AS LINHAS ENTRAM AGRUPADAS desde 24/08/2026, a pedido do dono. As
            treze respondem a DUAS perguntas — «a cobrança deste mês sai?» e «o
            dinheiro que entrar vai para quem é de direito?» —, e até aqui o
            único lugar que dizia isso era a coluna «Efeito», repetida linha a
            linha. Quem lia de cima para baixo tratava as treze como uma fila só.

            O AGRUPAMENTO NÃO CLASSIFICA NADA DE NOVO: `efeito` já vem do
            servidor e já é o que governa `pode_faturar`. A regra é `.ts` puro em
            `vocabulario.ts`, com suíte própria — inclusive a que garante que
            efeito novo no servidor não some da tela em silêncio.

            UMA TABELA SÓ, e não duas: as colunas são as mesmas e duas tabelas
            desalinhariam «Quantos» entre os grupos, que é a coluna que a pessoa
            compara de relance.
          */}
          <Tabela cabecalho={<><th>O que falta</th><th>Situação</th><th className="num">Quantos</th><th>Efeito</th><th>Onde resolver</th></>}
                  vazio={
                    /* A LISTA VAZIA AQUI E BOA NOTICIA, e por isso ela FALA. Uma
                       tabela que some quando tudo fecha tem a mesma cara de uma
                       tabela que quebrou - a licao que esta tela ja aprendeu no
                       rodape das automacoes. */
                    <>Nada falta para este mês: as <strong>{fechadas.length}</strong> conferências
                    fecharam. A cobrança depende agora só de emitir.</>
                  }>
            {agruparPorEfeito(verFechadas ? dado.camadas : emAberto).flatMap((g) => [
              <tr key={`grupo:${g.chave}`}>
                <td colSpan={5} style={{ paddingTop: 22, borderBottom: 'none' }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{tituloDoGrupo(g.chave, dado.competencia)}</h3>
                  <div className="fraco" style={{ fontSize: 13, marginTop: 4, maxWidth: 760, lineHeight: 1.55 }}>
                    {subDoGrupo(g.chave, dado.ucs_ativas)}
                  </div>
                </td>
              </tr>,
              ...g.camadas.map((c) => (
                <tr key={c.camada}>
                  <td><OQueFalta camada={c} /></td>
                  <td><Marca tom={c.situacao}>{SITUACAO[c.situacao]?.curto ?? c.situacao}</Marca></td>
                  {/* O SUBSTANTIVO ENTROU EM 24/08/2026. O mesmo `X de Y`
                      significava seis coisas nesta coluna: tres linhas diziam
                      "de 29" e uma delas contava PESSOAS. Ele vai apagado e
                      menor porque o numero continua sendo o que se compara de
                      relance — a palavra so tira a duvida de QUE ele conta. */}
                  <td className="num">
                    {c.situacao === 'nao_medido' ? '—' : <>
                      {c.faltam} de {c.total}{' '}
                      <span className="fraco" style={{ fontSize: 12, fontWeight: 500 }}>
                        {contagemDaCamada(c.camada, c.total)}
                      </span>
                    </>}
                  </td>
                  <td className="fraco" style={{ fontSize: 13 }}>{EFEITO[c.efeito]?.curto ?? c.efeito}</td>
                  <td><OndeResolver camada={c.camada} situacao={c.situacao} /></td>
                </tr>
              )),
            ])}
          </Tabela>

          {fechadas.length > 0 && (
            /* A CONTAGEM E SEMPRE VISIVEL, e so o detalhe e que fica atras do
               clique: "9 ja fechadas" e a afirmacao de que o trabalho aconteceu,
               e escondê-la junto com as linhas transformaria a tela num lugar
               onde so ha problema - o que e outra forma de mentir. */
            <p className="sub" style={{ marginTop: 12 }}>
              <strong>{fechadas.length}</strong>{' '}
              {fechadas.length === 1 ? 'conferência já fechada' : 'conferências já fechadas'}{' '}
              neste mês{emAberto.length === 0 ? '' : ', e elas não aparecem na lista acima'}.{' '}
              <button type="button" onClick={() => setVerFechadas(!verFechadas)}>
                {verFechadas ? 'esconder as fechadas' : 'ver quais'}
              </button>
            </p>
          )}

          <h2>Como ler esta tela</h2>
          <ul className="fraco" style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
            <li><strong>Impede cobrar</strong> significa que a cobrança deste mês não sai enquanto isso faltar. <strong>Impede dividir o dinheiro</strong> deixa cobrar normalmente — o que trava é o repasse ao dono da usina e a comissão, quando o dinheiro entrar.</li>
            <li><strong>Ainda não dá para conferir</strong> não é o mesmo que <strong>pronto</strong>. Essa conferência depende de algo de uma linha acima, que ainda está vazio — então não há o que medir.</li>
            <li>A ordem das linhas é a ordem do trabalho: fechar a de cima costuma destravar as de baixo.</li>
            <li><strong>Onde resolver</strong> abre a aba já filtrada, mostrando só o que falta. Onde diz <strong>não há tela</strong>, não há mesmo — o caminho está escrito ao lado.</li>
          </ul>

          <SinaisDoConector />
        </>
      )}

      {/* FORA DO `{dado && ...}` DE PROPOSITO. O painel responde "o sistema esta
          trabalhando?", e essa resposta nao pode depender de a leitura do MES ter
          dado certo - se a prontidao falhar, a pergunta continua valendo e a
          resposta continua existindo. */}
      <PainelDasAutomacoes rodadas={automacoes.dado} erro={automacoes.erro} />
    </Pagina>
  );
}

/**
 * O QUE FALTA, em duas camadas de leitura.
 *
 * NA SUPERFÍCIE, português de quem opera: o nome curto, a frase do que falta e a
 * CONSEQUÊNCIA — que é o que responde «posso deixar para depois?». Nenhuma
 * sigla, nenhum nome de coluna, nenhum código de questão.
 *
 * ATRÁS DE UM CLIQUE, tudo o que estava na superfície até 21/08: a explicação de
 * engenharia que o servidor manda, o dono, o código da questão e o comando que
 * resolve a carteira inteira. A decisão do dono foi «esconder, não remover» — e
 * a diferença importa: quem acompanha o projeto continua com os ponteiros, e
 * quem chega amanhã não precisa saber que existem.
 *
 * O TEXTO DO SERVIDOR NÃO É REESCRITO AQUI. `c.explicacao` chega como veio, e é
 * essa a razão de ele caber no detalhe técnico em vez de virar a frase principal:
 * ele é preciso para quem lê código e a frase principal precisa ser outra coisa.
 */
function OQueFalta({ camada: c }: { camada: Camada }) {
  const v = VERBETE_DA_CAMADA[c.camada];
  const d = DESTINO_DA_CAMADA[c.camada];

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Sem verbete, cai no nome cru: feio e honesto. Some seria pior — a
          suíte `ajuda.ts` (A5) impede que chegue aqui. */}
      <strong>{v?.titulo ?? c.camada}</strong>

      {v && (
        <div className="fraco" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
          {v.simples}{' '}
          {/* A consequência só aparece em quem ainda não está fechado: numa
              linha resolvida ela seria um aviso sobre um problema que não há. */}
          {c.situacao !== 'ok' && <span>{v.consequencia}</span>}
        </div>
      )}

      {/* O TOGGLE SAIU DAQUI EM 21/08/2026 e virou `DetalheTecnico` no `ui.tsx`.
          Não foi arrumação: a varredura do dia seguinte achou 23 trechos de
          jargão em 7 telas que NÃO tinham este esconderijo, e um padrão que cada
          tela precisa reimplementar é um padrão que a maioria não implementa. */}
      <DetalheTecnico>
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
  const [aberto, setAberto] = useState(false);
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

  return (
    <>
      <h2><Icone nome="recarregar" tamanho={17} /> O que a leitura do outro sistema achou</h2>
      <p className="sub">
        A cada 15 minutos o sistema relê o outro e compara. Última leitura às {relogio}:{' '}
        <strong>{ultima.lidos}</strong> registros lidos
        {ultima.criados > 0 && <>, <strong>{ultima.criados}</strong> criados</>}
        {ultima.atualizados > 0 && <>, <strong>{ultima.atualizados}</strong> atualizados</>}
        {ultima.recusados > 0 && <>, <strong>{ultima.recusados}</strong> recusados</>}.
      </p>

      {ultima.erro && <Aviso tipo="erro">A última leitura terminou mal: {ultima.erro}</Aviso>}
      {ultima.garantia_de_tenant_degradada && (
        <Aviso tipo="erro">
          A leitura rodou por um caminho degradado de separação entre empresas. Não é para
          acontecer, e precisa ser olhado antes de confiar no que veio.
        </Aviso>
      )}
      {ultima.credito_conferido === false && (
        <Aviso tipo="alerta">
          O sistema não conseguiu conferir quem vendeu cada unidade nesta leitura — a comparação
          abaixo pode estar incompleta.
        </Aviso>
      )}
      {ultima.views_ausentes.length > 0 && (
        <Aviso tipo="erro">
          O outro sistema deixou de expor: {ultima.views_ausentes.join(', ')}. Enquanto isso durar,
          o que vinha de lá não está chegando.
        </Aviso>
      )}

      {sinais.length === 0 ? (
        <p className="sub">Nada a apontar na última leitura.</p>
      ) : (
        <>
          <p className="sub">
            <strong>{sinais.length}</strong>{' '}
            {sinais.length === 1 ? 'apontamento' : 'apontamentos'} na última leitura.{' '}
            {/*
              ⚠️ A FRASE ANTERIOR DIZIA «eles não impedem nada sozinhos» PARA OS
              TRÊS TIPOS, e isso é verdade para divergência e FALSO para recusa:
              recusa quer dizer que nada foi gravado naquela linha — o que mudou
              do outro lado não chegou aqui, e não vai chegar sozinho.

              O preço da frase única foi medido em 10/09/2026: uma unidade estava
              sendo recusada a cada 15 minutos DESDE O DIA 4 — 519 vezes, seis
              dias fora do espelho —, sob um texto que mandava corrigir «no
              outro, que é o dono do dado». Naquele caso o outro sistema já
              estava certo: o que estava velho era o vínculo daqui, e a saída é
              nesta casa, na linha da unidade.
            */}
            {ultima.recusados > 0 ? (
              <>
                As <strong>recusas</strong> impedem: a linha recusada <strong>não foi gravada</strong>,
                e o que mudou do outro lado não chega aqui enquanto durar. Quando a recusa for de
                unidade que trocou de contrato, ela se resolve <strong>aqui</strong> — abra a linha
                daquela unidade na aba Unidades consumidoras e confira o vínculo. As{' '}
                <strong>divergências</strong> não impedem nada: são coisas que os dois sistemas
                dizem diferente, e a correção é feita no outro, que é o dono do dado.
              </>
            ) : (
              <>Eles não impedem nada sozinhos — são coisas que os dois sistemas dizem diferente,
                e a correção é feita no outro, que é o dono do dado.</>
            )}
            {' '}
            <button type="button" onClick={() => setAberto(!aberto)}>
              {aberto ? 'esconder' : 'ver quais'}
            </button>
          </p>
          {aberto && (
            <Tabela cabecalho={<><th>Tipo</th><th>Registro</th><th>O que o sistema achou</th></>}>
              {sinais.slice(0, 60).map((x, i) => (
                <tr key={`${x.entidade}-${x.chave}-${i}`}>
                  <td>
                    <Marca tom={x.tipo === 'recusa' ? 'pendente' : 'nao_medido'}>{x.tipo}</Marca>
                  </td>
                  <td><span className="fraco">{x.entidade}</span> {x.chave}</td>
                  <td>{x.sinal}</td>
                </tr>
              ))}
            </Tabela>
          )}
          {aberto && sinais.length > 60 && (
            <p className="sub">Mostrando os 60 primeiros de {sinais.length}.</p>
          )}
        </>
      )}
    </>
  );
}
