// A TELA DE EMISSÃO E COBRANÇA, na parte que DESENHA sem buscar nada: a
// revisão dos atos em série, a recusa com saída, a confirmação na própria linha
// e o resumo do pagamento. O que a tela BUSCA e GRAVA continua em
// `telas/faturas.tsx`; o que ela DECIDE mora em `emissao-regras.ts`.
//
// ============================================================================
// POR QUE ISTO SAIU DA TELA EM 30/09/2026 (etapa 2 do redesenho)
//
// É o mesmo corte da Fatura unificada (`fatura-lote-corpo.tsx`): componente que
// recebe tudo por propriedade pode ser montado num teste
// (`web/tests/caso-render.tsx`), e o que não é montado num teste é promessa.
// Os quatro estados que a crítica de 30/09 pediu — a revisão antes de emitir, a
// recusa que diz «Completar o endereço», a confirmação do pagamento, a
// confirmação do cancelamento — são os quatro que moram aqui.
//
// ============================================================================
// AS DECISÕES QUE VALEM PARA TODOS
//
//   NENHUM `window.confirm` E NENHUM `window.prompt`. A primeira emissão da
//   história da empresa acontecia numa caixa do navegador, sem a lista, os
//   valores e os vencimentos à vista; o motivo do cancelamento era digitado num
//   `prompt()` de uma linha. Aqui toda pergunta acontece NA TELA, ao lado do que
//   ela afeta, com o foco no gesto que não muda nada.
//
//   UM PRIMÁRIO POR CONTEXTO. Na revisão, o laranja é o «Sim» do ato; no resumo
//   do pagamento, também. Quem desfaz (cancelar) é contornado no vermelho e só
//   fica cheio sob o ponteiro.
//
//   «UC» NÃO APARECE ESCRITO. A suíte de vocabulário recusa a sigla; a tela diz
//   «unidade».

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Aviso, DetalheTecnico, Icone, Marca, rotulo } from './ui.tsx';
import { Ligacao } from './rota.tsx';
import { emReais } from './dinheiro.ts';
import { tomDoStatusDaFatura } from './cobranca-regras.ts';
import { ICONE_DO_STATUS_DA_FATURA } from './iconografia.ts';
import {
  placarDaSerie, boletos,
  type EstadoDaVez, type RecusaLida, type SaidaDaRecusa, type StatusDaCobranca,
} from './emissao-regras.ts';

/** `2026-10-05` -> `05/10/2026`, sem `new Date` (fuso negativo volta um dia). */
export const dataEmBr = (v: string | null | undefined): string =>
  (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

/* ============================================================ a situação */

/**
 * O SELO DA COBRANÇA e, embaixo dele, o porquê curto quando há um — «Falta o
 * endereço do pagador.», «Boleto ainda não pedido.». O selo sozinho dizia
 * «Emitida» para a cobrança que não tinha chegado ao banco, que é exatamente a
 * que precisa de alguém.
 */
export function SituacaoDaCobranca({ status, nota }: {
  status: StatusDaCobranca;
  nota: { texto: string; alerta: boolean } | null;
}) {
  return (
    <>
      <Marca tom={tomDoStatusDaFatura(status)} icone={ICONE_DO_STATUS_DA_FATURA[status]}>
        {rotulo(status)}
      </Marca>
      {nota && (
        <span className={`em-nota${nota.alerta ? ' alerta' : ''}`} title={nota.texto}>
          {nota.alerta && <Icone nome="aviso_alerta" tamanho={13} peso="bold" />}
          <span>{nota.texto}</span>
        </span>
      )}
    </>
  );
}

/* ================================================== a recusa com saída */

/**
 * A SAÍDA DE UMA RECUSA — um LINK com cara de botão, e não um botão.
 *
 * Ele leva a outra tela (Unidades, Clientes, Conector Sicoob), e o que leva é
 * link: botão do meio, «abrir em outra aba» e «copiar endereço» funcionam. A
 * seta no fim diz, antes do clique, que a pessoa vai sair daqui.
 */
export function BotaoDaSaida({ saida, primario, rotuloAcessivel }: {
  saida: SaidaDaRecusa; primario?: boolean; rotuloAcessivel?: string;
}) {
  return (
    <Ligacao para={saida.destino} className={`botao${primario ? ' primario' : ''}`} rotulo={rotuloAcessivel}>
      {saida.rotulo}
      <Icone nome="ir_para" tamanho={14} peso="bold" />
    </Ligacao>
  );
}

/**
 * A RECUSA NA TELA: o que falta, o que fazer, a saída — e o código cru ATRÁS do
 * «ver detalhe técnico».
 *
 * ATÉ 30/09 ERA O CONTRÁRIO: «Último erro do banco: PagadorSemEndereco» em
 * vermelho, e embaixo o «Gerar boleto» laranja que o servidor ia recusar pelo
 * mesmo motivo. Quem lia precisava saber o que era `PagadorSemEndereco` e em
 * qual tela o endereço mora.
 *
 * SEM TRADUÇÃO CONHECIDA, a resposta do banco aparece com as palavras dele — é
 * a única informação que há, e escondê-la seria pior que mostrá-la crua.
 */
export function RecusaNaTela({ recusa, bruto, primario, unidade }: {
  recusa: RecusaLida | null;
  /** O texto que voltou, para quando a recusa não é conhecida. */
  bruto?: string | null;
  /** Se a saída é o laranja deste contexto. */
  primario?: boolean;
  unidade?: string;
}) {
  if (!recusa) {
    if (!bruto) return null;
    return (
      <div className="em-recusa">
        <p className="em-recusa-frase">
          <Icone nome="aviso_alerta" tamanho={15} peso="bold" />
          <span><strong>O banco recusou.</strong> A resposta dele foi: {bruto}</span>
        </p>
      </div>
    );
  }
  return (
    <div className="em-recusa">
      <p className="em-recusa-frase">
        <Icone nome="aviso_alerta" tamanho={15} peso="bold" />
        <span>
          {recusa.prevista && 'O banco vai recusar este boleto: '}
          <strong>{recusa.frase}</strong> {recusa.oQueFazer}
        </span>
      </p>
      {recusa.saida && (
        <div className="em-acoes em-recusa-acoes">
          <BotaoDaSaida saida={recusa.saida} primario={primario}
                        rotuloAcessivel={unidade ? `${recusa.saida.rotulo} da unidade ${unidade}` : undefined} />
        </div>
      )}
      {recusa.original && (
        <DetalheTecnico>
          <p style={{ margin: 0 }}>O que voltou do servidor: <code>{recusa.original}</code></p>
        </DetalheTecnico>
      )}
    </div>
  );
}

/* ========================================= a revisão dos atos em série */

export type LinhaDaSerie = {
  id: string;
  unidade: string;
  cliente: string | null;
  vencimento: string | null;
  valor_centavos: number | null;
};

function SituacaoDaVez({ tipo, e }: { tipo: 'emitir' | 'boletos'; e: EstadoDaVez | undefined }) {
  if (!e) return null;
  if (e.estado === 'na_vez') return <Marca tom="nao_medido" icone="a_receber">Na vez</Marca>;
  if (e.estado === 'andando') {
    return <Marca tom="nao_medido" icone="carregando">{tipo === 'emitir' ? 'Emitindo…' : 'Pedindo…'}</Marca>;
  }
  if (e.estado === 'feita') {
    return <Marca tom="ok" icone="confirmar">{tipo === 'emitir' ? 'Emitida' : 'Boleto registrado'}</Marca>;
  }
  return <Marca tom="erro">Recusada</Marca>;
}

/**
 * A REVISÃO ANTES DO ATO — «Emitir N cobranças» e «Pedir os N boletos» usam a
 * mesma, e ela é o padrão do «Gerar N cobranças» da Fatura unificada.
 *
 * ANTES: a lista do que vai acontecer (unidade, cliente, vencimento, valor), a
 * soma, o alerta dito em português, e cada linha pode ser tirada da rodada. É
 * a primeira emissão da empresa que acontece aqui — ela precisa ser vista antes.
 *
 * DURANTE: o placar. As chamadas vão uma a uma, e cada linha diz o que houve.
 *
 * DEPOIS: o resultado e o PRÓXIMO PASSO como ato — depois de emitir, «Pedir os
 * N boletos». O mês anda sem a pessoa precisar descobrir qual é o botão seguinte.
 */
export function RevisaoDaSerie(p: {
  tipo: 'emitir' | 'boletos';
  /** «setembro de 2026». */
  mes: string;
  linhas: readonly LinhaDaSerie[];
  estados: Readonly<Record<string, EstadoDaVez>>;
  /** Há uma rodada (em curso ou terminada) — a revisão virou placar. */
  emRodada: boolean;
  rodando: boolean;
  /** O alerta que precisa ser lido ANTES do sim (a tarifa que falta). */
  alerta?: ReactNode;
  /** O que ficou de fora e por quê — com a saída de cada um. */
  deFora?: ReadonlyArray<{ id: string; unidade: string; cliente: string | null; recusa: RecusaLida }>;
  aoConfirmar: (ids: string[]) => void;
  aoFechar: () => void;
  /** O próximo passo, oferecido quando a rodada termina. */
  proxima?: { rotulo: string; ao: () => void } | null;
}) {
  const [tiradas, setTiradas] = useState<ReadonlySet<string>>(new Set());
  const titulo = useRef<HTMLHeadingElement>(null);
  /* O FOCO VAI AO TÍTULO quando a revisão abre: o leitor de tela anuncia a
     pergunta, e o próximo Tab entra na lista. Sem isso, quem usa teclado ficava
     no botão que acabou de sumir. */
  useEffect(() => { titulo.current?.focus(); }, []);

  const escolhidas = p.emRodada ? p.linhas : p.linhas.filter((l) => !tiradas.has(l.id));
  const n = escolhidas.length;
  const placar = placarDaSerie(p.estados);
  const acabou = p.emRodada && !p.rodando;
  const soma = escolhidas.reduce((a, l) => a + (l.valor_centavos ?? 0), 0);
  const cobrancas = (k: number) => `${k} ${k === 1 ? 'cobrança' : 'cobranças'}`;

  const textoDoTitulo = p.tipo === 'emitir'
    ? (!p.emRodada ? `Emitir ${cobrancas(n)} de ${p.mes}?`
      : p.rodando ? `Emitindo ${Math.min(placar.feitas + placar.recusadas + 1, placar.total)} de ${placar.total}…`
      : `${placar.feitas} de ${placar.total} ${placar.total === 1 ? 'emitida' : 'emitidas'}`)
    : (!p.emRodada ? `Pedir ${boletos(n)} ao banco?`
      : p.rodando ? `Pedindo ${Math.min(placar.feitas + placar.recusadas + 1, placar.total)} de ${placar.total}…`
      : `${placar.feitas} de ${placar.total} ${placar.total === 1 ? 'boleto registrado' : 'boletos registrados'}`);

  const nota = !p.emRodada
    ? (p.tipo === 'emitir'
      ? 'Emitir fecha o valor: depois disso a cobrança não muda mais sozinha e pode virar boleto. '
        + 'Nada é enviado ao cliente neste passo. Tire da lista o que ainda não deve sair.'
      : 'Cada pedido confere primeiro o cadastro e só então chama o banco. Uma recusa não para as '
        + 'outras, e o motivo aparece na linha.')
    : p.rodando
      ? 'Uma de cada vez, na ordem abaixo. Pode acompanhar aqui; não feche a página.'
      : placar.recusadas === 0
        ? (p.tipo === 'emitir'
          ? 'Todas emitidas. O próximo passo é pedir os boletos ao banco.'
          : 'Todos registrados no banco. A folha com o boleto sai em Contas de luz, na aba «2 · Folha do cliente».')
        : p.tipo === 'emitir'
          ? `${placar.recusadas} ${placar.recusadas === 1 ? 'foi recusada' : 'foram recusadas'} — o motivo `
            + 'está na linha. As outras foram emitidas.'
          : `${placar.recusadas} ${placar.recusadas === 1 ? 'foi recusado' : 'foram recusados'} — o motivo `
            + 'e o que fazer estão na linha. Os outros foram registrados.';

  return (
    <div className="em-revisao" role="region" aria-labelledby="em-revisao-titulo">
      <h3 id="em-revisao-titulo" ref={titulo} tabIndex={-1}>{textoDoTitulo}</h3>
      <p className="em-revisao-nota" role="status">{nota}</p>
      {!p.emRodada && p.alerta}

      <ol className="em-revisao-lista">
        {p.linhas.map((l) => {
          const e = p.estados[l.id];
          const tirada = !p.emRodada && tiradas.has(l.id);
          return (
            <li key={l.id} className={tirada ? 'em-rev-tirada' : e ? `em-rev-${e.estado}` : undefined}>
              <span className="r-sel">
                {!p.emRodada && (
                  <input type="checkbox" checked={!tirada}
                         aria-label={`Incluir a unidade ${l.unidade}`}
                         onChange={(ev) => setTiradas((s) => {
                           const x = new Set(s);
                           if (ev.target.checked) x.delete(l.id); else x.add(l.id);
                           return x;
                         })} />
                )}
              </span>
              <span className="r-uc">{l.unidade}</span>
              <span className="r-cli" title={l.cliente ?? undefined}>{l.cliente || '—'}</span>
              <span className="r-ven">vence {dataEmBr(l.vencimento)}</span>
              <span className="r-val num">{emReais(l.valor_centavos)}</span>
              <span className="r-est"><SituacaoDaVez tipo={p.tipo} e={e} /></span>
              {e?.estado === 'recusada' && (
                <span className="r-motivo">
                  <RecusaNaTela recusa={e.recusa} bruto={e.motivo} unidade={l.unidade} />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!p.emRodada && p.deFora && p.deFora.length > 0 && (
        <div className="em-defora">
          <p className="em-defora-titulo">
            {p.deFora.length === 1 ? 'Fica de fora, porque o banco recusaria:' : `Ficam de fora ${p.deFora.length}, porque o banco recusaria:`}
          </p>
          <ul>
            {p.deFora.map((d) => (
              <li key={d.id}>
                <span className="r-uc">{d.unidade}</span>
                <span className="r-cli">{d.cliente || '—'}</span>
                <span className="r-frase">{d.recusa.frase}</span>
                {d.recusa.saida && (
                  <BotaoDaSaida saida={d.recusa.saida}
                                rotuloAcessivel={`${d.recusa.saida.rotulo} da unidade ${d.unidade}`} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="em-revisao-pe">
        <span className="em-revisao-soma">
          Soma: <strong>{emReais(soma)}</strong> em {cobrancas(n)}
        </span>
        <span className="em-acoes">
          {!p.emRodada && (
            <>
              <button type="button" className="discreto" onClick={p.aoFechar}>Cancelar</button>
              <button type="button" className="primario" disabled={n === 0}
                      onClick={() => p.aoConfirmar(escolhidas.map((l) => l.id))}>
                {p.tipo === 'emitir'
                  ? (n === 1 ? 'Sim, emitir a cobrança' : `Sim, emitir as ${n}`)
                  : (n === 1 ? 'Sim, pedir o boleto' : `Sim, pedir os ${n}`)}
              </button>
            </>
          )}
          {acabou && (
            <>
              <button type="button" className={p.proxima ? undefined : 'primario'} onClick={p.aoFechar}>Fechar</button>
              {p.proxima && (
                <button type="button" className="primario" onClick={p.proxima.ao}>{p.proxima.rotulo}</button>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/* ================================== a confirmação na própria linha */

/**
 * A PERGUNTA NA LINHA, no lugar do `window.confirm` e do `window.prompt`.
 *
 * O FOCO NASCE NO GESTO QUE NÃO MUDA NADA — «Manter» — ou no campo do motivo
 * quando há um: um Enter distraído não desfaz nada. `Escape` é o mesmo que
 * «Manter». O ato que desfaz é contornado no vermelho e fica travado até o
 * motivo existir, porque o servidor recusa sem ele (422) e a pergunta existe
 * para não descobrir isso no erro.
 */
export function ConfirmacaoNaLinha(p: {
  rotulo: string;
  children: ReactNode;
  motivo?: { rotulo: string; dica?: string };
  manter: string;
  confirmar: string;
  perigo?: boolean;
  ocupado?: boolean;
  erro?: string | null;
  aoManter: () => void;
  aoConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const id = useId();
  const falta = Boolean(p.motivo) && motivo.trim() === '';
  return (
    <div className={`em-confirma${p.perigo ? ' perigo' : ''}`} role="group" aria-label={p.rotulo}
         onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); p.aoManter(); } }}>
      <div className="em-confirma-texto">{p.children}</div>
      {p.motivo && (
        <div className="em-confirma-motivo">
          <label htmlFor={id}>{p.motivo.rotulo}</label>
          <textarea id={id} rows={2} value={motivo} autoFocus placeholder={p.motivo.dica}
                    onChange={(e) => setMotivo(e.target.value)} />
          <span className="em-confirma-dica">Fica registrado com o seu nome e a data.</span>
        </div>
      )}
      {p.erro && <Aviso tipo="erro">{p.erro}</Aviso>}
      <div className="em-acoes">
        <button type="button" autoFocus={!p.motivo} onClick={p.aoManter} disabled={p.ocupado}>{p.manter}</button>
        <button type="button" className={p.perigo ? 'em-perigo' : 'primario'}
                disabled={p.ocupado || falta} onClick={() => p.aoConfirmar(motivo.trim())}>
          {p.ocupado && <Icone nome="carregando" tamanho={15} />}
          {p.confirmar}
        </button>
      </div>
    </div>
  );
}

/* ========================================== o resumo do pagamento */

/**
 * O RESUMO DO PAGAMENTO, antes de registrar — porque registrar NÃO SE DESFAZ.
 *
 * Até 30/09 era um `window.confirm` com um parágrafo, e o botão que o abria era
 * o laranja do painel, com o mesmo peso de «Gerar boleto». Agora o botão é
 * comum, e o laranja é o «Sim» DAQUI: depois de ver o valor aberto em parcelas,
 * a data e o que vai acontecer com o dinheiro.
 */
export function ResumoDaBaixa(p: {
  unidade: string;
  consumo_centavos: number;
  tarifas_centavos: number;
  juros_centavos: number;
  multa_centavos: number;
  total_centavos: number;
  /** AAAA-MM-DD. */
  data: string;
  observacao: string;
  ocupado?: boolean;
  erro?: string | null;
  aoVoltar: () => void;
  aoConfirmar: () => void;
}) {
  return (
    <div className="em-confirma em-resumo" role="group" aria-label="Confirmar o pagamento"
         onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); p.aoVoltar(); } }}>
      <div className="em-confirma-texto">
        <p className="em-resumo-pergunta">
          Registrar o pagamento de <strong>{emReais(p.total_centavos)}</strong> da unidade{' '}
          <strong>{p.unidade}</strong>, recebido em <strong>{dataEmBr(p.data)}</strong>?
        </p>
        <dl className="em-resumo-contas">
          <div><dt>Energia</dt><dd className="num">{emReais(p.consumo_centavos)}</dd></div>
          <div><dt>Tarifa da distribuidora</dt><dd className="num">{emReais(p.tarifas_centavos)}</dd></div>
          <div><dt>Juros</dt><dd className="num">{emReais(p.juros_centavos)}</dd></div>
          <div><dt>Multa</dt><dd className="num">{emReais(p.multa_centavos)}</dd></div>
          <div className="em-resumo-total"><dt>Total recebido</dt><dd className="num">{emReais(p.total_centavos)}</dd></div>
          {p.observacao.trim() && <div><dt>Observação</dt><dd>{p.observacao.trim()}</dd></div>}
        </dl>
        <p className="em-resumo-efeito">
          Ao registrar, o dinheiro é dividido na mesma hora: a comissão de quem trouxe o cliente e a
          parte do dono da usina. Se faltar o cadastro do dono, a cobrança fica paga e a divisão fica
          pendente — a tela avisa. <strong>Não há como desfazer isto pelo sistema.</strong>
        </p>
      </div>
      {p.erro && <Aviso tipo="erro">{p.erro}</Aviso>}
      <div className="em-acoes">
        <button type="button" autoFocus onClick={p.aoVoltar} disabled={p.ocupado}>Voltar</button>
        <button type="button" className="primario" disabled={p.ocupado} onClick={p.aoConfirmar}>
          {p.ocupado && <Icone nome="carregando" tamanho={15} />}
          Sim, registrar o pagamento
        </button>
      </div>
    </div>
  );
}
