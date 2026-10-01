// A NAVEGAÇÃO COMO DADO PURO: funil, rota, título, ícone e grupo. Sem JSX.
//
// ============================================================================
// DOIS FUNIS DESDE 22/09/2026, e a divisão é a do NEGÓCIO, não a do código
//
// Até essa data a barra tinha doze abas em fila, separadas por uma divisória
// fina entre «cadastro» e «dinheiro». Era a ordem do TRABALHO de um mês — e
// estava certa para quem já sabia o caminho —, mas misturava duas perguntas que
// um analista financeiro faz em momentos diferentes:
//
//   «o que os clientes devem e por quê?»      usinas, unidades, contratos, a conta
//                                              lida, a fatura, o boleto, a cobrança;
//   «como está o caixa da empresa?»            o que há para receber, o que há para
//                                              pagar, o banco, quem mexeu no quê.
//
// A primeira é o **Financeiro Rateio**; a segunda, o **Financeiro Empresa**. A
// receita nasce no primeiro e vira caixa no segundo — «Contas a receber» é a
// ponte, e é a única tela que lê o funil 1 para servir o funil 2.
//
// O QUE ISSO MUDA NA TELA: o topo ganhou um seletor de funil ao lado da marca, e
// a barra de baixo mostra só as telas do funil escolhido. Nove abas viraram
// nove, e quatro viraram quatro — ninguém mais lê treze.
//
// O SELETOR VIROU MENU EM 27/09/2026, a pedido do dono e no desenho do Supabase:
// em vez de duas pílulas lado a lado, o nome do setor atual com o ícone ⌃⌄, que
// abre a lista dos setores. Na tela eles se chamam **setores financeiros** — a
// palavra do dono —; no código continuam `funil`, que é o nome do domínio desde
// 22/09. A lista cresce sem pedir espaço na barra: um terceiro setor é uma linha
// a mais no menu, e não uma terceira pílula disputando lugar com a marca.
//
// O QUE NÃO MUDOU, de propósito: as ROTAS (todo favorito e todo link da ajuda
// continuam valendo) e os NOMES DE DOMÍNIO. Um caminho desconhecido continua
// caindo na primeira tela do Rateio.
//
// ============================================================================
// A BARRA DO RATEIO SEGUE O TRABALHO DO MÊS (30/09/2026, etapa 3 do redesenho)
//
// Até esta data eram nove abas, e SEIS eram cadastro: Pendências, Clientes,
// Unidades consumidoras, Contratos, Usinas, Donos de usina ‖ Fatura unificada,
// Emissão e cobrança, Relatórios. O trabalho de todo dia — ler as contas, gerar,
// emitir, pedir o boleto — morava nas duas abas cujos nomes não o anunciavam,
// empurradas para o fim; e no celular a barra mostrava duas abas e meia, todas
// de cadastro. A crítica de 30/09 contou isso como P1 nº 3.
//
// AGORA: «Mês · Contas de luz · Cobranças · Relatórios ‖ Cadastros ▾».
//
//   «Mês»           a antiga Pendências (`/pendencias`): quantas unidades estão
//                   em cada passo do mês, o que trava e onde se resolve;
//   «Contas de luz» a antiga Fatura unificada (`/documento`): os passos 1 e 2 —
//                   a conta da distribuidora entra e vira cobrança — e a folha.
//                   «Fatura unificada» continua sendo o nome da FOLHA que o
//                   cliente recebe, e não sai do produto; só deixou de ser o
//                   nome da tela, porque a tela é onde as contas de luz chegam;
//   «Cobranças»     a antiga Emissão e cobrança (`/faturas`): os passos 3 e 4 —
//                   emitir, pedir o boleto, dar baixa;
//   «Cadastros ▾»   um menu com os cinco cadastros. Eles são onde se RESOLVE o
//                   que o mês acusa, e não o trabalho do mês: cabem atrás de um
//                   clique, e a pendência de cadastro chega com o link direto.
//
// POR QUE ESTES NOMES: a regra foi anunciar o passo do mês na língua de quem
// opera. «Conta de luz» é como a operação chama o documento da distribuidora — o
// roteiro já dizia «Ler as contas de luz do mês», e a ajuda já buscava por ele —,
// e «cobrança» é o termo da casa (`GLOSSARIO.md`: «fatura — cobrança de uma UC
// numa competência»). A entrada e a saída do mês, em dois substantivos.
//
// AS ROTAS NÃO MUDARAM, e o nome da rota agora difere do nome da aba em três
// casos (`/pendencias`, `/documento`, `/faturas`). É o preço de nenhum link
// antigo quebrar — `?uc=`, `?mes=`, `#cadastro`, os favoritos e as mensagens do
// servidor continuam valendo.

// ============================================================================
// A BARRA VIROU MENU LATERAL, E A ORDEM VIROU A DO TRABALHO (30/09/2026, etapa 3b)
//
// Dois pedidos do dono no mesmo dia, e o segundo desfaz metade do de cima:
//
//   «Ao invés dos tópicos ficarem dispostos na barra fixa superior, quero um
//   menu lateral, similar ao de /opt/intreply. As telas devem permanecer as
//   mesmas.»
//
//   «A ordem das telas deve refletir a ordem de cada etapa de trabalho.»
//
// O MENU LATERAL TEM O ESPAÇO QUE A BARRA NÃO TINHA. Os cinco cadastros tinham
// ido para um menu «Cadastros ▾» porque cinco abas na mesma fileira empurravam o
// trabalho para fora da tela; numa coluna, nove itens cabem inteiros com folga.
// O suspenso deixou de pagar o clique que custava, e os cadastros voltaram a ser
// itens à vista — agora numa SEÇÃO com título, que fecha se a pessoa quiser.
//
// E A ORDEM PASSOU A SER A DO TRABALHO, de cima para baixo, em quatro blocos:
//
//   Mês                      o ponto de partida: o funil do mês e onde começar;
//   Cadastros                o que precisa existir antes de o mês rodar, na ORDEM
//                            DE DEPENDÊNCIA — cada um só se completa com o de
//                            cima pronto (ver o comentário da seção, abaixo);
//   O mês, passo a passo     Contas de luz (passos 1 e 2) e Cobranças (3 e 4);
//   Resultado                Relatórios — a apuração do que o mês produziu.
//
// Na Empresa, a mesma lógica: primeiro o dinheiro que entra (Contas a receber),
// depois o que se reparte e se paga (Contas a pagar — o passo 5, onde o mês do
// Rateio termina), e por último o apoio (Conector Sicoob, Histórico).
//
// O NÚMERO DO PASSO APARECE NO ITEM («1–2», «3–4», «5»), e ele não é escrito
// duas vezes: `passos` abaixo é conferido contra `ondeEstouNoMes` do roteiro
// (`RM25`), que é a mesma lista que monta o funil da tela Mês e a faixa de cada
// tela. O menu, o funil e a faixa contam a mesma sequência, ou a suíte falha.
//
// O QUE ERA «A BARRA» NOS TESTES E NA AJUDA PASSOU A SER «O MENU», com as mesmas
// garantias: toda tela é item do menu do seu setor, e o nome que um texto manda
// procurar é, letra por letra, o rótulo do item (`caminhoNoMenu`, `RM13`).

// ============================================================================
// POR QUE ESTE ARQUIVO É DADO E NÃO JSX (30/07/2026)
//
// O runner do `web/` é `node --experimental-strip-types`, que não lê JSX. O que
// precisa de teste sai do `.tsx` — regra 8. O `render` ficou no `app.tsx`, e o
// `Record` exaustivo de lá recusa compilar uma tela sem componente.
//
// A ORDEM DENTRO DE CADA FUNIL NÃO É ALFABÉTICA, e isso é deliberado. Desde
// 30/09/2026 (etapa 3b) ela é a ordem em que o trabalho ACONTECE — ver o bloco
// acima. Até ali o Rateio punha o trabalho do mês primeiro e os cadastros por
// último, num menu; o menu lateral devolveu a eles o lugar na sequência.

// ============================================================================
// A TERCEIRA PASTA, «ADMINISTRAÇÃO DA PLATAFORMA» (30/09/2026)
//
// Pedido do dono: *«onde existe o seletor que separa para setores financeiros,
// crie uma nova pasta, que ao invés de setores financeiros é Administração da
// plataforma, nela coloque as telas de funções de admin»*. No menu ⌃⌄ ela é um
// segundo bloco, com título próprio, abaixo dos setores financeiros — e dentro
// dela ficam as TELAS (hoje, «Usuários»), e não um resumo: quem abre a pasta de
// administração vai a uma função, e não a um setor.
//
// NO DADO ELA É UM FUNIL A MAIS, com `pasta: 'plataforma'`. A barra de baixo, a
// migalha e o «caminho desconhecido cai na primeira tela» continuam valendo sem
// um segundo mecanismo; o que muda é o menu, que agrupa por `pasta`.
//
// E QUEM VÊ CADA PASTA É DO VÍNCULO, desde o mesmo dia: `setores` na sessão
// (migration 41), marcado por caixa na tela de Usuários. O seletor só desenha o
// que o vínculo vê, e um endereço de setor oculto leva à primeira tela visível
// (`destinoVisivel`). Isto é o que a pessoa VÊ; o que ela pode FAZER continua no
// papel, conferido no servidor.

import type { NomeDeIcone } from './iconografia.ts';

export type ChaveDoFunil = 'rateio' | 'empresa' | 'administracao';

/** Os dois blocos do menu ⌃⌄. */
export type PastaDoMenu = 'setores' | 'plataforma';

export const PASTAS: ReadonlyArray<{ chave: PastaDoMenu; titulo: string }> = [
  { chave: 'setores', titulo: 'Setores financeiros' },
  { chave: 'plataforma', titulo: 'Administração da plataforma' },
];

export type Funil = {
  chave: ChaveDoFunil;
  /** O que o seletor mostra — curto, porque fica no alto do menu, sob a marca «Financeiro G3». */
  rotulo: string;
  /** O nome inteiro, para leitor de tela, título de página e ajuda. */
  nome: string;
  /** Uma frase: o que este funil controla. */
  descricao: string;
  /** A linha de baixo no menu de setores — cabe numa linha de 324px, e por isso
   *  não é a `descricao`: o menu é para ESCOLHER, a frase inteira é para a ajuda. */
  resumo: string;
  /** O desenho do setor, no gatilho e no menu. */
  icone: NomeDeIcone;
  /** Em qual bloco do menu ⌃⌄ ele aparece. */
  pasta: PastaDoMenu;
};

export const FUNIS: readonly Funil[] = [
  {
    chave: 'rateio', rotulo: 'Rateio', nome: 'Financeiro Rateio',
    descricao: 'O dinheiro que entra dos clientes: usinas, unidades, contratos, a conta de luz '
             + 'lida, a cobrança e o boleto.',
    resumo: 'Clientes, contas de luz e cobranças',
    icone: 'setor_rateio', pasta: 'setores',
  },
  {
    chave: 'empresa', rotulo: 'Empresa', nome: 'Financeiro Empresa',
    descricao: 'O caixa da empresa: o que há para receber, o que há para pagar, o banco e o '
             + 'histórico do que foi feito.',
    resumo: 'A receber, a pagar, banco e histórico',
    icone: 'setor_empresa', pasta: 'setores',
  },
  /*
   * NÃO É «FINANCEIRO» NENHUM, e o nome diz isso de propósito: aqui não há
   * dinheiro, há quem entra e o que cada um vê. O rótulo da migalha é curto
   * («Administração»); o título da pasta no menu é o inteiro.
   */
  {
    chave: 'administracao', rotulo: 'Administração', nome: 'Administração da plataforma',
    descricao: 'Quem entra no sistema e o que cada pessoa vê: cadastrar alguém, escolher os setores '
             + 'de cada uma e desligar um acesso.',
    resumo: 'Quem entra e o que cada um vê',
    icone: 'setor_administracao', pasta: 'plataforma',
  },
] as const;

/**
 * O GRUPO É A SEÇÃO DO MENU LATERAL (30/09/2026, etapa 3b). Dentro de um funil,
 * as telas do mesmo grupo ficam juntas sob um título; o grupo muda, a seção
 * muda. Até esta data o grupo era a DIVISÓRIA fina da barra de cima (trabalho ‖
 * cadastro no Rateio, dinheiro ‖ apoio na Empresa) e o `cadastro` virava um
 * menu suspenso; com o menu lateral, a fronteira ganhou nome.
 *
 * OS GRUPOS DIZEM EM QUE MOMENTO DO TRABALHO A TELA ENTRA, e a ordem deles é
 * a ordem em que o trabalho acontece:
 *
 *   `abertura`    a tela que abre o setor e não precisa de título — Mês no
 *                 Rateio, Usuários na Administração. É o «comece por aqui»;
 *   `cadastro`    o que precisa existir antes de o mês rodar;
 *   `passos`      onde os passos do mês acontecem, na ordem deles;
 *   `resultado`   a apuração do que o mês produziu;
 *   `caixa`       o dinheiro da empresa: o que entra e o que sai;
 *   `apoio`       o que sustenta os atos e não é ato — o banco, a trilha.
 */
export type GrupoDeTela = 'abertura' | 'cadastro' | 'passos' | 'resultado' | 'caixa' | 'apoio';

/**
 * O TÍTULO DE CADA SEÇÃO. `null` é a abertura, que vem sem título de propósito:
 * uma seção de um item só chamada «Início» em cima de «Mês» seria o menu
 * dizendo a mesma coisa duas vezes.
 *
 * «O mês, passo a passo» e não «Trabalho»: as duas telas dali são os passos 1 a
 * 4 do funil da tela Mês, e o título diz isso na língua do funil. «Caixa» é a
 * palavra que o próprio setor usa para se descrever («o caixa da empresa: o que
 * há para receber, o que há para pagar»).
 */
export const SECAO_DO_GRUPO: Record<GrupoDeTela, { titulo: string | null }> = {
  abertura: { titulo: null },
  cadastro: { titulo: 'Cadastros' },
  passos: { titulo: 'O mês, passo a passo' },
  resultado: { titulo: 'Resultado' },
  caixa: { titulo: 'Caixa' },
  apoio: { titulo: 'Apoio' },
};

export type Tela = {
  funil: ChaveDoFunil;
  rota: string;
  titulo: string;
  icone: NomeDeIcone;
  grupo: GrupoDeTela;
  /** A linha de baixo quando a TELA aparece no menu ⌃⌄ — so as da pasta
   *  «Administração da plataforma», que lista telas e não setores. */
  resumo?: string;
  /**
   * OS PASSOS DO MÊS QUE ACONTECEM NESTA TELA, na numeração do funil da tela
   * Mês (1 a 5). O menu os mostra discretos ao lado do nome («1–2»). Não são
   * uma segunda fonte: `RM25` confere cada um contra `ondeEstouNoMes`, que lê
   * os MESMOS moldes que montam o funil e a faixa de cada tela.
   */
  passos?: readonly number[];
};

export const TELAS: readonly Tela[] = [
  // ======================================================= FINANCEIRO RATEIO
  /*
   * «MÊS», E ANTES «PENDÊNCIAS» (30/07) E «PRONTIDÃO» (29/07). A tela passou a
   * responder «em que passo está cada unidade deste mês, e o que trava» — o
   * funil do mês no alto, as conferências de cadastro embaixo —, e «Pendências»
   * nomeava só a metade de baixo. O domínio NÃO mudou: `src/repos/prontidao.ts`
   * segue nomeando o CÁLCULO. `/prontidao` e `/` continuam chegando aqui porque
   * caminho desconhecido cai na primeira tela, que é esta.
   */
  { funil: 'rateio', rota: '/pendencias', titulo: 'Mês', icone: 'prontidao', grupo: 'abertura' },
  /*
   * OS CADASTROS, NA ORDEM DE DEPENDÊNCIA DO NEGÓCIO (30/09/2026, etapa 3b).
   * Cada um só se completa com o de cima pronto, e a ordem foi tirada do banco e
   * das telas, e não do gosto:
   *
   *   Donos de usina   não dependem de nada — e precisam EXISTIR antes de a
   *                    usina apontar para eles: a lista de dono na linha da usina
   *                    só oferece quem já está cadastrado (`destino-da-camada.ts`,
   *                    camada `dono_da_usina`), e a própria tela de Donos termina
   *                    com «agora vincule-o à usina na tela Usinas»;
   *   Usinas           a geradora, espelhada do CRM. Aqui se vincula o dono e se
   *                    abre a vigência de repasse — as duas pedem o dono pronto;
   *   Clientes         quem paga. A unidade consumidora só nasce com cliente (a
   *                    chave dela é obrigatória no banco), e o contrato só ativa
   *                    com o documento dele conferido;
   *   Unidades         o ponto de consumo: pede o cliente, e o rateio pede a
   *   consumidoras     usina — as duas de cima;
   *   Contratos        amarra cliente, unidade e usina, os três obrigatórios.
   *
   * É a cadeia do `PLANO-global` §0 («usina → unidade → contrato») com as duas
   * pontas que ela não nomeia: o dono antes da usina, o cliente antes da unidade.
   * A proposta inicial punha Usinas antes de Donos, e o domínio disse o contrário:
   * a usina existe antes (vem do CRM), mas não se COMPLETA sem o dono cadastrado.
   *
   * ATÉ 30/09/2026 A ORDEM ERA OUTRA — Clientes, Unidades, Contratos, Usinas,
   * Donos —, a da tela Mês: o que trava COBRAR primeiro, o que trava REPARTIR
   * depois. Aquela é a ordem da urgência de um mês que já está andando; esta é a
   * ordem de quem monta o cadastro, e é a que o menu deve contar.
   *
   * A ABA «Tarifas» SAIU EM 14/08/2026 (a tarifa virou coluna da unidade,
   * migration 30) e a ABA «Faturamento» (`/carteira`) SAIU EM 10/09/2026 — era o
   * caminho aposentado desde a `Q-CICLO-01`, e compor por ela TRAVAVA a unidade
   * no caminho oficial (`uc_ja_faturada`). O motor (`POST
   * /faturamento/:competencia/compor`) segue no servidor sem tela, e apagá-lo
   * tem dono (`Q-CICLO-02`).
   */
  /* "Donos" não diz de QUE. É o cadastro de quem recebe o repasse — o maior
   * fluxo de dinheiro do sistema —, e "dono de usina" é o termo do `GLOSSARIO`. */
  { funil: 'rateio', rota: '/donos',      titulo: 'Donos de usina', icone: 'donos', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/usinas',     titulo: 'Usinas',     icone: 'usinas',    grupo: 'cadastro' },
  { funil: 'rateio', rota: '/clientes',   titulo: 'Clientes',   icone: 'clientes',  grupo: 'cadastro' },
  /* "Unidades" sozinho, ao lado de "Usinas", troca o PONTO DE CONSUMO pelo
   * GERADOR. O termo do `GLOSSARIO` é "UC / unidade consumidora". */
  { funil: 'rateio', rota: '/unidades',   titulo: 'Unidades consumidoras', icone: 'unidades', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/contratos',  titulo: 'Contratos',  icone: 'contratos', grupo: 'cadastro' },
  /*
   * «CONTAS DE LUZ», E ANTES «FATURA UNIFICADA» (17/08) E «DOCUMENTO». É a tela
   * dos passos 1 e 2: a conta da distribuidora entra, é conferida, registrada e
   * vira cobrança — e a folha do cliente, a Fatura unificada, se imprime aqui na
   * aba «Folha do cliente». A ROTA NÃO MUDA: `/documento#cadastro` abre
   * direto a aba do emissor, «Dados de quem cobra».
   */
  { funil: 'rateio', rota: '/documento',  titulo: 'Contas de luz', icone: 'documento', grupo: 'passos', passos: [1, 2] },
  /*
   * «COBRANÇAS», E ANTES «EMISSÃO E COBRANÇA» (17/08) E «FATURAS». Os passos 3 e
   * 4: emitir, pedir o boleto, dar baixa. «Faturas» e «Fatura unificada» lado a
   * lado não se distinguiam (o dono disse duas vezes, 17/08); «Cobranças» e
   * «Contas de luz» são a saída e a entrada do mês, e não dividem palavra.
   * A rota `/cobranca` é OUTRA tela (Conector Sicoob, na Empresa) — a do
   * endereço não é a do nome, e fica assim para nenhum link antigo quebrar.
   */
  { funil: 'rateio', rota: '/faturas',    titulo: 'Cobranças', icone: 'faturas', grupo: 'passos', passos: [3, 4] },
  /* Repasse por dono, comissão por originador e uso da usina: é a APURAÇÃO do
   * rateio. O que a empresa DEVE por causa deles aparece do outro lado, em
   * Contas a pagar — provisionado pela divisão do dinheiro, nunca digitado. */
  { funil: 'rateio', rota: '/relatorios', titulo: 'Relatórios', icone: 'relatorios', grupo: 'resultado' },

  // ====================================================== FINANCEIRO EMPRESA
  /*
   * A PONTE ENTRE OS DOIS FUNIS, e a primeira tela da Empresa de propósito: quem
   * abre este lado quer saber quanto vai entrar. Lê toda fatura emitida e ainda
   * não paga, de qualquer mês, com os dias de atraso e a situação do boleto. Não
   * tem botão de cobrar — cobrar é ato do Rateio, e a tela aponta para lá.
   * Entrou em 22/09/2026 junto com os funis.
   */
  { funil: 'empresa', rota: '/contas-a-receber', titulo: 'Contas a receber', icone: 'contas_a_receber', grupo: 'caixa' },
  /* Só tem linha depois de a primeira fatura ser liquidada — a divisão do
   * dinheiro as provisiona. O vazio aqui tem significado, e a tela o diz.
   * É o PASSO 5 do mês do Rateio — o último —, e por isso vem depois de Contas a
   * receber: primeiro o que entra, depois o que se reparte e se paga. */
  { funil: 'empresa', rota: '/contas-a-pagar',   titulo: 'Contas a pagar', icone: 'contas_a_pagar', grupo: 'caixa', passos: [5] },
  /*
   * "COBRANÇA" DIZIA O CONTRÁRIO DO QUE A TELA FAZ: aqui se cadastra a CREDENCIAL
   * do banco — agência, conta, convênio, validade do A1 e a `credencial_ref`. O
   * nome do banco entra no rótulo porque, enquanto for um, a tela não finge que
   * há opção. É configuração da empresa, e por isso mora deste lado.
   */
  { funil: 'empresa', rota: '/cobranca',         titulo: 'Conector Sicoob', icone: 'cobranca', grupo: 'apoio' },
  /*
   * A ÚLTIMA DE TODAS: as doze acima são onde o trabalho ACONTECE; esta é onde se
   * pergunta o que aconteceu. A trilha atravessa os dois funis igualmente, e fica
   * na Empresa porque é aqui que "quem mexeu nisto?" custa caro o suficiente para
   * alguém procurar. Entrou em 10/09/2026: o dado existia desde a primeira semana
   * (21.917 registros) e não havia leitor.
   */
  { funil: 'empresa', rota: '/historico',        titulo: 'Histórico', icone: 'historico', grupo: 'apoio' },

  // ============================================ ADMINISTRAÇÃO DA PLATAFORMA
  /*
   * UMA TELA SÓ, e ela faz as duas coisas pedidas em 30/09/2026: cadastrar
   * pessoa e marcar, por caixa, os setores de cada uma. «Usuários», e não
   * «Pessoas» nem «Acessos»: é a palavra do pedido do dono.
   */
  { funil: 'administracao', rota: '/usuarios', titulo: 'Usuários', icone: 'usuarios', grupo: 'abertura',
    resumo: 'Cadastrar e escolher o que cada um vê' },
] as const;

/** A tela de um caminho. Caminho desconhecido — inclusive `/` — cai na primeira,
 *  que é Mês: a tela que diz em que pé está o mês é o lugar certo para se
 *  perder. E é o que faz o `/prontidao` antigo continuar levando ao lugar certo. */
export const telaDoCaminho = (caminho: string): Tela =>
  TELAS.find((t) => t.rota === caminho) ?? TELAS[0]!;

/** As telas de um funil, na ordem do menu — que é a ordem do trabalho. */
export const telasDoFunil = (funil: ChaveDoFunil): readonly Tela[] =>
  TELAS.filter((t) => t.funil === funil);

/** A primeira tela de um funil — para onde o seletor leva ao trocar de lado. */
export const primeiraTelaDoFunil = (funil: ChaveDoFunil): Tela => telasDoFunil(funil)[0]!;

/** O funil em que um caminho está. Derivado da tela, e não guardado em estado:
 *  o endereço já diz de que lado a pessoa está, e dois lugares para a mesma
 *  verdade é como eles passam a discordar. */
export const funilDoCaminho = (caminho: string): Funil =>
  FUNIS.find((f) => f.chave === telaDoCaminho(caminho).funil)!;

/** Os funis de uma pasta do menu, na ordem declarada. */
export const funisDaPasta = (pasta: PastaDoMenu): readonly Funil[] =>
  FUNIS.filter((f) => f.pasta === pasta);

/**
 * OS FUNIS QUE O VÍNCULO VÊ. `setores` vem da sessão; ausente (servidor sem a
 * migration 41, ou vínculo ainda não escolhido) é o que todo vínculo via até
 * então — os dois setores financeiros, nunca a Administração. Lista que não
 * casa nada também cai aí: um menu vazio não é estado que a tela saiba
 * desenhar.
 */
export function funisVisiveis(setores: readonly string[] | undefined | null): readonly Funil[] {
  const vistos = FUNIS.filter((f) => setores?.includes(f.chave));
  return vistos.length ? vistos : FUNIS.filter((f) => f.chave === 'rateio' || f.chave === 'empresa');
}

/**
 * PARA ONDE O ENDEREÇO LEVA quem não vê o setor dele: a primeira tela do
 * primeiro setor visível. `null` quando o endereço já é visível — e aí nada
 * muda. O endereço é a verdade do funil ativo (`funilDoCaminho`), então o
 * desvio acontece NO endereço, e não num estado paralelo que diria outra coisa.
 */
export function destinoVisivel(caminho: string, setores: readonly string[] | undefined | null): string | null {
  const visiveis = funisVisiveis(setores);
  const atual = funilDoCaminho(caminho);
  if (visiveis.some((f) => f.chave === atual.chave)) return null;
  return primeiraTelaDoFunil(visiveis[0]!.chave).rota;
}

/** Uma seção do menu lateral: o título (ou nenhum, na abertura) e as telas dela. */
export type SecaoDoMenu = {
  grupo: GrupoDeTela;
  titulo: string | null;
  telas: readonly Tela[];
};

/**
 * O QUE O MENU LATERAL DESENHA, na ordem: uma seção por trecho contíguo de
 * telas do mesmo grupo. Dado puro, para a suíte afirmar o que o menu mostra
 * sem montar React — e para uma tela reordenada levar a seção junto, em vez de
 * uma lista de seções escrita à mão que discordaria da de telas.
 *
 * GRUPO REPETIDO DEPOIS DE OUTRO vira DUAS seções com o mesmo título, e isso é
 * de propósito: é o sintoma visível de uma tela fora do lugar, e a `I4h` o
 * recusa antes de chegar à tela.
 */
export function secoesDoMenu(telas: readonly Tela[]): SecaoDoMenu[] {
  const secoes: SecaoDoMenu[] = [];
  for (const t of telas) {
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.grupo === t.grupo) secoes[secoes.length - 1] = { ...ultima, telas: [...ultima.telas, t] };
    else secoes.push({ grupo: t.grupo, titulo: SECAO_DO_GRUPO[t.grupo].titulo, telas: [t] });
  }
  return secoes;
}

/**
 * ONDE UMA TELA ESTÁ NO MENU DO SETOR DELA, nome por nome: `['Cadastros',
 * 'Unidades consumidoras']`, `['O mês, passo a passo', 'Contas de luz']` — e
 * `['Mês']` para a abertura, que não tem título de seção. `null` para rota que
 * não é item de menu nenhum.
 *
 * É O QUE «RÓTULO DO ITEM» QUER DIZER (`RM13`, `A9y`): o ÚLTIMO nome é o que a
 * pessoa lê no lugar em que clica, e todo «Abrir X» que um texto oferece tem de
 * ser, letra por letra, esse nome. Até 30/09/2026 era `caminhoNaBarra`, com o
 * menu suspenso «Cadastros ▾» no meio do caminho; no menu lateral o item é um
 * clique só, e a seção é onde o olho o procura.
 */
export function caminhoNoMenu(rota: string): readonly string[] | null {
  const tela = TELAS.find((t) => t.rota === rota);
  if (!tela) return null;
  const secao = secoesDoMenu(telasDoFunil(tela.funil)).find((s) => s.telas.some((t) => t.rota === rota));
  if (!secao) return null;
  return secao.titulo ? [secao.titulo, tela.titulo] : [tela.titulo];
}

/** «1–2», «3–4», «5»: os passos de uma tela como o menu os mostra. Vazio para a
 *  tela que não é passo do mês. O traço é o meia-risca de intervalo, e dois
 *  passos seguidos viram intervalo — hoje não há tela com passos salteados. */
export function rotuloDosPassos(passos: readonly number[] | undefined): string {
  if (!passos || passos.length === 0) return '';
  return passos.length === 1 ? String(passos[0]) : `${passos[0]}\u2013${passos[passos.length - 1]}`;
}

/** A mesma informação por extenso, para o leitor de tela e para a dica:
 *  «passos 1 e 2 do mês», «passo 5 do mês». */
export function fraseDosPassos(passos: readonly number[] | undefined): string {
  if (!passos || passos.length === 0) return '';
  if (passos.length === 1) return `passo ${passos[0]} do mês`;
  return `passos ${passos.slice(0, -1).join(', ')} e ${passos[passos.length - 1]} do mês`;
}
