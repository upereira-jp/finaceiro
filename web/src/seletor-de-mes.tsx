// O MÊS DE TRABALHO NA CASCA — o estado, o controle do menu e o aviso de mês
// velho (01/10/2026, etapa 8 do redesenho).
//
// ============================================================================
// ONDE O CONTROLE MORA, e por quê
//
// NO ALTO DO MENU LATERAL, logo abaixo do seletor de setor: «Rateio», e embaixo
// «Mês de trabalho · setembro de 2026». Três razões, e a primeira decide:
//
//   1. O MÊS É ESTADO DO SETOR, não de uma tela. Ele vale para Mês, Contas de
//      luz e Cobranças ao mesmo tempo, e o lugar que é o mesmo nas três é a
//      casca. Ao lado do setor ele lê como endereço — «estou no Rateio, em
//      setembro» —, que é o desenho de «onde estou» que o alto do menu já tem;
//   2. ELE NÃO PULA. Numa faixa no topo do conteúdo, o controle desceria e
//      subiria com cada tela (Cobranças tem a faixa do passo antes, o Mês não),
//      e a pessoa o procuraria a cada troca; no menu ele está sempre no mesmo
//      pixel;
//   3. ELE CONTINUA À VISTA COM O MENU RECOLHIDO («set/26», com o nome inteiro
//      para quem ouve) e no celular: na faixa do topo, como «set/26 ▾», e na
//      gaveta, inteiro, no mesmo lugar do computador.
//
// O custo de morar no menu é aparecer também nas telas que NÃO seguem o mês (os
// cadastros). Ele não some nelas — o mês de trabalho continua sendo o do setor,
// e a pessoa pode trocá-lo de qualquer tela —, mas diz, na linha de baixo, «não
// muda esta tela». No setor Empresa ele não é desenhado: lá não há mês de
// trabalho (Contas a receber e Contas a pagar têm os filtros de data deles).
//
// ============================================================================
// O QUE MORA AQUI
//
//   `ProvedorDoMes`   o estado: resolve o mês (`resolverMes`), procura o
//                     trabalho, ouve o `?mes=` dos links, escreve o mês no
//                     endereço, lembra a escolha e atende o atalho `[` / `]`;
//   `useMesDoTrabalho` o que as telas leem;
//   `SeletorDeMes`    o controle, nos dois lugares (menu e faixa do celular);
//   `AvisoDoMesVelho` «Há trabalho em outubro de 2026 → ir», no alto das telas
//                     do mês.
//
// A REGRA é `mes-do-trabalho.ts`, com suíte; aqui fica o que tem efeito. Os
// `Corpo…` recebem tudo por propriedade, para o teste de render montá-los sem
// rede, sem relógio e sem navegador (`web/tests/caso-render.tsx`).

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent, type ReactNode,
} from 'react';
import { Aviso, Icone, DICA_DO_MES } from './ui.tsx';
import { useNavegacoes } from './rota.tsx';
import { mesPorExtenso, mesAbreviado, mesCurtoDoAno, mesDeHojeEmSP } from './formato.ts';
import {
  resolverMes, mesPedidoPeloEndereco, enderecoComOMes, mesComTrabalhoAFrente, passoDoAtalho, mesVizinho,
  comoSegueOMes, fraseDaOrigem, notaDaOrigem, fraseDoAlcance, nomeDoMesDeTrabalho,
  lerMesLembrado, lembrarMes, armazemDoNavegador, ehMes, mesDoEndereco, TECLAS_DO_MES,
  type ComoSegue, type EscolhaDoMes, type OrigemDoMes,
} from './mes-do-trabalho.ts';

// ===================================================================== o estado

export type MesDoTrabalho = {
  /** O mês aberto, `AAAA-MM`; `null` enquanto a procura anda. */
  mes: string | null;
  origem: OrigemDoMes | null;
  /** O mês mais recente com trabalho, quando a procura achou um. */
  comTrabalho: string | null;
  /** O mês com trabalho À FRENTE do aberto, quando a tela deve avisar. */
  aFrente: string | null;
  /** Como a tela aberta segue o mês. */
  como: ComoSegue;
  /** Relatórios com o recorte ligado (`?mes=` no endereço dele). */
  recorte: boolean;
  /** Há mês de trabalho: empresa escolhida e o setor Rateio visível. */
  ativo: boolean;
  /** Escolher um mês — vale para todas as telas do mês e é lembrado. */
  escolher: (mes: string) => void;
  /** Pedir a procura de fora do Rateio (a Central de Ajuda aberta no setor
   *  Empresa, que narra o mês). */
  pedir: () => void;
};

const NADA: MesDoTrabalho = {
  mes: null, origem: null, comTrabalho: null, aFrente: null, como: 'nao_segue', recorte: false,
  ativo: false, escolher: () => {}, pedir: () => {},
};

const Contexto = createContext<MesDoTrabalho>(NADA);

/** O mês de trabalho, para as telas. Fora do provedor (o teste), `NADA`. */
export const useMesDoTrabalho = (): MesDoTrabalho => useContext(Contexto);

/** A procura mais de uma vez a cada meio minuto não diz nada de novo: o
 *  trabalho só muda com um ato, e o ato acontece numa tela. */
const INTERVALO_DA_PROCURA = 30_000;

export function ProvedorDoMes({ rota, ativo, noRateio, children }: {
  /** A tela aberta (`navegacao.ts`). */
  rota: string;
  /** Empresa escolhida e o setor Rateio entre os do vínculo. */
  ativo: boolean;
  /** A tela aberta é do setor Rateio — só aí a procura sai sozinha. */
  noRateio: boolean;
  children: ReactNode;
}) {
  const navegacoes = useNavegacoes();
  const como = comoSegueOMes(rota);

  /* O MÊS, já na montagem: endereço e lembrança não precisam de rede. Sem os
     dois, `null` — e a procura decide. */
  const [aberto, setAberto] = useState<EscolhaDoMes | null>(() => resolverMes({
    doEndereco: typeof location === 'undefined' ? null : mesPedidoPeloEndereco(rota, location.search),
    lembrado: lerMesLembrado(armazemDoNavegador()),
    procurado: null, procurando: true, hoje: mesDeHojeEmSP(),
  }));
  const [procurado, setProcurado] = useState<EscolhaDoMes | null>(null);
  /** A primeira procura ainda não voltou. */
  const [procurando, setProcurando] = useState(true);
  const [pedido, setPedido] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const ultimaProcura = useRef(0);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  /*
   * A PROCURA DO TRABALHO — sob demanda (`import()`), para a regra da emissão e
   * as leituras do mês não entrarem no pedaço de entrada. Sai sozinha no Rateio
   * e a pedido fora dele, e não mais de uma vez a cada meio minuto. Ela serve a
   * duas coisas: o terceiro degrau do mês (sem link nem lembrança) e o aviso
   * de mês velho. A resposta que chega depois de a pessoa trocar de tela não
   * se perde: o que importa é o provedor ainda existir.
   */
  useEffect(() => {
    if (!ativo || !(noRateio || pedido)) return;
    if (Date.now() - ultimaProcura.current < INTERVALO_DA_PROCURA) return;
    ultimaProcura.current = Date.now();
    import('./leitura-do-mes.ts')
      .then((m) => m.procurarDoZero())
      .then((r) => { if (montado.current) setProcurado(r); })
      .catch(() => { /* sem a procura, o mês cai no lembrado ou no de hoje */ })
      .finally(() => { if (montado.current) setProcurando(false); });
  }, [ativo, noRateio, pedido, rota]);

  /* A PROCURA VOLTOU: quem ainda não tinha mês ganha o dela (ou o de hoje). */
  useEffect(() => {
    if (procurando) return;
    setAberto((a) => a ?? resolverMes({ doEndereco: null, lembrado: null, procurado, procurando: false, hoje: mesDeHojeEmSP() }));
  }, [procurado, procurando]);

  /*
   * O ENDEREÇO E O MÊS, nos dois sentidos — e um efeito só, porque a ordem
   * importa. A cada NAVEGAÇÃO (um link, o «voltar»), o `?mes=` de uma tela do
   * mês PEDE o mês: «Ver em Cobranças» abre agosto, e agosto passa a ser o mês
   * de todas as telas. Fora disso, é o mês que ESCREVE o endereço, com
   * `replaceState`: o link copiado e o F5 continuam no mês que está na tela.
   * Separar os dois faria a escrita do mês velho correr antes da leitura do
   * novo, e o endereço piscaria entre os dois.
   *
   * O MÊS DO LINK NÃO É LEMBRADO: lembrada é a escolha da pessoa, e um link
   * velho aberto de passagem não pode decidir em que mês o sistema abre amanhã.
   */
  const vistos = useRef({ navegacoes: -1, rota: '' });
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const nova = vistos.current.navegacoes !== navegacoes || vistos.current.rota !== rota;
    vistos.current = { navegacoes, rota };
    const pedidoPeloLink = mesPedidoPeloEndereco(rota, location.search);
    if (nova && pedidoPeloLink && pedidoPeloLink !== aberto?.mes) {
      setAberto({ mes: pedidoPeloLink, origem: 'endereco' });
      return;
    }
    if (!ativo || !aberto) return;
    const novo = enderecoComOMes(
      { caminho: location.pathname, busca: location.search, fragmento: location.hash }, aberto.mes, como);
    if (novo) history.replaceState(history.state, '', novo);
  }, [navegacoes, rota, aberto?.mes, ativo, como]);

  const escolher = useCallback((m: string) => {
    if (!ehMes(m)) return;
    lembrarMes(armazemDoNavegador(), m);
    setAberto({ mes: m, origem: 'escolhido' });
    setAnuncio(`${nomeDoMesDeTrabalho(m)}.`);
  }, []);

  /*
   * O ATALHO `[` / `]` — um mês para trás, um para a frente. Só nas telas que
   * mostram o mês (num cadastro a tecla trocaria um mês que não se vê), nunca
   * com o foco num campo de texto (`passoDoAtalho`) e nunca com um painel modal
   * aberto por cima (a ajuda, a gaveta da conta, a gaveta do menu): o mês
   * mudaria por trás do que a pessoa está lendo. A região viva diz o mês novo.
   */
  const abertoAgora = useRef(aberto);
  abertoAgora.current = aberto;
  useEffect(() => {
    if (!ativo || como === 'nao_segue') return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      const passo = passoDoAtalho(e);
      if (!passo || !abertoAgora.current) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      escolher(mesVizinho(abertoAgora.current.mes, passo));
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, [ativo, como, escolher]);

  const recorte = como === 'recorta' && typeof location !== 'undefined' && Boolean(mesDoEndereco(location.search));
  const valor = useMemo<MesDoTrabalho>(() => ({
    mes: aberto?.mes ?? null,
    origem: aberto?.origem ?? null,
    comTrabalho: procurado?.origem === 'trabalho' ? procurado.mes : null,
    aFrente: mesComTrabalhoAFrente(aberto, procurado),
    como, recorte, ativo, escolher,
    pedir: () => setPedido(true),
  }), [aberto, procurado, como, recorte, ativo, escolher]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* A REGIÃO VIVA do mês: existe antes do texto (é o que faz o anúncio
          sair em todo leitor de tela — ver `RetornoDoAto`), e diz o mês novo
          quando ele muda pelo controle ou pelo teclado. */}
      <div className="so-leitor" role="status" aria-live="polite">{anuncio}</div>
    </Contexto.Provider>
  );
}

// ================================================================= o controle

/** Onde o controle mora: o alto do menu (no computador e na gaveta) ou a faixa
 *  do topo do celular. */
export type LugarDoMes = 'menu' | 'faixa';

/**
 * A LINHA DE BAIXO DO CONTROLE, no menu — quatro palavras, por ordem de quem
 * importa: na tela que não segue o mês, DIZER que não segue (é a pergunta que o
 * controle à vista faz nascer); em Relatórios sem recorte, que ali são todos os
 * meses; com trabalho mais à frente, onde ele está; e, no resto, por que este
 * mês (`notaDaOrigem`).
 */
export function notaDoSeletor(p: {
  como: ComoSegue; origem: OrigemDoMes | null; aFrente: string | null; recorte: boolean;
}): { texto: string; aviso: boolean } {
  if (p.como === 'nao_segue') return { texto: 'não muda esta tela', aviso: false };
  if (p.como === 'recorta' && !p.recorte) return { texto: 'esta tela mostra todos os meses', aviso: false };
  if (p.aFrente) return { texto: `há trabalho em ${mesPorExtenso(p.aFrente)}`, aviso: true };
  return { texto: notaDaOrigem(p.origem), aviso: false };
}

export function SeletorDeMes({ lugar }: { lugar: LugarDoMes }) {
  const v = useMesDoTrabalho();
  if (!v.ativo) return null;
  return <CorpoDoSeletorDeMes lugar={lugar} mes={v.mes} origem={v.origem} comTrabalho={v.comTrabalho}
                              aFrente={v.aFrente} como={v.como} recorte={v.recorte} escolher={v.escolher} />;
}

/**
 * O CONTROLE: o gatilho e o painel com a grade dos meses.
 *
 * NÃO É O `<input type="month">` que as três telas usavam. No menu navy ele
 * seria a máscara do navegador («--------- de ----») e o calendário do sistema
 * operacional, diferentes em cada um, e o Firefox do computador não o desenha.
 * A grade é um clique por mês, anda pelo teclado (setas, Home, End, PageUp e
 * PageDown trocam o ano) e marca o mês que tem trabalho.
 *
 * O PAINEL É UM DIÁLOGO NÃO MODAL, como o de setores: abre ao lado do gatilho,
 * fecha no Esc (devolvendo o foco), no clique fora e quando o Tab sai dele. Ele
 * leva o resto do que antes se espalhava pelas três telas: a dica do mês do
 * consumo, por que este mês, o alcance e o atalho.
 */
export function CorpoDoSeletorDeMes(p: {
  lugar: LugarDoMes;
  mes: string | null; origem: OrigemDoMes | null; comTrabalho: string | null; aFrente: string | null;
  como: ComoSegue; recorte: boolean;
  escolher: (mes: string) => void;
  /** O painel nasce aberto — o teste de render. */
  abertoInicial?: boolean;
}) {
  const [aberto, setAberto] = useState(Boolean(p.abertoInicial));
  const anoDoMes = () => Number((p.mes ?? mesDeHojeEmSP()).slice(0, 4));
  const [ano, setAno] = useState(anoDoMes);
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  /** O mês que recebe o foco depois de a grade trocar de ano pela seta. */
  const focarDepois = useRef<string | null>(null);
  const idPainel = useId();
  const idNota = useId();

  const nota = notaDoSeletor(p);
  const nomeInteiro = p.mes ? mesPorExtenso(p.mes) : null;

  const fechar = (devolverFoco: boolean) => {
    setAberto(false);
    if (devolverFoco) gatilho.current?.focus();
  };

  useEffect(() => {
    if (!aberto) return;
    /* O FOCO VAI PARA O MÊS ABERTO — é de onde se parte. */
    const raf = requestAnimationFrame(() => {
      caixa.current?.querySelector<HTMLElement>('.mes-grade button[tabindex="0"]')?.focus();
    });
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    addEventListener('mousedown', fora);
    return () => { cancelAnimationFrame(raf); removeEventListener('mousedown', fora); };
  }, [aberto]);

  /* A seta que passa de dezembro para janeiro troca o ano e leva o foco junto. */
  useEffect(() => {
    if (!focarDepois.current) return;
    caixa.current?.querySelector<HTMLElement>(`.mes-grade button[data-mes="${focarDepois.current}"]`)?.focus();
    focarDepois.current = null;
  }, [ano]);

  const abrirOuFechar = () => {
    if (!aberto) setAno(anoDoMes());
    setAberto(!aberto);
  };

  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  /* UMA PARADA DE TAB NA GRADE (o «tabindex móvel»): o mês aberto, se está no
     ano à vista; senão janeiro. As setas andam dentro dela. */
  const parada = p.mes && meses.includes(p.mes) ? p.mes : meses[0]!;

  const andar = (e: KeyboardEvent<HTMLDivElement>) => {
    const atual = (e.target as HTMLElement).dataset?.['mes'];
    if (!atual) return;
    const ir = (alvo: string) => {
      e.preventDefault();
      const novoAno = Number(alvo.slice(0, 4));
      if (novoAno !== ano) { focarDepois.current = alvo; setAno(novoAno); }
      else caixa.current?.querySelector<HTMLElement>(`.mes-grade button[data-mes="${alvo}"]`)?.focus();
    };
    if (e.key === 'ArrowRight') ir(mesVizinho(atual, 1));
    else if (e.key === 'ArrowLeft') ir(mesVizinho(atual, -1));
    else if (e.key === 'ArrowDown') ir(mesVizinho(atual, 4));
    else if (e.key === 'ArrowUp') ir(mesVizinho(atual, -4));
    else if (e.key === 'Home') ir(meses[0]!);
    else if (e.key === 'End') ir(meses[11]!);
    else if (e.key === 'PageUp') ir(mesVizinho(atual, -12));
    else if (e.key === 'PageDown') ir(mesVizinho(atual, 12));
  };

  return (
    <div ref={caixa} className={`mes-seletor mes-no-${p.lugar}`}
         /* A dica do menu RECOLHIDO (`menu-lateral.tsx`): o nome inteiro e a
            linha de baixo, no ponteiro e no foco. */
         data-dica={p.lugar === 'menu' ? `${nomeDoMesDeTrabalho(p.mes)}${nota.texto ? ` · ${nota.texto}` : ''}` : undefined}
         onKeyDown={(e) => { if (aberto && e.key === 'Escape') { e.stopPropagation(); fechar(true); } }}
         onBlur={(e) => {
           /* O Tab saiu do painel: fecha. Só com destino — no Safari o clique
              num botão não lhe dá foco (a mesma ressalva do seletor de setor). */
           if (aberto && e.relatedTarget && !caixa.current?.contains(e.relatedTarget as Node)) setAberto(false);
         }}>
      <button ref={gatilho} type="button" className={`mes-gatilho${nota.aviso ? ' com-aviso' : ''}`}
              aria-expanded={aberto} aria-controls={idPainel} aria-haspopup="dialog"
              aria-label={`${nomeDoMesDeTrabalho(p.mes)}. Trocar o mês`}
              aria-describedby={nota.texto ? idNota : undefined}
              aria-keyshortcuts={`${TECLAS_DO_MES.anterior} ${TECLAS_DO_MES.seguinte}`}
              title={p.lugar === 'faixa' ? nomeDoMesDeTrabalho(p.mes) : undefined}
              onClick={abrirOuFechar}>
        <span className="mes-gatilho-icone" aria-hidden="true">
          <Icone nome="calendario" tamanho={17} />
          {nota.aviso && <span className="mes-marca" />}
        </span>
        <span className="mes-gatilho-texto" aria-hidden="true">
          <span className="mes-gatilho-rotulo">Mês de trabalho</span>
          <span className="mes-gatilho-valor">{nomeInteiro ?? 'Procurando…'}</span>
        </span>
        <span className="mes-gatilho-curto" aria-hidden="true">{p.mes ? mesAbreviado(p.mes) : '…'}</span>
        <Icone nome="abrir_menu" tamanho={12} peso="bold" className="mes-gatilho-seta" />
      </button>
      {/* A LINHA DE BAIXO fica FORA do botão (é a descrição dele, e não parte
          do nome), e some no menu recolhido e na faixa — lá ela vai na dica. */}
      {nota.texto && (
        <p className={`mes-nota${nota.aviso ? ' com-aviso' : ''}`} id={idNota}>{nota.texto}</p>
      )}

      {aberto && (
        <div className="mes-painel" id={idPainel} role="dialog" aria-label="Escolher o mês de trabalho">
          <p className="mes-painel-dica">
            <strong>Mês de trabalho</strong> — {DICA_DO_MES}.
          </p>
          <div className="mes-painel-ano">
            <button type="button" className="so-icone" aria-label={`Ano anterior, ${ano - 1}`}
                    title={`Ano anterior, ${ano - 1}`} onClick={() => setAno(ano - 1)}>
              <Icone nome="mes_anterior" tamanho={16} peso="bold" />
            </button>
            <strong aria-live="polite">{ano}</strong>
            <button type="button" className="so-icone" aria-label={`Ano seguinte, ${ano + 1}`}
                    title={`Ano seguinte, ${ano + 1}`} onClick={() => setAno(ano + 1)}>
              <Icone nome="mes_seguinte" tamanho={16} peso="bold" />
            </button>
          </div>
          <div className="mes-grade" role="group" aria-label={`Meses de ${ano}`} onKeyDown={andar}>
            {meses.map((m, i) => {
              const comTrabalho = m === p.comTrabalho;
              return (
                <button key={m} type="button" data-mes={m} tabIndex={m === parada ? 0 : -1}
                        aria-pressed={m === p.mes}
                        className={comTrabalho ? 'com-trabalho' : undefined}
                        aria-label={`${mesPorExtenso(m)}${comTrabalho ? ', tem trabalho' : ''}`}
                        onClick={() => { p.escolher(m); fechar(true); }}>
                  {mesCurtoDoAno(i + 1)}
                  {comTrabalho && <span className="mes-marca" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {p.comTrabalho && (
            <p className="mes-painel-legenda">
              <span className="mes-marca" aria-hidden="true" /> {mesPorExtenso(p.comTrabalho)} tem trabalho por fazer
            </p>
          )}
          {p.origem && p.origem !== 'escolhido' && <p className="mes-painel-porque">{fraseDaOrigem(p.origem)}</p>}
          <p className="mes-painel-alcance">
            {fraseDoAlcance()} As teclas <kbd>{TECLAS_DO_MES.anterior}</kbd> e <kbd>{TECLAS_DO_MES.seguinte}</kbd> trocam
            o mês nas telas do mês, fora dos campos de texto.
          </p>
        </div>
      )}
    </div>
  );
}

// ================================================================ o aviso

/**
 * «HÁ TRABALHO EM OUTUBRO» — no alto das telas que mostram o mês, quando o mês
 * aberto veio de uma lembrança ou de um link e está atrás do mês com trabalho
 * (`mesComTrabalhoAFrente`). Âmbar, de tarefa: nada deu errado, mas há o que
 * fazer noutro mês. O botão é comum, e não laranja — o ato da tela é outro.
 */
export function AvisoDoMesVelho() {
  const v = useMesDoTrabalho();
  if (!v.ativo || !v.mes || !v.aFrente || v.como === 'nao_segue') return null;
  if (v.como === 'recorta' && !v.recorte) return null;
  const alvo = v.aFrente;
  return <CorpoDoAvisoDoMesVelho mes={v.mes} origem={v.origem} aFrente={alvo} ir={() => v.escolher(alvo)} />;
}

export function CorpoDoAvisoDoMesVelho(p: {
  mes: string; origem: OrigemDoMes | null; aFrente: string; ir: () => void;
}) {
  const porque = p.origem === 'endereco' ? 'o mês do link que trouxe você' : 'o último que você escolheu';
  return (
    <Aviso tipo="alerta">
      <span className="mes-velho">
        <span>
          <strong>Há trabalho em {mesPorExtenso(p.aFrente)}.</strong> Esta tela está em {mesPorExtenso(p.mes)},
          {' '}{porque}.
        </span>
        <button type="button" onClick={p.ir}>
          Ir para {mesPorExtenso(p.aFrente)} <Icone nome="ir_para" tamanho={15} />
        </button>
      </span>
    </Aviso>
  );
}
