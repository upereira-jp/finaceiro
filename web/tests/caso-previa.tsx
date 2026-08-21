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
import { Aviso, DetalheTecnico } from '../src/ui.tsx';
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

/**
 * OS AVISOS DAS TELAS, do jeito que ficaram em 21/08/2026.
 *
 * Existe porque a varredura de vocabulario move o jargao para dentro do
 * `<DetalheTecnico>`, e isso e uma mudanca de TEXTO que produz uma mudanca de
 * DESENHO: passa a haver um botao dentro do corpo de um `<Aviso>`, que ate entao
 * so tinha paragrafo. A suite le string; so a foto mostra se o botao cabe.
 *
 * Os tres tipos juntos de proposito: o vermelho e o que mais aparece na primeira
 * semana, e e nele que o contraste do botao pode sumir.
 */
export const avisos = renderToStaticMarkup(
  <div className="conteudo">
    <h1>Como os avisos ficaram</h1>
    <Aviso tipo="erro">
      <strong>11 de 29 sem CPF/CNPJ.</strong> Sem esse número o contrato do cliente não pode ser
      ativado — e sem contrato ativo a cobrança dele não sai.{' '}
      <strong>Preencha na coluna Documento</strong>, na linha do cliente.
      <DetalheTecnico>
        <p style={{ margin: 0 }}>
          Sem documento o contrato não vai para <code>ativo</code> (R9), a triagem recusa por{' '}
          <code>sem_contrato_vigente</code> e o boleto para em <code>PagadorSemDocumento</code>.
        </p>
      </DetalheTecnico>
    </Aviso>
    <Aviso tipo="alerta">
      <strong>7 unidade(s) sem o endereço completo.</strong> É o endereço que sai impresso no
      boleto. <strong>Isto não impede cobrar</strong> — por isso é aviso e não erro.
      <DetalheTecnico>
        <p style={{ margin: 0 }}>
          O que a Sicoob exige de endereço ainda não foi medido (<code>Q-PAGADOR-01</code>, item c).
        </p>
      </DetalheTecnico>
    </Aviso>
    <Aviso tipo="ok">Endereço da 3001234 gravado.</Aviso>
  </div>);
