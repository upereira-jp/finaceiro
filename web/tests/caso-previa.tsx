// OS ESTADOS DO PAINEL DE AJUDA que valem uma FOTO. Roda por `previa.ts`.
//
// Isto NAO e um teste e nao afirma nada — quem afirma e `caso-render.tsx`, que
// monta os mesmos componentes e mede o HTML. Aqui o alvo e outro: pintar o painel
// com o CSS de verdade para alguem OLHAR.
//
// ============================================================================
// POR QUE OLHAR AINDA E NECESSARIO com uma suite de render verde
//
// Em 21/08/2026 o `caso-render.tsx` passava com 76 verificacoes e o painel tinha
// um defeito visivel na primeira olhada: as perguntas dos assuntos saiam
// CENTRADAS. A regra base de `button` e `justify-content: center`, e
// `.ajuda-pergunta` so declarava `text-align: left` — que governa o texto dentro
// da caixa, e nao a caixa. Sete perguntas, cada uma comecando num recuo diferente
// conforme o comprimento, numa lista feita para ser varrida.
//
// NENHUMA ASSERCAO SOBRE HTML PEGARIA ISSO: a marcacao estava certa, o texto
// estava certo, os botoes estavam certos. O defeito so existia depois de o CSS
// ser aplicado por um motor de layout. Foi esta ferramenta que o mostrou — e no
// mesmo dia ela mostrou tambem que as duas bolhas do balao, desenhadas na cor do
// balao, ficavam brancas sobre o creme da pagina e simplesmente nao apareciam.
//
// Uso: `npm run --silent previa -- /caminho/de/saida` e abrir os `.html`.

import { renderToStaticMarkup } from 'react-dom/server';
import { CorpoDaAjuda } from '../src/ajuda-corpo.tsx';
import { passosDoEstado, type CamadaLida } from '../src/ajuda.ts';

const c = (p: Partial<CamadaLida>): CamadaLida =>
  ({ camada: 'vencimento', situacao: 'pendente', faltam: 3, total: 29, efeito: 'bloqueia_fatura', ...p });

/* O mes travado de verdade, com as quatro formas de linha ao mesmo tempo: duas
 * com tela de preencher, uma SEM tela (energia gerada, espelhada do CRM) e uma
 * que nao impede cobrar (dono da usina, com a etiqueta de efeito). */
const passos = passosDoEstado([
  c({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
  c({ camada: 'contrato_ativo', faltam: 29, total: 29 }),
  c({ camada: 'geracao_da_competencia', faltam: 2, total: 4 }),
  c({ camada: 'dono_da_usina', faltam: 4, total: 4, efeito: 'bloqueia_split' }),
]);

/** Aberto numa tela, sem ninguem ter buscado nada: o estado ao vivo e o contexto. */
export const parado = renderToStaticMarkup(
  <CorpoDaAjuda rota="/unidades" passos={passos} carregando={false} falhou={false}
                aoFechar={() => {}} ir={() => {}} />);

/** Uma busca que acerta: a resposta aberta, com os passos e os dois caminhos. */
export const buscando = renderToStaticMarkup(
  <CorpoDaAjuda rota="/faturas" passos={[]} carregando={false} falhou={false}
                aoFechar={() => {}} ir={() => {}} consultaInicial="cadê o boleto" />);

/** Uma busca que NAO acerta assunto nenhum, e ainda assim termina numa tela. */
export const vazio = renderToStaticMarkup(
  <CorpoDaAjuda rota="/faturas" passos={[]} carregando={false} falhou={false}
                aoFechar={() => {}} ir={() => {}} consultaInicial="onde ficam as usinas" />);
