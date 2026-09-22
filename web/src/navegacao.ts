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
// O QUE NÃO MUDOU, de propósito: as ROTAS (todo favorito e todo link da ajuda
// continuam valendo), os RÓTULOS (o roteiro do mês exige que o nome no botão
// seja letra por letra o da barra — `RM13`) e os NOMES DE DOMÍNIO. Um caminho
// desconhecido continua caindo em Pendências.
//
// ============================================================================
// POR QUE ESTE ARQUIVO É DADO E NÃO JSX (30/07/2026)
//
// O runner do `web/` é `node --experimental-strip-types`, que não lê JSX. O que
// precisa de teste sai do `.tsx` — regra 8. O `render` ficou no `app.tsx`, e o
// `Record` exaustivo de lá recusa compilar uma tela sem componente.
//
// A ORDEM DENTRO DE CADA FUNIL NÃO É ALFABÉTICA, e isso é deliberado. No Rateio,
// primeiro o cadastro na ordem em que uma camada destrava a próxima, depois o
// dinheiro na ordem dos ATOS do mês: ler a conta e gerar a cobrança (Fatura
// unificada) → emitir, boleto e baixa (Emissão e cobrança) → conferir
// (Relatórios). Na Empresa: o que entra, o que sai, o banco, o histórico.

import type { NomeDeIcone } from './iconografia.ts';

export type ChaveDoFunil = 'rateio' | 'empresa';

export type Funil = {
  chave: ChaveDoFunil;
  /** O que a barra mostra — curto, porque fica ao lado da marca «Financeiro G3». */
  rotulo: string;
  /** O nome inteiro, para leitor de tela, título de página e ajuda. */
  nome: string;
  /** Uma frase: o que este funil controla. */
  descricao: string;
};

export const FUNIS: readonly Funil[] = [
  {
    chave: 'rateio', rotulo: 'Rateio', nome: 'Financeiro Rateio',
    descricao: 'O dinheiro que entra dos clientes: usinas, unidades, contratos, a conta lida, '
             + 'a fatura, o boleto e a cobrança.',
  },
  {
    chave: 'empresa', rotulo: 'Empresa', nome: 'Financeiro Empresa',
    descricao: 'O caixa da empresa: o que há para receber, o que há para pagar, o banco e o '
             + 'histórico do que foi feito.',
  },
] as const;

/**
 * O grupo separa, DENTRO de um funil, blocos que a barra desenha com uma
 * divisória fina. No Rateio é cadastro ‖ dinheiro; na Empresa é dinheiro ‖ apoio
 * (o banco e o histórico não são atos de caixa — são o que sustenta os atos).
 */
export type GrupoDeTela = 'cadastro' | 'dinheiro' | 'apoio';

export type Tela = {
  funil: ChaveDoFunil;
  rota: string;
  titulo: string;
  icone: NomeDeIcone;
  grupo: GrupoDeTela;
};

export const TELAS: readonly Tela[] = [
  // ======================================================= FINANCEIRO RATEIO
  /*
   * "Pendências", e não "Prontidão" — decisão do dono em 30/07/2026 (*"mude o
   * nome, é pouco claro"*). O domínio NÃO mudou: `src/repos/prontidao.ts` segue
   * nomeando o CÁLCULO. `/prontidao` continua funcionando por acidente feliz do
   * `telaDoCaminho`: caminho desconhecido cai na primeira tela, que é esta.
   */
  { funil: 'rateio', rota: '/pendencias', titulo: 'Pendências', icone: 'prontidao', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/clientes',   titulo: 'Clientes',   icone: 'clientes',  grupo: 'cadastro' },
  /* "Unidades" sozinho, ao lado de "Usinas", troca o PONTO DE CONSUMO pelo
   * GERADOR. O termo do `GLOSSARIO` é "UC / unidade consumidora". */
  { funil: 'rateio', rota: '/unidades',   titulo: 'Unidades consumidoras', icone: 'unidades', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/contratos',  titulo: 'Contratos',  icone: 'contratos', grupo: 'cadastro' },
  { funil: 'rateio', rota: '/usinas',     titulo: 'Usinas',     icone: 'usinas',    grupo: 'cadastro' },
  /* "Donos" não diz de QUE. É o cadastro de quem recebe o repasse — o maior
   * fluxo de dinheiro do sistema —, e "dono de usina" é o termo do `GLOSSARIO`. */
  { funil: 'rateio', rota: '/donos',      titulo: 'Donos de usina', icone: 'donos', grupo: 'cadastro' },
  /*
   * A ABA «Tarifas» SAIU EM 14/08/2026 (a tarifa virou coluna da unidade,
   * migration 30) e a ABA «Faturamento» (`/carteira`) SAIU EM 10/09/2026 — era o
   * caminho aposentado desde a `Q-CICLO-01`, e compor por ela TRAVAVA a unidade
   * no caminho oficial (`uc_ja_faturada`). Os quatro números do mês que só ela
   * tinha foram para «Emissão e cobrança». O motor (`POST
   * /faturamento/:competencia/compor`) segue no servidor sem tela, e apagá-lo
   * tem dono (`Q-CICLO-02`).
   *
   * ⚠️ A ORDEM ENTRE AS DUAS ABAIXO INVERTEU EM 22/09/2026, e é a ordem do mês:
   * a cobrança NASCE na Fatura unificada (ler a conta, conferir, gerar) e só
   * depois se emite, se pede o boleto e se dá baixa. Até então a barra dizia o
   * contrário — resto da época em que quem gerava era a «Carteira».
   */
  /*
   * "DOCUMENTO" NÃO DIZIA QUAL. `Fatura unificada` é como o projeto inteiro já a
   * chama (`fatura-unificada.tsx`, `dominio/fatura-unificada.ts`, a tabela
   * `registro_de_fatura_unificada`). A ROTA NÃO MUDA: `/documento#cadastro` é o
   * único caminho de tela para o emissor.
   */
  { funil: 'rateio', rota: '/documento',  titulo: 'Fatura unificada', icone: 'documento', grupo: 'dinheiro' },
  /*
   * "FATURAS" e "FATURA UNIFICADA" lado a lado não se distinguiam, e o dono disse
   * isso duas vezes (17/08). `Emissão e cobrança` são os ATOS da tela — os três
   * botões que ela tem: emitir, pedir ou importar o boleto, dar baixa. NÃO virou
   * "Cobrança" sozinho: a rota `/cobranca` é OUTRA tela (Conector Sicoob).
   */
  { funil: 'rateio', rota: '/faturas',    titulo: 'Emissão e cobrança', icone: 'faturas', grupo: 'dinheiro' },
  /* Repasse por dono, comissão por originador e uso da usina: é a APURAÇÃO do
   * rateio, e por isso fecha este funil. O que a empresa DEVE por causa deles
   * aparece do outro lado, em Contas a pagar — provisionado pela divisão do
   * dinheiro, nunca digitado. */
  { funil: 'rateio', rota: '/relatorios', titulo: 'Relatórios', icone: 'relatorios', grupo: 'dinheiro' },

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
] as const;

/** A tela de um caminho. Caminho desconhecido — inclusive `/` — cai na primeira,
 *  que é Pendências: a tela que diz o que falta é o lugar certo para se perder.
 *  E é o que faz o `/prontidao` antigo continuar levando ao lugar certo. */
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

/**
 * Onde a barra desenha divisória: os índices, DENTRO da lista dada, em que o
 * grupo muda em relação ao vizinho da esquerda. Calculado, não escrito —
 * reordenar as telas move a divisória junto, e uma constante `7` não moveria.
 */
export const divisoriasDe = (telas: readonly Tela[]): readonly number[] =>
  telas.flatMap((t, i) => (i > 0 && t.grupo !== telas[i - 1]!.grupo ? [i] : []));
