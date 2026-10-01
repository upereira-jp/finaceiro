// A REVISÃO DE UMA SÉRIE E A PERGUNTA NA TELA — dois desenhos que o sistema
// repete, escritos uma vez.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU (30/09/2026, etapa 4b do redesenho)
//
// As etapas 1 e 2 fizeram o MESMO desenho duas vezes, cada uma na sua tela:
//
//   A REVISÃO ANTES DA SÉRIE — «Gerar N cobranças» em Contas de luz
//   (`fatura-lote-corpo.tsx`) e «Emitir N» / «Pedir os N boletos» em Cobranças
//   (`emissao-corpo.tsx`): a caixa contornada no laranja-texto, o título que é
//   a pergunta, a nota viva, a lista que rola, a soma e o «Sim» — e, durante a
//   rodada, o placar.
//
//   A PERGUNTA NA PRÓPRIA LINHA — o «Excluir o registro» e a «2ª via» na tabela
//   de Contas de luz, «Limpar a fila» e «Nova fatura» na barra, o cancelamento
//   em Cobranças: a frase, «Manter» com o foco, o ato que desfaz contornado no
//   vermelho, Esc para desistir.
//
// Eram dois CSS paralelos (`fu-*` e `em-*`) com as mesmas regras e medidas
// quase iguais — o tipo de duplicação que diverge na primeira correção e faz o
// mesmo gesto parecer duas coisas diferentes. E as quatro telas que ainda
// usavam `window.confirm`/`window.prompt` (Contas de luz, Unidades, Contratos,
// Usuários) passaram a usar a mesma pergunta.
//
// ============================================================================
// AS REGRAS QUE OS DOIS CARREGAM, e que por isso nenhuma tela reescreve
//
//   O FOCO NASCE NO GESTO QUE NÃO MUDA NADA. Na pergunta, «Manter» (ou o campo,
//   quando ela pede um); na revisão, o título — o leitor anuncia a pergunta e o
//   próximo Tab entra na lista. Um Enter distraído não desfaz nada.
//
//   ESC É O MESMO QUE «MANTER». Quem usa teclado desiste sem procurar o botão.
//
//   UM PRIMÁRIO POR CONTEXTO. O laranja é o «Sim» de um ato que anda para a
//   frente; o ato que DESFAZ é contornado no vermelho e só fica cheio sob o
//   ponteiro. A pergunta em âmbar («a 2ª via tira a conta em edição da tela»)
//   não tem primário nenhum: nada se perde no banco, e nenhum dos dois é o
//   caminho recomendado.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Aviso, Icone } from './ui.tsx';

/* ================================================== a pergunta na tela */

/**
 * O TOM diz o que o «sim» faz, e ele decide a cor da caixa e do botão:
 *
 *   `perigo`   apaga ou cancela — fundo do erro, botão contornado no vermelho;
 *   `aviso`    tira algo da TELA, não do banco — fundo âmbar, botão comum;
 *   `comum`    anda para a frente — fundo do cartão, o «sim» é o laranja;
 *   `decisao`  como `comum`, com o contorno do acento — o resumo do pagamento,
 *              que não se desfaz e merece ser visto como a decisão da tela.
 */
export type TomDaPergunta = 'perigo' | 'aviso' | 'comum' | 'decisao';

/**
 * A PERGUNTA NA TELA, no lugar do `window.confirm` e do `window.prompt`.
 *
 * `forma="linha"` põe a frase e os dois atos lado a lado (a linha de uma
 * tabela, a barra de ações); `forma="bloco"` (o padrão) empilha frase, campo,
 * erro e atos — é a que cabe um motivo ou um resumo.
 *
 * O CAMPO É OPCIONAL, e quando existe o «sim» fica travado até ele ter texto:
 * o motivo do cancelamento, que o servidor recusa sem (422), ou o nome do
 * modelo novo. A pergunta existe para não descobrir isso no erro.
 */
export function PerguntaNaTela(p: {
  /** O nome do grupo para o leitor de tela: «Confirmar a exclusão». */
  rotulo: string;
  /** A pergunta, com o que muda e o que fica. Pode faltar quando o campo já é a
   *  pergunta («Nome do modelo novo»). */
  children?: ReactNode;
  manter: string;
  confirmar: string;
  tom?: TomDaPergunta;
  forma?: 'bloco' | 'linha';
  campo?: {
    rotulo: string;
    dica?: string;
    /** A frase miúda embaixo do campo («Fica registrado com o seu nome e a data.»). */
    nota?: string;
    /** Mais de uma linha vira área de texto. */
    linhas?: number;
    inicial?: string;
  };
  ocupado?: boolean;
  erro?: string | null;
  aoManter: () => void;
  aoConfirmar: (valor: string) => void;
  className?: string;
}) {
  const tom = p.tom ?? 'comum';
  const [valor, setValor] = useState(p.campo?.inicial ?? '');
  /* QUEM ABRIU A PERGUNTA, lido no primeiro render — antes de o `autoFocus`
     levar o foco para «Manter». Quando a pergunta sai da tela (manteve,
     confirmou, Esc), o foco volta para ele; sem isto caía no `body`, e o
     próximo Tab recomeçava do alto da página. Se o gatilho sumiu junto (a linha
     excluída), não há para onde voltar, e o navegador decide. */
  const [origem] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => () => {
    const agora = document.activeElement;
    if ((!agora || agora === document.body) && origem instanceof HTMLElement && origem.isConnected) origem.focus();
  }, [origem]);
  const id = useId();
  const falta = Boolean(p.campo) && valor.trim() === '';
  const classeDoSim = tom === 'perigo' ? 'perigo' : tom === 'aviso' ? undefined : 'primario';
  const confirmar = () => { if (!p.ocupado && !falta) p.aoConfirmar(valor.trim()); };

  return (
    <div className={['pergunta', `tom-${tom}`, p.forma === 'linha' ? 'na-linha' : null, p.className]
                      .filter(Boolean).join(' ')}
         role="group" aria-label={p.rotulo}
         onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); p.aoManter(); } }}>
      {p.children && <div className="pergunta-texto">{p.children}</div>}
      {p.campo && (
        <div className="pergunta-campo">
          <label htmlFor={id}>{p.campo.rotulo}</label>
          {(p.campo.linhas ?? 1) > 1 ? (
            <textarea id={id} rows={p.campo.linhas} value={valor} autoFocus placeholder={p.campo.dica}
                      onChange={(e) => setValor(e.target.value)} />
          ) : (
            <input id={id} value={valor} autoFocus placeholder={p.campo.dica}
                   onChange={(e) => setValor(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } }} />
          )}
          {p.campo.nota && <span className="pergunta-nota">{p.campo.nota}</span>}
        </div>
      )}
      {p.erro && <Aviso tipo="erro">{p.erro}</Aviso>}
      <div className="pergunta-atos">
        <button type="button" autoFocus={!p.campo} onClick={p.aoManter} disabled={p.ocupado}>{p.manter}</button>
        <button type="button" className={classeDoSim} disabled={p.ocupado || falta} onClick={confirmar}>
          {p.ocupado && <Icone nome="carregando" tamanho={15} />}
          {p.confirmar}
        </button>
      </div>
    </div>
  );
}

/* ============================================ a revisão antes da série */

/**
 * A REVISÃO ANTES DE UMA SÉRIE — a casca comum de «Gerar N cobranças»,
 * «Emitir N cobranças» e «Pedir os N boletos».
 *
 * ANTES do ato ela é a lista do que vai acontecer e a soma; DURANTE, o placar
 * (as chamadas vão uma a uma, e cada linha diz o que houve); DEPOIS, o
 * resultado e o próximo passo. Quem chama decide as frases e os atos de cada
 * momento; a casca garante o resto — a região com nome, o foco no título ao
 * abrir, a nota que o leitor anuncia (`role="status"`), a lista que rola sem
 * empurrar a tabela para fora da tela, e a soma ao lado do «Sim».
 *
 * `comSelecao` é a lista de Cobranças: a primeira coluna é a caixa de tirar a
 * linha da rodada, e há a coluna do vencimento. A de Contas de luz não tem as
 * duas — quem escolhe o que entra é a própria tabela, antes de abrir.
 */
export function RevisaoEmSerie(p: {
  /** O `id` da região; o título é `<id>-titulo`. */
  id: string;
  titulo: ReactNode;
  nota: ReactNode;
  /** O que precisa ser lido ANTES do sim (a tarifa que falta). */
  alerta?: ReactNode;
  comSelecao?: boolean;
  /** As linhas — `ItemDaSerie`. */
  children: ReactNode;
  /** O que vem depois da lista (o que ficou de fora e por quê). */
  depois?: ReactNode;
  soma: ReactNode;
  atos: ReactNode;
  /**
   * A RODADA ACABOU, e o título virou o placar («5 de 5 emitidas»).
   * [01/10/2026, etapa 5] A nota é a região viva da revisão, e ela já dizia
   * «Todas emitidas»; o NÚMERO estava só no título, que não é anunciado. Com
   * `resultado`, o placar entra na região (para o leitor de tela; a vista já
   * o tem no título) — a frase ouvida passa a ser a do resultado inteiro.
   */
  resultado?: boolean;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  /* O FOCO VAI AO TÍTULO quando a revisão abre: o botão que a abriu some da
     tela (a revisão toma o lugar dele), e sem isto o foco caía no `body` e o
     próximo Tab recomeçava do alto da página. */
  useEffect(() => { titulo.current?.focus(); }, []);
  return (
    <div className="serie-revisao" id={p.id} role="region" aria-labelledby={`${p.id}-titulo`}>
      <h3 id={`${p.id}-titulo`} ref={titulo} tabIndex={-1}>{p.titulo}</h3>
      <p className="serie-nota" role="status">
        {p.resultado && <span className="so-leitor">{p.titulo}. </span>}
        {p.nota}
      </p>
      {p.alerta}
      <ol className={`serie-lista${p.comSelecao ? ' com-selecao' : ''}`}>{p.children}</ol>
      {p.depois}
      <div className="serie-pe">
        <span className="serie-soma">{p.soma}</span>
        <span className="serie-atos">{p.atos}</span>
      </div>
    </div>
  );
}

/**
 * UMA LINHA DA REVISÃO. As colunas têm nome fixo (`r-uc`, `r-cli`, `r-val`…)
 * e a grade é do CSS: no celular elas se rearrumam em cartão sem o HTML mudar.
 *
 * `selecao` e `vencimento` existem só na lista `comSelecao` — `null` desenha a
 * célula vazia (a caixa some durante a rodada, mas a coluna fica).
 */
export function ItemDaSerie(p: {
  /** `tirada` risca a linha; os estados da rodada (`feita`, `recusada`…) ficam
   *  na classe para quem precisar pintar. */
  estado?: string;
  selecao?: ReactNode;
  unidade: ReactNode;
  cliente: string | null;
  vencimento?: ReactNode;
  valor: ReactNode;
  situacao?: ReactNode;
  /** O porquê de uma recusa, numa linha própria na largura da lista — na
   *  coluna de estado ele virava uma torre de dez linhas. */
  motivo?: ReactNode;
}) {
  return (
    <li className={p.estado ? `serie-${p.estado}` : undefined}>
      {p.selecao !== undefined && <span className="r-sel">{p.selecao}</span>}
      <span className="r-uc">{p.unidade}</span>
      <span className="r-cli" title={p.cliente ?? undefined}>{p.cliente || '—'}</span>
      {p.vencimento !== undefined && <span className="r-ven">{p.vencimento}</span>}
      <span className="r-val num">{p.valor}</span>
      <span className="r-est">{p.situacao}</span>
      {p.motivo && <span className="r-motivo">{p.motivo}</span>}
    </li>
  );
}
