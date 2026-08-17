// A NAVEGAÇÃO COMO DADO PURO: rota, título, ícone e grupo. Sem JSX.
//
// POR QUE ELA SAIU DO `app.tsx` EM 30/07/2026. A lista de telas carregava três
// decisões documentadas — a ORDEM (que é a ordem das camadas da prontidão,
// depois a ordem dos atos do dinheiro), o RÓTULO e agora o ÍCONE — e vivia dentro
// de um `.tsx`, junto do `render`. O runner do `web/` não lê JSX (é
// `node --experimental-strip-types`), então nada ali podia ser verificado: era o
// mesmo motivo de `contrato-regras.ts` e `cobranca-regras.ts` existirem fora das
// telas. Regra 8.
//
// O `render` FICOU no `app.tsx`, e é a divisão certa: aqui está o que a
// navegação É, lá está o que ela MOSTRA. Quem acrescenta uma tela acrescenta uma
// linha aqui e um caso lá, e o `tsc` recusa se esquecer o segundo (`Record`
// exaustivo em `app.tsx`) — não é disciplina de quem escreve, é o compilador.
//
// OS RÓTULOS FORAM REVISTOS EM 17/08/2026, a pedido do dono, e o critério foi um
// só: **o rótulo descreve a tela, não a intenção de quem a escreveu.** Cinco
// mudaram — `Unidades consumidoras`, `Donos de usina`, `Faturamento`,
// `Conector Sicoob` e `Fatura unificada` —, cada um com o motivo na própria
// linha. No mesmo dia entrou um SEXTO, e ele corrige o quinto: `Faturas` virou
// `Emissão e cobrança` porque o rótulo novo da vizinha a deixou começando pela
// mesma palavra. O motivo está na linha de `/faturas`.
//
// Três coisas NÃO mudaram junto, e as três de propósito:
//
//   as ROTAS          `/carteira`, `/cobranca` e `/documento` continuam iguais.
//                     `/documento#cadastro` está citado na `PENDENCIAS` e é o
//                     único caminho de tela para o emissor;
//   os NOMES DE       `carteira.tsx`, `cobranca.tsx`, `documento.tsx`, os
//   DOMÍNIO           repositórios e as tabelas. Rótulo é o que a pessoa lê;
//                     domínio é o que o sistema é. Foi assim que "Prontidão"
//                     virou "Pendências" em 30/07 sem mover uma linha de
//                     `repos/prontidao.ts`;
//   "Pendências"      decisão registrada do dono, e não se desfaz sozinha.
//
// A ORDEM NÃO É ALFABÉTICA NEM DE IMPORTÂNCIA, e isso é deliberado: quem abre o
// sistema hoje precisa fechar quatro camadas de cadastro para a primeira fatura
// existir, e a barra é a ordem em que o trabalho destrava o próximo passo.
// Depois do cadastro vem o dinheiro, na ordem dos ATOS: compor (Carteira),
// emitir e cobrar (Faturas), configurar o banco (Cobrança), o documento que o
// cliente recebe (Documento), conferir (Relatórios).

import type { NomeDeIcone } from './iconografia.ts';

/** Os dois grupos existem para a barra poder SEPARAR cadastro de dinheiro com
 *  uma divisória fina em vez de doze abas iguais em fila. É a mesma fronteira
 *  que o comentário acima descreve — só passou a ser visível. */
export type GrupoDeTela = 'cadastro' | 'dinheiro';

export type Tela = {
  rota: string;
  titulo: string;
  icone: NomeDeIcone;
  grupo: GrupoDeTela;
};

export const TELAS: readonly Tela[] = [
  /*
   * "Pendências", e não "Prontidão" — decisão do dono em 30/07/2026, depois de
   * abrir o sistema pela primeira vez: *"mude o nome, é pouco claro"*.
   *
   * O RÓTULO e a ROTA mudaram; o domínio NÃO. `src/repos/prontidao.ts`,
   * `prontidao()` e as dez camadas seguem com o nome antigo, porque aí
   * "prontidão" nomeia um CÁLCULO ("o quanto esta competência está pronta") e
   * não um item de lista. `/prontidao` continua funcionando por acidente feliz do
   * `telaDoCaminho`: caminho desconhecido cai na primeira tela, que é esta.
   */
  { rota: '/pendencias', titulo: 'Pendências', icone: 'prontidao', grupo: 'cadastro' },
  { rota: '/clientes',   titulo: 'Clientes',   icone: 'clientes',  grupo: 'cadastro' },
  /* "Unidades" sozinho, ao lado de "Usinas", troca o PONTO DE CONSUMO pelo
   * GERADOR - as duas primeiras letras coincidem e as duas telas sao vizinhas na
   * barra. O termo do `GLOSSARIO` e "UC / unidade consumidora", e o titulo da
   * pagina ja dizia o nome inteiro: o rotulo e que estava abreviado. */
  { rota: '/unidades',   titulo: 'Unidades consumidoras', icone: 'unidades', grupo: 'cadastro' },
  { rota: '/contratos',  titulo: 'Contratos',  icone: 'contratos', grupo: 'cadastro' },
  { rota: '/usinas',     titulo: 'Usinas',     icone: 'usinas',    grupo: 'cadastro' },
  /* "Donos" nao diz de QUE. E o cadastro de quem recebe o repasse - o maior
   * fluxo de dinheiro do sistema -, e "dono de usina" e o termo do `GLOSSARIO`. */
  { rota: '/donos',      titulo: 'Donos de usina', icone: 'donos', grupo: 'cadastro' },
  /*
   * A ABA TARIFAS SAIU EM 14/08/2026, por decisao do dono: *"remova
   * definitivamente a aba Tarifas, pois ela ja nao possui finalidade e apenas
   * gera redundancia."*
   *
   * O QUE A SUBSTITUI, e a medicao que decidiu: a tarifa e R$/kWh de CADA UC e
   * se preenche na aba Unidades (migration 30). A aba servia uma tabela com UMA
   * linha - Equatorial, R$ 1,130000 - contra os R$ 1,185396 medidos na fatura
   * real, e ninguem percebeu porque zero faturas foram emitidas. A granularidade
   * real e por cliente: 35 UCs a 1,130000, 4 a 1,16 e 2 a 1,180000.
   */
  /*
   * "CARTEIRA" ERA JARGAO BANCARIO PARA O ATO DE GERAR, e escondia o unico
   * lugar onde a fatura do mes NASCE: ensaiar a triagem e compor os rascunhos.
   * Quem procurasse "onde eu faturo o mes" nao tinha por que abrir "Carteira".
   *
   * `Faturamento` nao e palavra nova: e a que o sistema ja usa em
   * `src/dominio/faturamento.ts` e nas rotas `/faturamento/:competencia/compor`
   * e `/emitir`. O rotulo passou a dizer o que o servidor sempre chamou (regra 7).
   *
   * E O PAR COM "Faturas" E A ORDEM DO TRABALHO, nao uma repeticao:
   * **Faturamento** gera o lote -> **Faturas** emite, cobra e da baixa.
   */
  { rota: '/carteira',   titulo: 'Faturamento', icone: 'carteira',  grupo: 'dinheiro' },
  /*
   * "FATURAS" E "FATURA UNIFICADA" LADO A LADO NAO SE DISTINGUIAM, e o dono
   * disse isso duas vezes: primeiro *"qual a diferenca entre a aba Faturas e a
   * aba Documento?"* — que motivou o rotulo `Fatura unificada` em 17/08 —, e
   * depois *"o nome faturas e fatura unificada esta causando confusao"*. A
   * segunda frase mede a primeira correcao: trocar `Documento` por
   * `Fatura unificada` deixou as DUAS comecando pela mesma palavra, e vizinhas.
   *
   * QUAL DOS DOIS CEDE, e por que este. `Fatura unificada` e nome de
   * funcionalidade dado pelo dono e esta em quatro arquivos e numa tabela
   * (`fatura-unificada.tsx`, `dominio/fatura-unificada.ts`, `abas-da-fatura.ts`,
   * `registro_de_fatura_unificada`) — mudar o rotulo dele criaria sinonimo, que
   * e divida de leitura (regra 7). `Faturas` nao nomeia nada: era so o plural da
   * entidade, e a entidade aparece em TODAS as telas do grupo.
   *
   * `Emissao e cobranca` sao os ATOS da tela, e sao os tres botoes que ela tem:
   * emitir a fatura, pedir ou importar o boleto, dar baixa. E o par com a
   * vizinha da esquerda continua legivel na ordem do trabalho:
   * **Faturamento** gera o lote -> **Emissao e cobranca** emite, cobra e baixa.
   *
   * NAO VIROU "Cobranca" SOZINHO de proposito: a rota `/cobranca` e OUTRA tela
   * (Conector Sicoob). Um rotulo `Cobranca` apontando para `/faturas` poria as
   * duas em desacordo para quem le o codigo.
   */
  { rota: '/faturas',    titulo: 'Emissão e cobrança', icone: 'faturas', grupo: 'dinheiro' },
  /*
   * "COBRANCA" DIZIA O CONTRARIO DO QUE A TELA FAZ. Cobrar acontece na aba ao
   * lado — `Emissao e cobranca`, a antiga `Faturas`;
   * aqui se cadastra a CREDENCIAL do banco - agencia, conta, convenio, validade
   * do A1 e a `credencial_ref`. Quem abrisse "Cobranca" para cobrar um cliente
   * encontrava um formulario de credencial, que e o oposto do que procurava.
   *
   * O nome do banco entra no rotulo pela mesma razao que o campo `provedor` nao
   * e escolha na tela: enquanto for um, ela nao finge que ha opcao.
   */
  { rota: '/cobranca',   titulo: 'Conector Sicoob', icone: 'cobranca', grupo: 'dinheiro' },
  /*
   * "DOCUMENTO" NAO DIZIA QUAL, e havia dois candidatos na mesma barra: a fatura
   * que o sistema calcula (Faturas) e a folha que o cliente recebe. A pergunta
   * "qual a diferenca entre a aba Faturas e a aba Documento?" foi feita, e uma
   * barra que precisa de explicacao ja respondeu.
   *
   * `Fatura unificada` e como o projeto INTEIRO ja a chama - `fatura-unificada.tsx`,
   * `dominio/fatura-unificada.ts`, a tabela `registro_de_fatura_unificada` e o
   * `REFERENCIA-fatura-unificada-2026-08-13.md`. So a barra dizia outra coisa, e
   * sinonimo e divida de leitura (regra 7).
   *
   * A ROTA NAO MUDA. `/documento#cadastro` esta citado na `PENDENCIAS` §2.a item
   * 5 e e o unico caminho de tela para o emissor; trocar o endereco quebraria o
   * apontador sem ganhar nada.
   */
  { rota: '/documento',  titulo: 'Fatura unificada', icone: 'documento', grupo: 'dinheiro' },
  /* A ULTIMA DO GRUPO DINHEIRO, e a posicao e a mesma decisao de ordem que o
   * cabecalho descreve: a vertente do CLIENTE (compor, emitir, cobrar,
   * documentar) vem antes da vertente da EMPRESA, porque e o dinheiro que
   * entra que produz o que sai. Contas a pagar so tem linha depois de a
   * primeira fatura ser liquidada - o split as provisiona. */
  { rota: '/contas-a-pagar', titulo: 'Contas a pagar', icone: 'contas_a_pagar', grupo: 'dinheiro' },
  { rota: '/relatorios', titulo: 'Relatórios', icone: 'relatorios', grupo: 'dinheiro' },
] as const;

/** A tela de um caminho. Caminho desconhecido — inclusive `/` — cai na primeira,
 *  que é Pendências: a tela que diz o que falta é o lugar certo para se perder.
 *  E é o que faz o `/prontidao` antigo continuar levando ao lugar certo. */
export const telaDoCaminho = (caminho: string): Tela =>
  TELAS.find((t) => t.rota === caminho) ?? TELAS[0];

/** Onde a divisória entre cadastro e dinheiro cai — o índice da primeira tela do
 *  segundo grupo. Calculado, não escrito: reordenar as telas acima move a
 *  divisória junto, e uma constante `7` não moveria. */
export const inicioDoGrupoDinheiro = TELAS.findIndex((t) => t.grupo === 'dinheiro');
