// O DESENHO DA CENTRAL DE AJUDA — tudo o que ela mostra, e NADA sobre de onde o
// dado vem.
//
// ============================================================================
// POR QUE ESTE ARQUIVO SE SEPAROU DO `ajuda-painel.tsx` EM 21/08/2026
//
// O painel inteiro era um componente só: ele buscava a prontidão com `useDados`
// e desenhava o resultado. Isso o tornava IMPOSSÍVEL de renderizar num teste — a
// busca acontece dentro de um `useEffect`, e `renderToStaticMarkup` não roda
// efeito nenhum. Qualquer render de teste pararia para sempre em «Conferindo…»,
// e o que precisa de prova é justamente o resto: a lista de pendências com o
// número dentro da frase, os botões que levam a algum lugar, o vazio que não é
// um beco.
//
// A DIVISÃO NÃO É INVENÇÃO PARA O TESTE, e é a que o projeto já pratica: as
// regras de cada tela moram em `*-regras.ts` fora do `.tsx` porque o runner do
// `web/` não lê JSX. Aqui o corte é o irmão disso um nível acima — quem BUSCA
// fica no `ajuda-painel.tsx`, quem DESENHA fica aqui e recebe tudo por
// propriedade. O teste passa a poder montar qualquer estado sem rede, sem
// relógio e sem banco.
//
// Ganho que não era o objetivo e veio junto: o estado de falha da busca deixou
// de ser invisível. Com o dado chegando por propriedade, «não consegui conferir
// o mês» é um caso desenhado e testado como os outros.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone, Carregando, Busca } from './ui.tsx';
import {
  buscar, buscarTermos, topicosDaTela, topicosComuns,
  type Topico, type PassoDoEstado,
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
};

export function CorpoDaAjuda(p: CorpoDaAjuda) {
  const [consulta, setConsulta] = useState(p.consultaInicial ?? '');
  const caixa = useRef<HTMLDivElement>(null);

  const achados = useMemo(() => buscar(consulta), [consulta]);
  const termos = useMemo(() => buscarTermos(consulta), [consulta]);

  const buscando = consulta.trim().length >= 2;
  const semResultado = buscando && achados.length === 0 && termos.length === 0;

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
          {buscando && achados.length > 0 && (
            <section className="ajuda-secao">
              <h3>{achados.length === 1 ? 'Isto responde' : 'Isto pode responder'}</h3>
              {achados.slice(0, 4).map(({ topico }) => (
                <CartaoDeTopico key={topico.id} topico={topico} ir={p.ir} aberto={achados.length === 1} />
              ))}
            </section>
          )}

          {buscando && termos.length > 0 && (
            <section className="ajuda-secao">
              <h3>O que a palavra quer dizer</h3>
              {termos.slice(0, 3).map((t) => (
                <div key={t.termo} className="ajuda-termo">
                  <strong>{t.termo}</strong>
                  <p>{t.texto}</p>
                </div>
              ))}
            </section>
          )}

          {semResultado && (
            <section className="ajuda-secao">
              {/* NUNCA um beco: a busca não achou, e a resposta é a lista das
                  perguntas do primeiro dia — não uma mensagem de erro. */}
              <h3>Não achei isso. Talvez seja um destes</h3>
              {comuns.map((t) => <CartaoDeTopico key={t.id} topico={t} ir={p.ir} />)}
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
        </div>
      </aside>
    </>
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
  return (
    <li>
      <span className="ajuda-frase">{passo.frase}</span>
      {passo.efeito === 'bloqueia_split' && (
        <span className="ajuda-efeito">{EFEITO.bloqueia_split!.curto}</span>
      )}
      {passo.destino
        ? <button type="button" className="ajuda-ir" onClick={() => ir(passo.destino!)}>
            Resolver <Icone nome="descer" tamanho={13} peso="bold" />
          </button>
        : passo.topico && (
            <span className="fraco" style={{ fontSize: 12 }}>{passo.topico.resposta}</span>
          )}
    </li>
  );
}

/** Um assunto: a pergunta, a resposta em uma frase e os passos. Fechado por
 *  padrão porque a lista precisa ser varrível — quem reconhece a própria
 *  pergunta abre uma, e não lê quatro. */
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
          <ol>{topico.passos.map((x, i) => <li key={i}>{x}</li>)}</ol>
          {topico.destino && (
            <button type="button" className="ajuda-ir" onClick={() => ir(topico.destino!)}>
              Ir para lá <Icone nome="descer" tamanho={13} peso="bold" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
