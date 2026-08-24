// O DESTINO DE CADA CAMADA DA PRONTIDAO — para onde vai quem quer FECHAR a
// pendencia, e nao so le que ela existe.
//
// ============================================================================
// O QUE ESTE ARQUIVO EXISTE PARA RESOLVER
//
// A tela de Pendencias dizia, com precisao, o que falta e de quem e — e nao
// dizia ONDE se preenche. Quem opera lia "39 UCs sem tarifa" e tinha de saber,
// de cabeca, que a tarifa e coluna da aba Unidades consumidoras desde 14/08
// (antes era a aba Tarifas, que SAIU), que o documento passou a ter tela em
// 17/08 (antes so `npm run documentos` de um Codespace), e que geracao nao tem
// tela nenhuma porque e espelhada do CRM.
//
// Nada disso esta na tela: esta espalhado por `PENDENCIAS.md` §2.a, pelos
// cabecalhos das telas e pela memoria de quem acompanhou as sessoes. O relatorio
// nomeava o dono da pendencia e deixava o CAMINHO implicito — e caminho implicito
// e o mesmo defeito que a propria prontidao existe para combater: a triagem
// dizia `sem_contrato_vigente` e nao dizia que por tras havia mais tres camadas
// vazias.
//
// ============================================================================
// AS TRES REGRAS QUE GOVERNAM ESTA TABELA
//
//   1. `rota: null` E UMA RESPOSTA, e nao um buraco. Tres camadas nao tem tela,
//      e as tres por motivo declarado — geracao e espelho do CRM (regra 4),
//      regra de comissao e decisao versionada sem tela, e as duas tem caminho
//      real escrito no `caminho`. Inventar um link para elas seria mandar a
//      pessoa procurar um formulario que nao existe;
//
//   2. O FILTRO TEM DE CASAR COM O QUE A CAMADA CONTA. A camada
//      `documento_do_cliente` conta `NOT documento_validado`, que sao TRES
//      estados do vocabulario da aba Clientes — um link para `sem_documento`
//      mostraria uma lista MENOR do que a que a prontidao acusa, e quem
//      conferisse concluiria que a camada mentiu. Por isso existe o agregado
//      `nao_validado` em `clientes-regras.ts`;
//
//   3. O ROTULO E O ATO, nao o nome da tela. "Unidades consumidoras" nao diz o
//      que fazer la; "Preencher a tarifa R$/kWh" diz. O nome e o icone da tela
//      de destino vem de `navegacao.ts` e aparecem junto — quem ja conhece a
//      barra reconhece para onde vai antes de ler.
//
// ISTO E `.ts` PURO E FORA DO `.tsx` PELO MOTIVO DE SEMPRE: o runner do `web/` e
// `node --experimental-strip-types`, que nao le JSX. Regra dentro de tela e
// inalcancavel por teste, e a regra 8 diz que invariante sem teste e comentario.
// O precedente sao `contrato-regras.ts`, `cobranca-regras.ts`, `unidades-regras.ts`
// e `navegacao.ts`.

import { TELAS, type Tela } from './navegacao.ts';

export type DestinoDaCamada = {
  /** A tela onde o dado ENTRA. `null` quando nao existe tela — e ai o `caminho`
   *  e a unica verdade, e a tela de Pendencias nao desenha link. */
  rota: string | null;
  /** O valor de `?pendencia=` que ja abre a tela mostrando SO o que falta.
   *  `null` quando a tela nao tem filtro que corresponda a camada. */
  filtro: string | null;
  /** O ATO, em imperativo. Vira o texto do link. */
  rotulo: string;
  /** O caminho FORA da tela: o importador que faz a carteira inteira de uma vez,
   *  ou o unico caminho quando `rota` e nulo. */
  caminho: string | null;
  /** O que a tela resolve, o que ela NAO resolve, e o que precisa vir antes. */
  nota: string;
};

/** A chave da consulta, uma so para as tres telas que a honram. Um nome por tela
 *  faria cada link ter uma gramatica, e quem cola o endereco no WhatsApp teria
 *  de saber qual. */
export const CHAVE_DO_FILTRO = 'pendencia';

/**
 * OS VALORES DE `?pendencia=` QUE CADA TELA SABE HONRAR — vocabulario fechado.
 *
 * Ele existe para o link nao poder MENTIR de dois jeitos: apontar um filtro que
 * a tela ignora (e a pessoa cai numa lista de 41 linhas achando que sao as que
 * faltam), ou apontar uma tela que nao filtra nada. `filtroDaConsulta` descarta
 * o que nao estiver aqui, entao um endereco editado a mao cai na lista inteira —
 * que e o comportamento honesto — em vez de num filtro que nao existe.
 */
export const FILTROS_DA_TELA = {
  '/clientes': ['nao_validado', 'sem_documento', 'semente_do_crm', 'digito_nao_confere', 'validado'],
  '/unidades': ['sem_vencimento', 'sem_tarifa', 'sem_usina', 'sem_endereco'],
  '/usinas': ['sem_dono'],
} as const satisfies Record<string, readonly string[]>;

/**
 * CAMADA -> ONDE SE RESOLVE. As chaves sao as de `src/repos/prontidao.ts`, e a
 * suite compara as duas listas lendo o arquivo do servidor: camada nova sem
 * destino aqui FALHA, em vez de aparecer na tela sem caminho.
 *
 * A ORDEM E A DA PRONTIDAO, que e a ordem do trabalho — fechar a de cima e o que
 * torna a de baixo mensuravel.
 */
export const DESTINO_DA_CAMADA: Record<string, DestinoDaCamada> = {
  documento_do_cliente: {
    rota: '/clientes', filtro: 'nao_validado',
    rotulo: 'Preencher o CPF/CNPJ',
    caminho: 'npm run documentos',
    nota: 'O filtro abre em «Ainda não vale para o contrato», que são os três estados que a R9 '
      + 'recusa — e não só o campo vazio: documento vindo do CRM entra com `documento_validado = '
      + 'false` mesmo passando no dígito. Reenviar o mesmo número pela aba é o ato que o valida. '
      + 'Para as 29 linhas de uma vez o importador continua sendo o caminho certo: ele confere '
      + 'colisão de documento repetido (Q-CLIENTEDUP-01) antes de escrever qualquer linha, e a '
      + 'digitação linha a linha não faz isso.',
  },

  contrato_ativo: {
    rota: '/contratos', filtro: null,
    rotulo: 'Criar e ativar o contrato',
    caminho: 'npm run contratos',
    nota: 'O formulário fica no topo da tela e cria já ativando. Ele depende das duas coisas de '
      + 'cima: sem documento validado a R9 recusa a ativação, e sem originador cadastrado '
      + '(`npm run originadores`) o botão nem destrava — o tipo dele congela aqui (R20-b) e não '
      + 'há edição depois.',
  },

  rateio: {
    rota: '/unidades', filtro: 'sem_usina',
    rotulo: 'Vincular usina e percentual',
    caminho: null,
    nota: 'Usina e percentual são a mesma linha da tabela, e o filtro abre nas UCs sem usina '
      + 'porque é ela que vem primeiro: o botão de gravar o rateio fica travado enquanto a UC não '
      + 'tiver usina — o percentual não teria onde ser gravado.',
  },

  /*
   * SEM TELA, E DE PROPOSITO. `usina_geracao` e uma das quatro entidades
   * ESPELHADAS do CRM (SPEC-002 §2), e pela regra 4 o financeiro nao escreve la:
   * o que falta no CRM se resolve no CRM, e o ciclo traz. A rota
   * `PUT /usinas/:id/geracao` existe para o proprio espelho e carrega `origem` —
   * dar a ela um formulario criaria um segundo dono para o mesmo numero, e o
   * proximo ciclo passaria por cima sem avisar.
   */
  geracao_da_competencia: {
    rota: null, filtro: null,
    rotulo: 'Não há tela — a geração é espelhada do CRM',
    caminho: 'npm run ciclo',
    nota: 'A geração medida é lançada no CRM e chega aqui pelo conector (SPEC-002 §2). O '
      + 'financeiro não a digita: pela regra 4 o CRM é read-only absoluto, e um formulário aqui '
      + 'seria um segundo dono do mesmo número — o ciclo seguinte passaria por cima em silêncio. '
      + 'Se a competência já foi lançada lá e continua faltando aqui, o que rodar é o ciclo.',
  },

  /*
   * A CONTA LIDA ENTROU NO RELATORIO EM 24/08/2026, e a tela existia desde 14/08.
   * O que faltava era a Pendencias DIZER que a conta e o insumo: decidida a
   * Q-CICLO-01, o valor da cobranca sai dela. Ela vem antes das duas de baixo
   * porque as duas contam SOBRE ela — sem conta, nao ha vencimento nem preco do
   * kWh para medir.
   */
  conta_lida_da_competencia: {
    rota: '/documento', filtro: null,
    rotulo: 'Ler a conta da distribuidora',
    caminho: null,
    nota: 'Na aba «1 · Leitura e cálculo»: sobe-se o PDF da conta, confere-se campo a campo o que '
      + 'o leitor extraiu e registra-se. É a conta registrada que vira a cobrança, pelo botão '
      + '«gerar cobrança» da lista logo abaixo. Uma conta por unidade e por mês, sempre uma de '
      + 'cada vez — se vale um caminho para subir as 29 de uma pasta só é decisão em aberto, com '
      + 'dono. Registrar não exige a unidade cadastrada, de propósito, porque quem sobe o arquivo '
      + 'está conferindo; faturar exige.',
  },

  vencimento: {
    rota: '/unidades', filtro: 'sem_vencimento',
    rotulo: 'Preencher o dia de vencimento',
    caminho: 'npm run vencimentos',
    nota: 'A PRIMEIRA FONTE É A CONTA, e ela normalmente traz a data — esta linha só acusa a '
      + 'unidade cuja conta veio SEM vencimento impresso. Aí vale o dia do cadastro, que é o que '
      + 'se preenche aqui, e a cobrança de uma competência vence no mês seguinte nesse mesmo dia. '
      + 'Não há valor padrão e não vai haver: quem preenche, por UC ou por contrato, é a '
      + 'Q-SPEC001-02 — o servidor recusa faturar em vez de escolher um dia (regra 10).',
  },

  /*
   * ERA `tarifa_da_uc` E APONTAVA PARA A ABA UNIDADES, o que virou destino errado
   * em 21/08 sem ninguem mexer nele: a tarifa do caminho oficial e a LIDA NA
   * CONTA, com seis casas, e `triarRegistro` nao olha o cadastro. Mandar corrigir
   * o preco em Unidades consumidoras fecharia a coluna de la e deixaria a
   * cobranca recusada do mesmo jeito — o pior tipo de link, o que leva a algum
   * lugar.
   */
  tarifa_na_conta: {
    rota: '/documento', filtro: null,
    rotulo: 'Corrigir o preço do kWh na conta lida',
    caminho: null,
    nota: 'O preço vem impresso na conta da distribuidora e é lido com até seis casas. Esta linha '
      + 'acusa a conta em que ele ficou ZERADO — e zero é recusado de propósito, porque a folha '
      + 'sairia dizendo que o kWh não custa nada. Corrige-se na própria leitura e registra-se de '
      + 'novo. A coluna «Tarifa R$/kWh» da aba Unidades consumidoras é outra coisa: ela serve o '
      + 'caminho em lote, que não é o oficial, e o conector continua semeando ela do card.',
  },

  dono_da_usina: {
    rota: '/usinas', filtro: 'sem_dono',
    rotulo: 'Vincular o dono da usina',
    caminho: null,
    nota: 'A escolha da lista grava na hora, sem botão de confirmar. O dono precisa EXISTIR '
      + 'antes: quem não aparece na lista se cadastra na aba Donos de usina, que exige chave Pix '
      + 'ou conta completa — conferido no cadastro, porque no pagamento já é tarde.',
  },

  regra_de_repasse: {
    rota: '/usinas', filtro: null,
    rotulo: 'Abrir a vigência de repasse',
    caminho: null,
    nota: 'Na seção «Percentual de repasse, por vigência», no fim da mesma tela. Não existe '
      + '«editar percentual»: abrir uma vigência nova FECHA a anterior na mesma transação, porque '
      + 'renegociar hoje não reprecifica repasse já pago (R25). O que vale numa fatura é o '
      + 'vigente na competência dela, não o corrente da usina.',
  },

  originador_do_contrato: {
    rota: '/contratos', filtro: null,
    rotulo: 'Conferir os contratos ativos',
    caminho: null,
    nota: 'A tela impede o PRÓXIMO — o originador é obrigatório para criar —, e o que já está '
      + 'ativo tem custo: `originador_id` e o tier só se escrevem no rascunhar (R20-b), então '
      + 'consertar um contrato ativo é encerrar + renovar, o que zera o contador de faturas '
      + 'cheias e registra na trilha uma renovação que não houve. Antes de mexer, a decisão é do '
      + 'dono do contrato, não de quem opera a tela.',
  },

  /*
   * SEM TELA, E A AUSENCIA E DECLARADA. `POST /regras-comissao` existe e e usada
   * pela suite; formulario nao ha. A camada nao e insumo de operacao — e a
   * decisao das DUAS parcelas do PRD §5.4, que tem dono nomeado (Q-COMIS-TERC-01)
   * e vigencia versionada. Construir a tela antes da decisao seria oferecer um
   * campo para um numero que ninguem escolheu.
   */
  regra_de_comissao: {
    rota: null, filtro: null,
    rotulo: 'Não há tela — é decisão com dono',
    caminho: 'POST /regras-comissao',
    nota: 'As DUAS parcelas do PRD §5.4 precisam estar vigentes na data de fechamento do '
      + 'contrato: uma vigência com só uma passa na 1ª fatura cheia e levanta na 2ª. O valor é '
      + 'decisão do dono (Q-COMIS-TERC-01) e a vigência é versionada, nunca editada no lugar. '
      + 'E se esta camada diz «não medido», olhe a de cima primeiro: sem originador não há tier '
      + 'congelado para medir, e o vazio aqui é consequência de lá.',
  },

  cobranca_sicoob: {
    rota: '/cobranca', filtro: null,
    rotulo: 'Cadastrar a credencial',
    caminho: null,
    nota: 'Agência, conta, contrato, convênio, validade do A1 e a `credencial_ref`. O certificado '
      + 'e a senha NÃO entram aqui: segredo por tenant vive em armazenamento cifrado e é acessado '
      + 'por referência (regra 5) — o formulário recusa um valor que pareça o próprio segredo. '
      + 'Sem o conector a fatura existe e é cobrável por Pix, e o boleto emitido no banco pode ser '
      + 'importado na aba Emissão e cobrança; o que falta é a emissão pela API.',
  },
};

/** O endereco do link, com o filtro ja embutido. `null` quando a camada nao tem
 *  tela — e ai a tela de Pendencias mostra o `caminho` em vez de um link morto. */
export function enderecoDoDestino(d: DestinoDaCamada): string | null {
  if (!d.rota) return null;
  return d.filtro ? `${d.rota}?${CHAVE_DO_FILTRO}=${encodeURIComponent(d.filtro)}` : d.rota;
}

/** A tela de destino, para o link poder carregar o ICONE e o NOME que a barra de
 *  navegacao ja usa: quem conhece a barra reconhece para onde vai antes de ler o
 *  rotulo. Busca EXATA — `telaDoCaminho` cai na primeira tela quando nao acha, e
 *  aqui um destino errado tem de aparecer como erro, nao como Pendencias. */
export const telaDoDestino = (d: DestinoDaCamada): Tela | undefined =>
  TELAS.find((t) => t.rota === d.rota);

/**
 * O filtro pedido pela consulta, PENEIRADO pelo vocabulario da tela.
 *
 * Vazio quando o parametro nao veio, veio vazio ou veio com valor que a tela nao
 * conhece. O descarte e deliberado: um valor desconhecido virando estado do
 * filtro desenharia um `<select>` sem opcao correspondente — o navegador mostra
 * a primeira opcao ("Todas as pendencias") enquanto a lista exibe outro recorte,
 * e a tela passa a dizer uma coisa e mostrar outra.
 */
export function filtroDaConsulta(busca: string, aceitos: readonly string[]): string {
  const v = new URLSearchParams(busca).get(CHAVE_DO_FILTRO) ?? '';
  return aceitos.includes(v) ? v : '';
}
