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
  { rota: '/pendencias', titulo: 'Pendências', icone: 'prontidao',  grupo: 'cadastro' },
  { rota: '/clientes',   titulo: 'Clientes',   icone: 'clientes',   grupo: 'cadastro' },
  { rota: '/unidades',   titulo: 'Unidades',   icone: 'unidades',   grupo: 'cadastro' },
  { rota: '/contratos',  titulo: 'Contratos',  icone: 'contratos',  grupo: 'cadastro' },
  { rota: '/usinas',     titulo: 'Usinas',     icone: 'usinas',     grupo: 'cadastro' },
  { rota: '/donos',      titulo: 'Donos',      icone: 'donos',      grupo: 'cadastro' },
  { rota: '/tarifas',    titulo: 'Tarifas',    icone: 'tarifas',    grupo: 'cadastro' },
  { rota: '/carteira',   titulo: 'Carteira',   icone: 'carteira',   grupo: 'dinheiro' },
  { rota: '/faturas',    titulo: 'Faturas',    icone: 'faturas',    grupo: 'dinheiro' },
  { rota: '/cobranca',   titulo: 'Cobrança',   icone: 'cobranca',   grupo: 'dinheiro' },
  { rota: '/documento',  titulo: 'Documento',  icone: 'documento',  grupo: 'dinheiro' },
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
