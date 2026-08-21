// O PAINEL DA CENTRAL DE AJUDA — o que a pessoa vê quando trava.
//
// ============================================================================
// POR QUE É UM PAINEL E NÃO UMA TELA
//
// Uma aba «Ajuda» na barra custaria o lugar em que a pessoa está: quem trava no
// meio do cadastro de uma unidade teria de sair da unidade para ler como
// preencher, e voltar sem o filtro que tinha. O painel abre POR CIMA, sabe em
// que tela foi aberto e devolve a pessoa ao trabalho com um clique.
//
// É também o motivo de ele não entrar na barra de navegação: aquela lista tem
// ordem própria — a ordem em que o trabalho destrava o próximo passo — e a ajuda
// não é uma etapa do trabalho. Ela mora ao lado do menu da conta, disponível de
// toda tela.
//
// ============================================================================
// A ORDEM DO QUE APARECE, e ela é a resposta a «não há divisão de suporte»
//
//   1. O ESTADO AO VIVO primeiro, e antes de qualquer busca. A pergunta mais
//      provável de amanhã é «por que não consigo cobrar?», e a resposta não é um
//      texto: é a lista real do que está travando este mês, com o link de cada
//      uma. Quem abre a ajuda sem digitar nada já recebe isso;
//   2. A BUSCA, com as palavras da pessoa (`ajuda.ts`);
//   3. O CONTEXTO — os assuntos da tela em que a ajuda foi aberta;
//   4. OS ASSUNTOS COMUNS, que é onde a busca sem resultado cai. Nunca há «nada
//      encontrado» sem saída: num sistema sem suporte, um beco é alguém parado.
//
// O CONTEÚDO E A BUSCA NÃO MORAM AQUI. Estão em `ajuda.ts` e `vocabulario.ts`,
// `.ts` puros com suíte própria — o runner do `web/` não lê JSX, e regra 8 diz
// que invariante sem teste é comentário. Aqui fica só o desenho.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Prontidao } from './api.ts';
import { useDados } from './dados.ts';
import { Icone, Carregando, Busca } from './ui.tsx';
import { navegar } from './rota.tsx';
import { competenciaISO } from './dinheiro.ts';
import {
  buscar, buscarTermos, topicosDaTela, topicosComuns, passosDoEstado,
  type Topico, type PassoDoEstado,
} from './ajuda.ts';
import { EFEITO } from './vocabulario.ts';

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function PainelDeAjuda({ rota, aoFechar }: { rota: string; aoFechar: () => void }) {
  const [consulta, setConsulta] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  /*
   * O ESTADO AO VIVO DO MÊS CORRENTE. Só uma chamada, e a mesma que a tela de
   * Pendências faz — o painel não tem relatório próprio, senão os dois números
   * poderiam discordar e nenhum pareceria errado.
   */
  const { dado, carregando } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mesAtual())}/prontidao`), []);

  const passos = useMemo(() => (dado ? passosDoEstado(dado.camadas) : []), [dado]);
  const achados = useMemo(() => buscar(consulta), [consulta]);
  const termos = useMemo(() => buscarTermos(consulta), [consulta]);

  const buscando = consulta.trim().length >= 2;
  const semResultado = buscando && achados.length === 0 && termos.length === 0;

  const daTela = useMemo(() => topicosDaTela(rota), [rota]);
  const comuns = useMemo(() => topicosComuns(), []);

  /* Esc fecha, e o foco entra na busca. São as duas coisas que um painel que
   * cobre a tela deve a quem não usa mouse. */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    addEventListener('keydown', tecla);
    caixa.current?.querySelector('input')?.focus();
    return () => removeEventListener('keydown', tecla);
  }, [aoFechar]);

  /** Ir para uma tela FECHA o painel: deixá-lo aberto por cima do destino faria
   *  a pessoa ler a instrução tapando o campo que ela manda preencher. */
  const ir = (destino: string) => { navegar(destino); aoFechar(); };

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
              {carregando && <Carregando texto="Conferindo…" />}
              {!carregando && dado && passos.length === 0 && (
                <p className="ajuda-tudo-certo">
                  <Icone nome="ok" tamanho={16} peso="fill" /> Nada pendente. Este mês pode ser cobrado.
                </p>
              )}
              {!carregando && passos.length > 0 && (
                <>
                  <p className="fraco ajuda-nota">
                    Estas são as coisas que ainda faltam. Comece pela primeira — fechar a de cima
                    costuma destravar as de baixo.
                  </p>
                  <ul className="ajuda-passos">
                    {passos.map((p) => <LinhaDoEstado key={p.camada} passo={p} ir={ir} />)}
                  </ul>
                </>
              )}
              {!carregando && !dado && (
                <p className="fraco ajuda-nota">
                  Não consegui conferir o mês agora. Os assuntos abaixo continuam valendo.
                </p>
              )}
            </section>
          )}

          {/* ------------------------------------------------------- a busca */}
          {buscando && achados.length > 0 && (
            <section className="ajuda-secao">
              <h3>{achados.length === 1 ? 'Isto responde' : 'Isto pode responder'}</h3>
              {achados.slice(0, 4).map(({ topico }) => (
                <CartaoDeTopico key={topico.id} topico={topico} ir={ir} aberto={achados.length === 1} />
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
              {comuns.map((t) => <CartaoDeTopico key={t.id} topico={t} ir={ir} />)}
            </section>
          )}

          {/* ----------------------------------------------------- o contexto */}
          {!buscando && daTela.length > 0 && (
            <section className="ajuda-secao">
              <h3>Sobre esta tela</h3>
              {daTela.map((t) => <CartaoDeTopico key={t.id} topico={t} ir={ir} />)}
            </section>
          )}

          {!buscando && (
            <section className="ajuda-secao">
              <h3>Perguntas mais comuns</h3>
              {comuns.filter((t) => !daTela.includes(t))
                .map((t) => <CartaoDeTopico key={t.id} topico={t} ir={ir} />)}
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
function LinhaDoEstado({ passo, ir }: { passo: PassoDoEstado; ir: (d: string) => void }) {
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
function CartaoDeTopico(
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
          <ol>{topico.passos.map((p, i) => <li key={i}>{p}</li>)}</ol>
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
