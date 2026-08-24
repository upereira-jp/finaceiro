// O DESENHO DA CENTRAL DE AJUDA — tudo o que ela mostra, e NADA sobre de onde o
// dado vem.
//
// ============================================================================
// POR QUE ESTE ARQUIVO SE SEPAROU DO `ajuda-painel.tsx` EM 21/08/2026
//
// O painel inteiro era um componente só: ele buscava o relatório do mês com
// `useDados` e desenhava o resultado. Isso o tornava IMPOSSÍVEL de renderizar num
// teste — a busca acontece dentro de um `useEffect`, e `renderToStaticMarkup` não
// roda efeito nenhum. Qualquer render de teste pararia para sempre em
// «Conferindo…», e o que precisa de prova é justamente o resto: a lista de
// pendências com o número dentro da frase, os botões que levam a algum lugar, o
// vazio que não é um beco.
//
// A DIVISÃO NÃO É INVENÇÃO PARA O TESTE, e é a que o projeto já pratica: as
// regras de cada tela moram em `*-regras.ts` fora do `.tsx` porque o runner do
// `web/` não lê JSX. Aqui o corte é o irmão disso um nível acima — quem BUSCA
// fica no `ajuda-painel.tsx`, quem DESENHA fica aqui e recebe tudo por
// propriedade. O teste passa a poder montar qualquer estado sem rede, sem
// relógio e sem banco.
//
// ============================================================================
// A REGRA DE DESENHO DESTE ARQUIVO: NENHUMA SEÇÃO TERMINA SEM UM BOTÃO
//
// A central passou a prometer que toda resposta acaba num clique, e a promessa
// se cumpre ou se perde AQUI — `ajuda.ts` pode devolver caminhos impecáveis e um
// `&&` mal colocado esconder todos. Por isso cada seção desenhada abaixo tem o
// seu par no `caso-render.tsx`, medindo o HTML montado:
//
//   o assunto        desenha TODOS os `caminhos` do tópico, e não só o primeiro:
//                    «como emito o boleto» precisa da tela da fatura E da tela do
//                    banco, porque a resposta atravessa as duas;
//   o verbete        ganhou botão em 21/08. Antes ele definia a palavra e parava
//                    ali — meio caminho, que num sistema sem suporte é a pessoa
//                    perguntando a próxima coisa a ninguém;
//   o vazio          admite que não achou e, na mesma seção, oferece as telas que
//                    a pergunta parecia citar e os assuntos do primeiro dia;
//   a pendência      quando não tem tela de preenchimento, leva à tela onde
//                    aquilo pelo menos APARECE, com o rótulo dizendo isso.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone, Carregando, Busca } from './ui.tsx';
import {
  responder, topicosDaTela, topicosComuns, TOPICOS,
  type Caminho, type Topico, type PassoDoEstado,
} from './ajuda.ts';
import { EFEITO } from './vocabulario.ts';

export type CorpoDaAjuda = {
  /** A tela em que a ajuda foi aberta. Decide as sugestões de contexto. */
  rota: string;
  /** O que está travando o mês. Vazio significa «nada pendente» — e é diferente
   *  de `carregando`, que significa «ainda não sei». */
  passos: readonly PassoDoEstado[];
  carregando: boolean;
  /** Não deu para conferir o mês. A ajuda CONTINUA servindo: os assuntos e a
   *  busca não dependem da rede. */
  falhou: boolean;
  aoFechar: () => void;
  /** Ir para uma tela. Recebido de fora porque navegar é efeito, e este arquivo
   *  não tem nenhum — é o que o deixa renderizável num teste. */
  ir: (destino: string) => void;
  /** Só o teste usa: monta o painel já com uma busca digitada, para o estado de
   *  resultado poder ser desenhado sem simular teclado. */
  consultaInicial?: string;
  /** Só o teste usa: monta o painel com a lista completa de assuntos já aberta. */
  tudoInicial?: boolean;
};

export function CorpoDaAjuda(p: CorpoDaAjuda) {
  const [consulta, setConsulta] = useState(p.consultaInicial ?? '');
  const [tudo, setTudo] = useState(p.tudoInicial ?? false);
  const caixa = useRef<HTMLDivElement>(null);

  const buscando = consulta.trim().length >= 2;
  const r = useMemo(() => responder(consulta), [consulta]);

  const daTela = useMemo(() => topicosDaTela(p.rota), [p.rota]);
  const comuns = useMemo(() => topicosComuns(), []);

  /* Esc fecha, e o foco entra na busca. São as duas coisas que um painel que
   * cobre a tela deve a quem não usa mouse. */
  const aoFechar = p.aoFechar;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    addEventListener('keydown', tecla);
    caixa.current?.querySelector('input')?.focus();
    return () => removeEventListener('keydown', tecla);
  }, [aoFechar]);

  return (
    <>
      <div className="ajuda-fundo" onClick={aoFechar} aria-hidden="true" />
      <aside className="ajuda-painel" ref={caixa}
             role="dialog" aria-modal="true" aria-label="Central de ajuda">
        <header className="ajuda-topo">
          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icone nome="ajuda" tamanho={19} peso="fill" /> Ajuda
          </strong>
          <button type="button" className="so-icone" onClick={aoFechar}
                  title="Fechar" aria-label="Fechar a ajuda">
            <Icone nome="limpar" tamanho={16} peso="bold" />
          </button>
        </header>

        <div className="ajuda-corpo">
          <Busca valor={consulta} ao={setConsulta}
                 dica="Descreva com suas palavras: «não consigo cobrar», «cadê o boleto»…" />

          {/* ---------------------------------------------- o estado ao vivo */}
          {!buscando && (
            <section className="ajuda-secao">
              <h3>Como está o mês agora</h3>
              {p.carregando && <Carregando texto="Conferindo…" />}
              {!p.carregando && p.falhou && (
                <p className="fraco ajuda-nota">
                  Não consegui conferir o mês agora. Os assuntos abaixo continuam valendo.
                </p>
              )}
              {!p.carregando && !p.falhou && p.passos.length === 0 && (
                <p className="ajuda-tudo-certo">
                  <Icone nome="ok" tamanho={16} peso="fill" /> Nada pendente. Este mês pode ser cobrado.
                </p>
              )}
              {!p.carregando && !p.falhou && p.passos.length > 0 && (
                <>
                  <p className="fraco ajuda-nota">
                    Estas são as coisas que ainda faltam. Comece pela primeira — fechar a de cima
                    costuma destravar as de baixo.
                  </p>
                  <ul className="ajuda-passos">
                    {p.passos.map((x) => <LinhaDoEstado key={x.camada} passo={x} ir={p.ir} />)}
                  </ul>
                </>
              )}
            </section>
          )}

          {/* ------------------------------------------------------- a busca */}
          {buscando && r.achados.length > 0 && (
            <section className="ajuda-secao">
              <h3>{r.achados.length === 1 ? 'Isto responde' : 'Isto pode responder'}</h3>
              {/*
                O PRIMEIRO RESULTADO VEM ABERTO, e não só quando ele é o único —
                mudou em 21/08 e foi o teste de renderização que cobrou.

                Fechados, os assuntos escondem os `caminhos` DENTRO deles: a
                busca acertava a resposta e o botão que resolve ficava atrás de
                um clique que ninguém pediu. Numa central cuja promessa é
                terminar num clique, esconder justamente o clique é o defeito
                mais caro possível.

                Os DEMAIS continuam fechados, e é o mesmo argumento de sempre: a
                lista precisa ser varrível. Abrir o mais provável e deixar as
                alternativas em título é o que faz ler quatro linhas em vez de
                quatro parágrafos.
              */}
              {r.achados.slice(0, 4).map(({ topico }, i) => (
                <CartaoDeTopico key={topico.id} topico={topico} ir={p.ir} aberto={i === 0} />
              ))}
            </section>
          )}

          {buscando && r.termos.length > 0 && (
            <section className="ajuda-secao">
              <h3>O que a palavra quer dizer</h3>
              {r.termos.slice(0, 3).map((t) => (
                <div key={t.termo} className="ajuda-termo">
                  <strong>{t.termo}</strong>
                  <p>{t.texto}</p>
                  {/* O VERBETE TAMBÉM LEVA A ALGUM LUGAR. Definir a palavra e
                      parar era responder metade: quem descobriu o que é «fatia
                      do cliente» quer, no ato seguinte, ir onde ela se preenche. */}
                  <Caminhos caminhos={t.caminhos} ir={p.ir} />
                </div>
              ))}
            </section>
          )}

          {buscando && r.palpite && (
            <section className="ajuda-secao">
              {/* NUNCA um beco: a busca não achou, e a resposta é uma admissão
                  seguida de saídas — a tela que a pergunta parecia citar e as
                  perguntas do primeiro dia. Não uma mensagem de erro. */}
              <h3>Não achei isso. Talvez seja um destes</h3>
              {/* A SAÍDA VEM ANTES DAS SUGESTÕES, e não depois: quem digitou o
                  nome de uma tela quer aquela tela, e ler quatro perguntas de
                  outro assunto primeiro é o custo de uma busca que errou. */}
              <p className="fraco ajuda-nota">
                {r.citou
                  ? 'Se você estava procurando uma tela:'
                  : 'Se nada aqui embaixo servir, comece por aqui:'}
              </p>
              <Caminhos caminhos={r.telas} ir={p.ir} />
              {r.sugestoes.map((t) => <CartaoDeTopico key={t.id} topico={t} ir={p.ir} />)}
            </section>
          )}

          {/* ----------------------------------------------------- o contexto */}
          {!buscando && daTela.length > 0 && (
            <section className="ajuda-secao">
              <h3>Sobre esta tela</h3>
              {daTela.map((t) => <CartaoDeTopico key={t.id} topico={t} ir={p.ir} />)}
            </section>
          )}

          {!buscando && (
            <section className="ajuda-secao">
              <h3>Perguntas mais comuns</h3>
              {comuns.filter((t) => !daTela.includes(t))
                .map((t) => <CartaoDeTopico key={t.id} topico={t} ir={p.ir} />)}
            </section>
          )}

          {/*
            TODOS OS ASSUNTOS, atrás de um clique.

            Existe para quem NÃO CONSEGUE FORMULAR a pergunta — e essa pessoa
            existe: é a mesma que, sem ajuda nenhuma, ficaria parada. Buscar exige
            saber a palavra; varrer uma lista, não. Fica fechado porque a lista é
            longa e quem sabe perguntar não precisa dela.
          */}
          {!buscando && (
            <section className="ajuda-secao">
              <button type="button" className="ajuda-pergunta" aria-expanded={tudo}
                      onClick={() => setTudo((v) => !v)}>
                <Icone nome={tudo ? 'subir' : 'descer'} tamanho={13} peso="bold" />
                Ver todos os assuntos ({TOPICOS.length})
              </button>
              {tudo && TOPICOS.map((t) => <CartaoDeTopico key={t.id} topico={t} ir={p.ir} />)}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * OS BOTÕES DE «PARA ONDE IR» — a peça que cumpre a promessa da central.
 *
 * O `tipo` decide o texto do ícone e o peso visual, e a distinção é honesta e não
 * decorativa: `resolver` é onde o dado ENTRA; `ver` é onde ele só APARECE. Pintar
 * os dois iguais mandaria alguém procurar em Usinas um campo de energia gerada
 * que não existe lá — e não existe em lugar nenhum, porque aquele número é
 * espelhado do CRM.
 */
/**
 * UM CAMINHO, DESENHADO. Existe para haver UM lugar que sabe a diferenca entre
 * ir para outra tela daqui e sair para outro sistema.
 *
 * Nasceu em 24/08/2026 de um defeito real: o caminho do CRM foi tratado no painel
 * de ajuda e NAO na linha da tela de Pendencias, que desenhava o proprio botao.
 * O clique la teria chamado a navegacao interna com um endereco completo -
 * `https://app.blackhaus.io/usinas` como se fosse rota daqui -, e o resultado
 * seria a tela em branco. Dois lugares desenhando a mesma coisa e um deles
 * aprendendo o caso novo e a forma exata desse erro.
 */
export function BotaoDoCaminho(
  { caminho, ir, classe }: { caminho: Caminho; ir: (d: string) => void; classe?: string },
) {
  const cls = classe ?? (caminho.tipo === 'resolver' ? 'ajuda-ir' : 'ajuda-ir ajuda-ir-ver');
  if (caminho.tipo === 'crm') {
    /* ANCORA DE VERDADE, e nao um botao que navega: sai deste sistema, entao
       abre em outra aba (para nao perder o que a pessoa estava fazendo aqui),
       aparece como link no menu do botao direito, e diz para onde vai antes do
       clique. Um `onClick` com `window.open` faria as tres coisas pior. */
    return (
      <a className={`${cls} ajuda-ir-crm`} href={caminho.rota} target="_blank" rel="noopener noreferrer">
        {caminho.rotulo} <Icone nome="abrir_externo" tamanho={13} peso="bold" />
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => ir(caminho.rota)}>
      {caminho.rotulo} <Icone nome="descer" tamanho={13} peso="bold" />
    </button>
  );
}

export function Caminhos({ caminhos, ir }: { caminhos: readonly Caminho[]; ir: (d: string) => void }) {
  if (caminhos.length === 0) return null;
  return (
    <div className="ajuda-caminhos">
      {caminhos.map((c) => <BotaoDoCaminho key={c.rota + c.rotulo} caminho={c} ir={ir} />)}
    </div>
  );
}

/**
 * UMA PENDÊNCIA REAL, com o número deste mês e o caminho.
 *
 * O EFEITO APARECE em quem NÃO impede cobrar, e só nesses: «impede dividir o
 * dinheiro» é a informação que evita alguém parar o faturamento inteiro por uma
 * linha que não o bloqueia. Repetir «impede cobrar» em oito linhas seguidas
 * viraria ruído e ninguém leria a nona.
 */
export function LinhaDoEstado({ passo, ir }: { passo: PassoDoEstado; ir: (d: string) => void }) {
  const resolve = passo.caminho?.tipo === 'resolver';
  return (
    <li>
      <span className="ajuda-frase">{passo.frase}</span>
      {passo.efeito === 'bloqueia_split' && (
        <span className="ajuda-efeito">{EFEITO.bloqueia_split!.curto}</span>
      )}
      {/* A EXPLICAÇÃO SÓ ENTRA QUANDO NÃO HÁ ONDE RESOLVER. Ela responde a
          pergunta que a linha levanta — «por que não tem botão de arrumar?» — e
          ao lado de um botão «Resolver» seria texto para ninguém. */}
      {!resolve && passo.topico && (
        <span className="fraco" style={{ fontSize: 12 }}>{passo.topico.resposta}</span>
      )}
      {passo.caminho && (
        <BotaoDoCaminho caminho={passo.caminho} ir={ir}
                        classe={resolve ? 'ajuda-ir' : 'ajuda-ir ajuda-ir-ver'} />
      )}
    </li>
  );
}

/** Um assunto: a pergunta, a resposta em uma frase, os passos e para onde ir.
 *  Fechado por padrão porque a lista precisa ser varrível — quem reconhece a
 *  própria pergunta abre uma, e não lê quatro. */
export function CartaoDeTopico(
  { topico, ir, aberto = false }: { topico: Topico; ir: (d: string) => void; aberto?: boolean },
) {
  const [expandido, setExpandido] = useState(aberto);

  return (
    <div className="ajuda-topico">
      <button type="button" className="ajuda-pergunta" aria-expanded={expandido}
              onClick={() => setExpandido((v) => !v)}>
        <Icone nome={expandido ? 'subir' : 'descer'} tamanho={13} peso="bold" />
        {topico.pergunta}
      </button>

      {expandido && (
        <div className="ajuda-resposta">
          <p>{topico.resposta}</p>
          {/* O PORQUE VEM ANTES DOS PASSOS, e a ordem foi escolhida: quem entende
              para que serve o campo digita melhor do que quem so seguiu a receita.
              Depois dos passos, viraria rodape que ninguem le. */}
          {topico.porque && (
            <p className="ajuda-porque"><strong>Por que isto é pedido:</strong> {topico.porque}</p>
          )}
          <ol>{topico.passos.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <Caminhos caminhos={topico.caminhos} ir={ir} />
        </div>
      )}
    </div>
  );
}
