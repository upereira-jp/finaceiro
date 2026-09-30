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
// POR QUE ESTE ARQUIVO É DADO E NÃO JSX (30/07/2026)
//
// O runner do `web/` é `node --experimental-strip-types`, que não lê JSX. O que
// precisa de teste sai do `.tsx` — regra 8. O `render` ficou no `app.tsx`, e o
// `Record` exaustivo de lá recusa compilar uma tela sem componente.
//
// A ORDEM DENTRO DE CADA FUNIL NÃO É ALFABÉTICA, e isso é deliberado. No Rateio,
// primeiro o trabalho do mês na ordem dos ATOS: o mês inteiro (Mês), ler a conta
// e gerar a cobrança (Contas de luz), emitir, boleto e baixa (Cobranças), conferir
// (Relatórios) — e por último os cadastros, que a barra junta num menu. Na
// Empresa: o que entra, o que sai, o banco, o histórico.

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
// (migration 41), marcado por caixa na tela de Usuários. A barra só desenha o
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
  /** O que a barra mostra — curto, porque fica ao lado da marca «Financeiro G3». */
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
    descricao: 'O dinheiro que entra dos clientes: usinas, unidades, contratos, a conta lida, '
             + 'a fatura, o boleto e a cobrança.',
    resumo: 'Usinas, clientes, faturas e cobrança',
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
 * O grupo separa, DENTRO de um funil, blocos que a barra desenha com uma
 * divisória fina. No Rateio é trabalho ‖ cadastro; na Empresa é dinheiro ‖ apoio
 * (o banco e o histórico não são atos de caixa — são o que sustenta os atos).
 *
 * `trabalho` ENTROU EM 30/09/2026, e o nome é a decisão: até ali a primeira
 * tela do Rateio era do grupo `cadastro` (a lista de pendências abria a fila de
 * cadastros) e as de dinheiro vinham depois. Agora o mês vem primeiro.
 */
export type GrupoDeTela = 'trabalho' | 'cadastro' | 'dinheiro' | 'apoio';

/**
 * OS GRUPOS QUE A BARRA DESENHA COMO MENU, e não aba a aba.
 *
 * Só o cadastro, e o critério é a frequência: o trabalho do mês é aberto todo
 * dia e precisa estar à vista; os cadastros são abertos quando o mês acusa algo
 * — e aí a pendência chega com o link direto, sem passar pela barra. Cinco abas
 * de cadastro na mesma fileira do trabalho eram o que empurrava o trabalho para
 * fora da tela no celular.
 *
 * O `rotulo` é o nome do menu na barra; os ITENS são as telas do grupo, com o
 * `titulo` de cada uma — e é esse `titulo` que o roteiro, a ajuda e a tela de
 * Mês usam para nomeá-las (`RM13`, `caminhoNaBarra`).
 */
export const MENU_DO_GRUPO: Partial<Record<GrupoDeTela, { rotulo: string; icone: NomeDeIcone }>> = {
  cadastro: { rotulo: 'Cadastros', icone: 'cadastros' },
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
  { funil: 'rateio', rota: '/pendencias', titulo: 'Mês', icone: 'prontidao', grupo: 'trabalho' },
  /*
   * «CONTAS DE LUZ», E ANTES «FATURA UNIFICADA» (17/08) E «DOCUMENTO». É a tela
   * dos passos 1 e 2: a conta da distribuidora entra, é conferida, registrada e
   * vira cobrança — e a folha do cliente, a Fatura unificada, se imprime aqui na
   * aba «2 · Folha do cliente». A ROTA NÃO MUDA: `/documento#cadastro` abre
   * direto a aba do emissor, «3 · Cadastro da fatura».
   */
  { funil: 'rateio', rota: '/documento',  titulo: 'Contas de luz', icone: 'documento', grupo: 'trabalho' },
  /*
   * «COBRANÇAS», E ANTES «EMISSÃO E COBRANÇA» (17/08) E «FATURAS». Os passos 3 e
   * 4: emitir, pedir o boleto, dar baixa. «Faturas» e «Fatura unificada» lado a
   * lado não se distinguiam (o dono disse duas vezes, 17/08); «Cobranças» e
   * «Contas de luz» são a saída e a entrada do mês, e não dividem palavra.
   * A rota `/cobranca` é OUTRA tela (Conector Sicoob, na Empresa) — a do
   * endereço não é a do nome, e fica assim para nenhum link antigo quebrar.
   */
  { funil: 'rateio', rota: '/faturas',    titulo: 'Cobranças', icone: 'faturas', grupo: 'trabalho' },
  /* Repasse por dono, comissão por originador e uso da usina: é a APURAÇÃO do
   * rateio. O que a empresa DEVE por causa deles aparece do outro lado, em
   * Contas a pagar — provisionado pela divisão do dinheiro, nunca digitado. */
  { funil: 'rateio', rota: '/relatorios', titulo: 'Relatórios', icone: 'relatorios', grupo: 'trabalho' },
  /*
   * OS CADASTROS, no menu «Cadastros ▾» desde 30/09/2026 (`MENU_DO_GRUPO`). A
   * ordem é a em que uma camada destrava a próxima: quem paga, onde consome, o
   * contrato, a usina que gera, quem recebe o repasse.
   *
   * A ABA «Tarifas» SAIU EM 14/08/2026 (a tarifa virou coluna da unidade,
   * migration 30) e a ABA «Faturamento» (`/carteira`) SAIU EM 10/09/2026 — era o
   * caminho aposentado desde a `Q-CICLO-01`, e compor por ela TRAVAVA a unidade
   * no caminho oficial (`uc_ja_faturada`). O motor (`POST
   * /faturamento/:competencia/compor`) segue no servidor sem tela, e apagá-lo
   * tem dono (`Q-CICLO-02`).
   */
  { funil: 'rateio', rota: '/clientes',   titulo: 'Clientes',   icone: 'clientes',  grupo: 'cadastro' },
  /* "Unidades" sozinho, ao lado de "Usinas", troca o PONTO DE CONSUMO pelo
   * GERADOR. O termo do `GLOSSARIO` é "UC / unidade consumidora". */
  { funil: 'rateio', rota: '/unidades',   titulo: 'Unidades consumidoras', icone: 'unidades', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/contratos',  titulo: 'Contratos',  icone: 'contratos', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/usinas',     titulo: 'Usinas',     icone: 'usinas',    grupo: 'cadastro' },
  /* "Donos" não diz de QUE. É o cadastro de quem recebe o repasse — o maior
   * fluxo de dinheiro do sistema —, e "dono de usina" é o termo do `GLOSSARIO`. */
  { funil: 'rateio', rota: '/donos',      titulo: 'Donos de usina', icone: 'donos', grupo: 'cadastro' },

  // ====================================================== FINANCEIRO EMPRESA
  /*
   * A PONTE ENTRE OS DOIS FUNIS, e a primeira tela da Empresa de propósito: quem
   * abre este lado quer saber quanto vai entrar. Lê toda fatura emitida e ainda
   * não paga, de qualquer mês, com os dias de atraso e a situação do boleto. Não
   * tem botão de cobrar — cobrar é ato do Rateio, e a tela aponta para lá.
   * Entrou em 22/09/2026 junto com os funis.
   */
  { funil: 'empresa', rota: '/contas-a-receber', titulo: 'Contas a receber', icone: 'contas_a_receber', grupo: 'dinheiro' },
  /* Só tem linha depois de a primeira fatura ser liquidada — a divisão do
   * dinheiro as provisiona. O vazio aqui tem significado, e a tela o diz. */
  { funil: 'empresa', rota: '/contas-a-pagar',   titulo: 'Contas a pagar', icone: 'contas_a_pagar', grupo: 'dinheiro' },
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
  { funil: 'administracao', rota: '/usuarios', titulo: 'Usuários', icone: 'usuarios', grupo: 'apoio',
    resumo: 'Cadastrar e escolher o que cada um vê' },
] as const;

/** A tela de um caminho. Caminho desconhecido — inclusive `/` — cai na primeira,
 *  que é Mês: a tela que diz em que pé está o mês é o lugar certo para se
 *  perder. E é o que faz o `/prontidao` antigo continuar levando ao lugar certo. */
export const telaDoCaminho = (caminho: string): Tela =>
  TELAS.find((t) => t.rota === caminho) ?? TELAS[0]!;

/** As telas de um funil, na ordem da barra. */
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
 * casa nada também cai aí: uma barra vazia não é estado que a tela saiba
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

/**
 * Onde a barra desenha divisória: os índices, DENTRO da lista dada, em que o
 * grupo muda em relação ao vizinho da esquerda. Calculado, não escrito —
 * reordenar as telas move a divisória junto, e uma constante `7` não moveria.
 * Serve às telas e aos itens da barra (`itensDaBarra`), que também têm grupo.
 */
export const divisoriasDe = <T extends { grupo: GrupoDeTela }>(itens: readonly T[]): readonly number[] =>
  itens.flatMap((t, i) => (i > 0 && t.grupo !== itens[i - 1]!.grupo ? [i] : []));

/** Um item da barra de baixo: uma aba, ou um menu que junta as telas de um grupo. */
export type ItemDaBarra =
  | { tipo: 'tela'; grupo: GrupoDeTela; tela: Tela }
  | { tipo: 'menu'; grupo: GrupoDeTela; rotulo: string; icone: NomeDeIcone; telas: readonly Tela[] };

/**
 * O QUE A BARRA DESENHA, na ordem: as telas soltas como abas e cada grupo de
 * `MENU_DO_GRUPO` como UM item, no lugar em que a primeira tela dele estaria.
 * Dado puro, para a suíte poder afirmar o que a barra mostra sem montar React.
 */
export function itensDaBarra(telas: readonly Tela[]): ItemDaBarra[] {
  const itens: ItemDaBarra[] = [];
  for (const t of telas) {
    const menu = MENU_DO_GRUPO[t.grupo];
    const ultimo = itens[itens.length - 1];
    if (!menu) itens.push({ tipo: 'tela', grupo: t.grupo, tela: t });
    else if (ultimo?.tipo === 'menu' && ultimo.grupo === t.grupo) itens[itens.length - 1] = { ...ultimo, telas: [...ultimo.telas, t] };
    else itens.push({ tipo: 'menu', grupo: t.grupo, rotulo: menu.rotulo, icone: menu.icone, telas: [t] });
  }
  return itens;
}

/**
 * COMO SE CHEGA A UMA TELA PELA BARRA, nome por nome: `['Contas de luz']` para a
 * aba solta, `['Cadastros', 'Unidades consumidoras']` para o item de menu.
 * `null` para rota que não está na barra de setor nenhum.
 *
 * É O QUE «RÓTULO DA ABA» QUER DIZER DESDE QUE A BARRA TEM MENU (`RM13`): o
 * ÚLTIMO nome do caminho é o que a pessoa lê no lugar em que clica — a aba, ou o
 * item dentro do menu. Instrução que diz «abra Unidades consumidoras» continua
 * certa: a palavra está lá, um clique abaixo de «Cadastros».
 */
export function caminhoNaBarra(rota: string): readonly string[] | null {
  const tela = TELAS.find((t) => t.rota === rota);
  if (!tela) return null;
  const item = itensDaBarra(telasDoFunil(tela.funil))
    .find((i) => (i.tipo === 'tela' ? i.tela.rota === rota : i.telas.some((t) => t.rota === rota)));
  if (!item) return null;
  return item.tipo === 'tela' ? [tela.titulo] : [item.rotulo, tela.titulo];
}
