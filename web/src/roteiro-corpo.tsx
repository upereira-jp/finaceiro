// O ROTEIRO DO MÊS, na parte que DESENHA — e ele recebe tudo por propriedade.
//
// É O MESMO PAR de `saude-do-dinheiro.ts` + `saude-corpo.tsx`, e pelo mesmo
// motivo escrito lá: `renderToStaticMarkup` não roda efeito, então um componente
// que busca sozinho renderiza o estado vazio e o teste mede o nada. Recebendo a
// leitura por propriedade, qualquer estado do mês é montável sem rede e sem
// tempo — e `caso-render.tsx` monta os que importam.
//
// ============================================================================
// AS DECISÕES DE DESENHO, e cada uma responde a um jeito de a tela mentir
//
//   A LISTA INTEIRA APARECE, e só um item se abre. Mostrar cinco instruções ao
//   mesmo tempo é a mesma coisa que não mostrar nenhuma; mostrar SÓ a de agora
//   esconde o mapa, e quem não vê o mapa não sabe se o que está fazendo é o
//   começo ou o fim. Os outros quatro ficam em uma linha cada, com o número, o
//   título e a contagem;
//
//   O NÚMERO DE CADA PASSO É FIXO, e não a posição na lista de pendências. «Você
//   está no 2 de 5» é uma frase que se guarda de um dia para o outro;
//
//   TRAVADO NÃO É ERRO, e por isso não é vermelho. É o passo certo, com uma
//   porta fechada na frente — e a porta tem nome, número e link. A cor de erro
//   fica reservada para o que está QUEBRADO, que é a faixa da saúde do dinheiro,
//   logo acima;
//
//   QUANDO TUDO FECHA, A CAIXA FALA. Uma caixa que some quando o mês acaba tem a
//   mesma cara de uma caixa que quebrou — a mesma lição que a tabela das camadas
//   já aprendeu no `vazio` dela.

import type { ReactNode } from 'react';
import { Ligacao } from './rota.tsx';
import { Icone } from './ui.tsx';
import {
  roteiroDoMes, passoDeAgora, ondeEstouNoMes,
  type LeituraDoMes, type PassoDoMes, type PassoNoMapa,
} from './roteiro-do-mes.ts';

/** O ponto de cada passo: número dentro de um círculo que muda de cor. Ele
 *  carrega o estado sem depender de cor sozinha — o «✓» e o «!» são forma. */
function Ponto({ passo }: { passo: PassoDoMes }) {
  const cor =
    passo.estado === 'feito' ? 'var(--ok, #1a7f37)'
    : passo.estado === 'agora' ? 'var(--acento, #0969da)'
    : passo.estado === 'travado' ? 'var(--alerta, #9a6700)'
    : 'var(--borda, #d0d7de)';
  const dentro = passo.estado === 'feito' ? '✓' : passo.estado === 'travado' ? '!' : String(passo.numero);

  return (
    <span aria-hidden="true"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: '50%', flex: '0 0 26px',
            fontSize: 13, fontWeight: 700, lineHeight: 1,
            border: `2px solid ${cor}`,
            background: passo.estado === 'agora' ? cor : 'transparent',
            color: passo.estado === 'agora' ? '#fff' : cor,
          }}>
      {dentro}
    </span>
  );
}

const PALAVRA: Record<PassoDoMes['estado'], string> = {
  feito: 'feito',
  agora: 'é agora',
  travado: 'falta destravar',
  espera: 'depois',
};

/** A linha de um passo que NÃO é o de agora: uma linha, e nada mais. */
function LinhaCurta({ passo }: { passo: PassoDoMes }) {
  const apagado = passo.estado === 'espera';
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0' }}>
      <Ponto passo={passo} />
      <span style={{ opacity: apagado ? 0.6 : 1 }}>
        <strong style={{ fontWeight: passo.estado === 'feito' ? 500 : 600 }}>{passo.titulo}</strong>
        {passo.contagem && <span className="fraco" style={{ fontSize: 13 }}> — {passo.contagem}</span>}
        {/* «depois» não é dito: a posição na lista já diz. Dizer seria repetir
            cinco vezes a mesma palavra numa caixa que tem cinco linhas. */}
        {passo.estado === 'feito' && (
          <span className="fraco" style={{ fontSize: 13 }}> · {PALAVRA.feito}</span>
        )}
      </span>
    </li>
  );
}

/** O passo de agora, aberto: o que fazer, como fazer, e para onde ir. */
function LinhaAberta({ passo }: { passo: PassoDoMes }) {
  return (
    <li style={{ display: 'flex', gap: 12, padding: '12px 0', alignItems: 'flex-start' }}>
      <div style={{ paddingTop: 2 }}><Ponto passo={passo} /></div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16 }}>{passo.titulo}</strong>
          <span className="fraco" style={{ fontSize: 13 }}>
            {PALAVRA[passo.estado]}{passo.contagem ? ` · ${passo.contagem}` : ''}
          </span>
        </div>

        <p style={{ margin: '6px 0 0', maxWidth: 720, lineHeight: 1.6 }}>{passo.oQueFazer}</p>

        {/* ======================================================= as travas
          * ELAS VÊM ANTES DO «COMO», e a ordem é o argumento: seguir o passo a
          * passo com uma porta fechada na frente termina numa recusa do
          * servidor, e recusa depois de cinco cliques é a pior forma de
          * descobrir que faltava cadastro. */}
        {passo.travas.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Antes disso, {passo.travas.length === 1 ? 'falta uma coisa' : `faltam ${passo.travas.length} coisas`}:
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.65 }}>
              {passo.travas.map((t) => (
                <li key={t.camada}>
                  <strong>{t.titulo}</strong>
                  {t.faltam > 0 && <span className="fraco"> ({t.faltam})</span>}
                  {t.frase && <> — {t.frase}</>}
                  {t.endereco
                    ? <> <Ligacao para={t.endereco}>resolver</Ligacao></>
                    : <span className="fraco"> Não há tela para isto — veja a linha correspondente na
                        tabela abaixo.</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ======================================================== o «como»
          * NUMERADO E NÃO EM MARCADORES: são atos em ordem, e a ordem é o que a
          * pessoa precisa. Uma lista de marcadores convida a escolher. */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Como fazer</div>
          <ol style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.7, maxWidth: 760 }}>
            {passo.comoFazer.map((l) => <li key={l}>{l}</li>)}
          </ol>
        </div>

        {passo.destino && (
          <p style={{ margin: '12px 0 0' }}>
            <Ligacao para={passo.destino.endereco}>Abrir {passo.destino.rotulo}</Ligacao>
          </p>
        )}
      </div>
    </li>
  );
}

export type CorpoDoRoteiro = LeituraDoMes & {
  /** «julho/2026», já formatado por quem chamou — este módulo não conhece
   *  calendário, e inventar um segundo formatador daria duas grafias do mesmo
   *  mês na mesma tela. */
  competencia: ReactNode;
};

/**
 * A CAIXA INTEIRA. Nunca devolve `null`: mesmo com o mês fechado ela fala, e
 * mesmo sem número nenhum ela mostra os cinco passos — que já é a resposta para
 * «o que este sistema espera de mim».
 */
export function CorpoDoRoteiro({ competencia, ...leitura }: CorpoDoRoteiro) {
  const passos = roteiroDoMes(leitura);
  const agora = passoDeAgora(passos);

  return (
    <section className="cartao secao" aria-label="O mês, passo a passo"
             style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>O mês de {competencia}, passo a passo</h2>
        <span className="fraco" style={{ fontSize: 13 }}>
          {agora
            ? `você está no ${agora.numero} de ${passos.length}`
            : 'os cinco passos fecharam'}
        </span>
      </div>

      {!agora && (
        /* A BOA NOTÍCIA FALA. Ver o comentário do cabeçalho: uma caixa que some
           quando o mês acaba tem a mesma cara de uma que quebrou. */
        <p style={{ margin: '8px 0 0', lineHeight: 1.6 }}>
          <Icone nome="ok" tamanho={15} /> Não há passo pendente neste mês: as contas foram lidas,
          as cobranças saíram e o que falta é o cliente pagar — e isso o sistema acompanha sozinho.
        </p>
      )}

      <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {passos.map((p) => (
          p.chave === agora?.chave
            ? <LinhaAberta key={p.chave} passo={p} />
            : <LinhaCurta key={p.chave} passo={p} />
        ))}
      </ol>

      <p className="fraco" style={{ fontSize: 13, margin: '14px 0 0', lineHeight: 1.6 }}>
        A tabela abaixo é o detalhe: ela lista todas as conferências do mês, inclusive as que ainda
        não chegaram a atrapalhar nenhum passo.
      </p>
    </section>
  );
}

/* ==========================================================================
 * A FAIXA DE ORIENTAÇÃO, dentro da tela de trabalho
 * ==========================================================================
 *
 * O roteiro inteiro mora em Pendências; o TRABALHO mora aqui. Quem está dentro
 * de «Fatura unificada» ou de «Emissão e cobrança» perdeu o mapa: a tela não
 * dizia que parte do mês ela é, nem para onde se vai quando ela acaba. Foi
 * assim que a aba aposentada conseguiu parecer o caminho — nenhuma tela dizia o
 * que vinha antes ou depois dela.
 *
 * UMA LINHA, E NÃO UM SEGUNDO ROTEIRO. Ela diz três coisas e para: que passos
 * são estes, o que vem antes, o que vem depois. O estado ao vivo («você está no
 * 1 de 5») fica em Pendências, a um clique — repetir estado em três telas seria
 * criar três lugares para discordarem.
 */

const nomes = (ps: readonly PassoNoMapa[]): string =>
  ps.map((p) => `${p.numero} · ${p.titulo}`).join('   ');

/** O rótulo da tela onde um passo vizinho acontece, quando não é esta mesma. */
function Vizinho({ passo, rotulo }: { passo: PassoNoMapa; rotulo: string }) {
  return (
    <>
      {rotulo} <strong>{passo.numero} · {passo.titulo}</strong>
      {passo.destino && <>, em <Ligacao para={passo.destino.endereco}>{passo.destino.rotulo}</Ligacao></>}.
    </>
  );
}

/** Desenha `null` para tela que não hospeda passo nenhum — e `null` é a resposta:
 *  uma faixa dizendo «esta tela não é passo nenhum» seria ruído em toda tela de
 *  cadastro do sistema. */
export function FaixaDoPasso({ rota }: { rota: string }) {
  const onde = ondeEstouNoMes(rota);
  if (!onde) return null;

  const varios = onde.aqui.length > 1;

  return (
    <div className="cartao" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13.5, lineHeight: 1.65 }}>
      <div>
        <Icone nome="prontidao" tamanho={14} />{' '}
        <strong>
          {varios ? 'Passos' : 'Passo'}{' '}
          {onde.aqui.map((p) => p.numero).join(' e ')} de {onde.total} do mês
        </strong>
        <span className="fraco"> — {nomes(onde.aqui)}</span>
      </div>

      {(onde.antes || onde.depois) && (
        <div className="fraco" style={{ marginTop: 4 }}>
          {onde.antes && <Vizinho passo={onde.antes} rotulo="Antes daqui:" />}
          {onde.antes && onde.depois && ' '}
          {onde.depois && <Vizinho passo={onde.depois} rotulo="Depois daqui:" />}
          {' '}<Ligacao para="/pendencias">Ver o mês inteiro</Ligacao>
        </div>
      )}
    </div>
  );
}
