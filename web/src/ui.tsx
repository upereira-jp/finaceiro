// Os componentes. Um arquivo, sem biblioteca de UI.
//
// A ESCOLHA E COERENTE COM O RESTO: o servidor e `node:http` puro e as rotas sao
// "uma tabela, nao um framework". Uma biblioteca de componentes aqui seria a
// maior dependencia do projeto inteiro, para telas que sao formulario e tabela.
//
// O QUE MUDOU EM 29/07/2026, a pedido do dono: o visual clareou e o laranja da
// marca ganhou presenca, os rotulos sairam do minusculo-tudo para a caixa de
// sentenca, e as tabelas ganharam busca, filtro e ordenacao.
//
// O QUE MUDOU EM 30/07/2026, a pedido do dono: o acabamento. Tres arquivos novos
// dividem com este o que antes era so ele, e a divisao nao e arrumacao — e o que
// torna as promessas VERIFICAVEIS, porque o runner do `web/` nao le JSX:
//
//   `estilo.ts`       o CSS inteiro. Puro, entao `web/tests/interface.ts` le o
//                     proprio CSS e confere as cores literais e o movimento
//   `iconografia.ts`  o vocabulario fechado de icones e o mapa dos estados
//   `icones.tsx`      os desenhos do Phosphor. `Record` exaustivo: nome sem
//                     desenho nao compila
//   `navegacao.ts`    rota, titulo, icone e grupo das doze telas
//
// AQUI FICARAM OS COMPONENTES, e nada mais. Os novos sao os que o pedido de
// acabamento exigiu: `BotaoDeIcone` (o "OK" que virou botao redondo),
// `Interruptor` (o checkbox nativo), `CampoData` (o calendario clicavel),
// `Menu` (a area do usuario), `Kpi` (o cartao de numero) e `Carregando` (a
// engrenagem com o sol da G3). [30/09, etapa 4a] E os dois do «menos prosa»:
// `PainelDeCriar` (listar antes de criar) e `Recolhido` (o que se confere de vez
// em quando fica fechado, com o resumo de uma linha a vista).

import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, CSSProperties, KeyboardEvent as EventoDeTecla, SyntheticEvent } from 'react';
import { lerModo, aplicarModo, type ModoTema } from './tema.ts';
import { Icone, Logotipo } from './icones.tsx';
import { ICONE_DO_AVISO, type NomeDeIcone } from './iconografia.ts';
import type { Selo } from './tom-do-estado.ts';
import { PORQUE } from './porques.ts';
import { tecladoDoCampo, type Teclado } from './teclado.ts';

export { Icone, Logotipo };
export { ESTILO } from './estilo.ts';

// ------------------------------------------------------------------- avisos

/**
 * O AVISO. Fundo tingido do estado, contorno de 1px na mesma matiz, icone
 * proprio na cor do estado, e o TEXTO em `--texto`.
 *
 * [30/09] ATE AQUI O ESTADO ERA UMA FAIXA LATERAL DE 4px, e ela saiu com a
 * etapa 0 do redesenho: faixa grossa de cor num lado so e o "callout" de
 * categoria, e o g3ref marca tudo com linha de 1px. Ver a nota em `estilo.ts`.
 *
 * A COR SAIU DO TEXTO DE PROPOSITO, em 30/07. Antes o aviso inteiro era escrito
 * na cor do estado, e a maioria dos avisos deste sistema tem dois paragrafos
 * explicando o que fazer — sao os que dizem "esta lista nao esta vazia, ela e
 * desconhecida". Paragrafo em vermelho e mais dificil de ler que o proprio erro,
 * e ler e o ponto. A cor ficou onde chama atencao sem atravancar: a borda e o
 * icone.
 */
export const Aviso = ({ tipo, children, vivo = true }: {
  tipo: 'erro' | 'ok' | 'alerta'; children: ReactNode;
  /**
   * [01/10/2026, etapa 5] O AVISO E REGIAO VIVA: o erro com `role="alert"`
   * (interrompe — a pessoa precisa saber ja), o sucesso e o alerta com
   * `role="status"` (espera a frase em curso terminar). Ate aqui so o erro
   * falava; «Cobrança emitida» e «Modelo salvo» apareciam na tela e o leitor
   * de tela ficava calado.
   *
   * `vivo={false}` e para quem JA ESTA dentro de uma regiao viva que existe
   * antes do texto (o `RetornoDoAto`): duas regioes aninhadas fariam o leitor
   * anunciar a mesma frase duas vezes.
   */
  vivo?: boolean;
}) => (
  <div className={`aviso ${tipo}`} role={!vivo ? undefined : tipo === 'erro' ? 'alert' : 'status'}>
    <Icone nome={ICONE_DO_AVISO[tipo]} tamanho={18} peso="bold" />
    <div className="corpo">{children}</div>
  </div>
);

/**
 * O RETORNO DE UM ATO QUE DEU CERTO — «Salvo», «Emitida», «Registrado».
 *
 * [01/10/2026, etapa 5] POR QUE UMA CAIXA QUE EXISTE ANTES DO TEXTO. Uma regiao
 * viva so e anunciada com seguranca quando ela JA ESTAVA no documento e o
 * conteudo dela muda; um `role="status"` que nasce junto com a frase (o
 * `{acao.sucesso && <Aviso …>}` de sempre) e anunciado por um leitor de tela e
 * ignorado por outro. Esta caixa fica montada o tempo todo — vazia, ela e
 * recortada para fora do layout (`.regiao-viva:empty`) mas continua na arvore
 * de acessibilidade —, e o aviso entra DENTRO dela.
 */
export const RetornoDoAto = ({ texto }: { texto: ReactNode }) => (
  <div className="regiao-viva" role="status">
    {texto ? <Aviso tipo="ok" vivo={false}>{texto}</Aviso> : null}
  </div>
);

/**
 * O DETALHE TÉCNICO — o que o dev precisa, atrás de um clique.
 *
 * ==========================================================================
 * POR QUE ISTO É UM COMPONENTE E NÃO UMA CONVENÇÃO A SER LEMBRADA
 *
 * A decisão do dono em 21/08/2026 foi **«esconder, não remover»**: os códigos de
 * questão, os nomes de coluna, os comandos em lote e a explicação de engenharia
 * continuam chegando e continuam alcançáveis — só deixam de ser a primeira coisa
 * que alguém lê. A tela de Pendências passou a fazer isso no mesmo dia, e fazia
 * sozinha, com o toggle escrito à mão dentro dela.
 *
 * Uma varredura no dia seguinte mostrou que o RESTO do sistema não tinha feito o
 * mesmo: 23 trechos de jargão em 7 das 12 telas, quase todos dentro de `<Aviso>`.
 * O pior deles em Clientes, onde a única frase acionável — «Digite na coluna
 * Documento» — aparecia depois de três identificadores internos e antes de um
 * comando de terminal. Quem chega amanhã lê aquilo e não sabe o que fazer.
 *
 * Como convenção, cada tela reimplementaria o padrão — ou não o implementaria,
 * que foi exatamente o que aconteceu. Como componente, ele é uma coisa só: a
 * suíte `web/tests/vocabulario-das-telas.ts` RECORTA este bloco antes de procurar
 * jargão, então guardar o código aqui dentro é a forma suportada de mantê-lo, e
 * deixá-lo do lado de fora falha o teste.
 *
 * A REGRA DE USO, em uma linha: se a frase só faz sentido para quem leu o código,
 * ela mora aqui dentro.
 */
export function DetalheTecnico({ children, de }: {
  children: ReactNode;
  /**
   * DE QUE É ESTE DETALHE — «Contrato ativo», «Geração da competência».
   * [01/10/2026, etapa 7a] A tela Mês tinha seis «ver detalhe técnico» na
   * mesma lista, e para o leitor de tela os seis eram o mesmo botão (crítica de
   * 01/10, persona Sam). Com `de`, o nome acessível diz de qual linha ele é —
   * e COMEÇA pelo texto visível, para quem fala com o computador dizer o que lê
   * (`nomeDoDetalhe`).
   */
  de?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {/* Reusa a classe do painel de ajuda de propósito: é o mesmo gesto — «há
          mais, e você decide se quer» — e dois desenhos para um gesto só fariam
          a pessoa aprender duas vezes. */}
      <button type="button" className="ajuda-pergunta" aria-expanded={aberto}
              aria-label={nomeDoDetalhe(aberto, de)}
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 0' }}
              onClick={() => setAberto((x) => !x)}>
        <Icone nome={aberto ? 'subir' : 'descer'} tamanho={11} peso="bold" />
        {aberto ? 'ocultar detalhe técnico' : 'ver detalhe técnico'}
      </button>
      {aberto && (
        <div className="fraco detalhe-tecnico"
             style={{ fontSize: 13, lineHeight: 1.55, paddingLeft: 19, paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </>
  );
}

/** O nome acessível do «ver detalhe técnico» de UMA linha: o texto visível e,
 *  depois dos dois-pontos, de quem ele é. Sem `de`, o nome é o próprio texto
 *  (`undefined` deixa o botão falar por si). */
export function nomeDoDetalhe(aberto: boolean, de?: string): string | undefined {
  const visivel = aberto ? 'ocultar detalhe técnico' : 'ver detalhe técnico';
  return de?.trim() ? `${visivel}: ${de.trim()}` : undefined;
}

/**
 * «MOSTRANDO SÓ: …» — o recorte com que a tela abriu, dito e removível.
 *
 * [01/10/2026, etapa 7a] Toda trava do Mês leva à tela já recortada no que
 * falta (`?pendencia=`). Uma lista curta sem o aviso do recorte é o jeito de
 * «sumir» com um cadastro que está lá — e quem chega de um link não sabe que
 * a lista foi cortada. O chip diz O QUE a lista mostra, na frase de
 * `ROTULO_DO_RECORTE`, e o «x» devolve a lista inteira.
 *
 * TIRAR O RECORTE TIRA DO ENDEREÇO TAMBÉM (`aoRemover` chama
 * `esquecerORecorte`): sem isso, recarregar a página traria de volta o recorte
 * que a pessoa acabou de tirar.
 *
 * O FOCO não cai no nada quando o chip some: vai para `focarDepois` (o campo de
 * busca ou o título da lista), que é por onde a pessoa continua.
 */
export function MostrandoSo(p: { rotulo: string; aoRemover: () => void; focarDepois?: string }) {
  if (!p.rotulo) return null;
  return (
    <p className="mostrando-so">
      <span className="mostrando-so-rot">Mostrando só</span>
      <span className="chip">
        {p.rotulo}
        <button type="button" className="chip-x" title="Mostrar tudo"
                aria-label={`Mostrar tudo — tirar o recorte «${p.rotulo}»`}
                onClick={() => {
                  p.aoRemover();
                  if (p.focarDepois) {
                    requestAnimationFrame(() => document.getElementById(p.focarDepois!)?.focus());
                  }
                }}>
          <Icone nome="fechar" tamanho={13} peso="bold" />
        </button>
      </span>
    </p>
  );
}

// -------------------------------------------------------------- formulario

/** Abre o seletor de data do navegador. `showPicker()` e a unica forma de abrir
 *  o calendario nativo a partir de um botao proprio — sem ela, esconder o
 *  indicador nativo tiraria o calendario da pessoa em vez de embeleza-lo. */
function abrirSeletorDeData(el: HTMLInputElement | null): void {
  if (!el) return;
  const comSeletor = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof comSeletor.showPicker === 'function') {
    // Chrome 99+, Firefox 101+, Safari 16+. Levanta se o gesto nao for do
    // usuario — cair no foco e melhor que estourar no console.
    try { comSeletor.showPicker(); return; } catch { /* cai no foco */ }
  }
  el.focus();
}

/**
 * O campo de data com o calendario do Phosphor dentro, clicavel.
 *
 * `mes` TROCA O TIPO PARA `month`, e nao e detalhe: metade das datas deste
 * sistema e COMPETENCIA, nao dia. Um `type="date"` para competencia pediria um
 * dia que ninguem usa e que o servidor descarta — e a tela ficaria com dois
 * indicadores nativos diferentes de acordo com o campo.
 */
export function CampoData(p: {
  valor: string; ao: (v: string) => void; rotuloAcessivel?: string;
  mes?: boolean; className?: string; style?: CSSProperties;
  /** O `id` do input, para um `<label htmlFor>` de fora apontar para ele. */
  id?: string;
  /**
   * O QUE O CAMPO VAZIO QUER DIZER, escrito no lugar da máscara do navegador.
   * [30/09/2026, etapa 4b] Em Relatórios o mês vazio significa «todos os
   * meses», e a tela mostrava «--------- de ----» — a máscara do Chromium para
   * `type="month"`, que não diz nada a ninguém. Com `vazio`, a frase aparece
   * enquanto o campo está vazio e sem foco; ao focar, a máscara volta, porque é
   * nela que se digita.
   */
  vazio?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const semValor = Boolean(p.vazio) && !p.valor;
  return (
    <div className={`campo-data${semValor ? ' sem-valor' : ''}${p.className ? ` ${p.className}` : ''}`} style={p.style}>
      <input ref={ref} id={p.id} type={p.mes ? 'month' : 'date'} value={p.valor}
             aria-label={p.rotuloAcessivel && semValor ? `${p.rotuloAcessivel} — ${p.vazio}` : p.rotuloAcessivel}
             onChange={(e) => p.ao(e.target.value)} />
      {semValor && <span className="campo-data-vazio" aria-hidden="true">{p.vazio}</span>}
      <button type="button" className="abrir-calendario" tabIndex={-1}
              aria-label="Abrir calendário" onClick={() => abrirSeletorDeData(ref.current)}>
        <Icone nome="calendario" tamanho={15} />
      </button>
    </div>
  );
}

/** O select com a seta do Phosphor. A seta nativa muda de desenho a cada sistema
 *  operacional, e era o que mais denunciava formulario nao estilizado. */
/**
 * A LINHA DE AJUDA DO MES DE REFERENCIA.
 *
 * Decisao do dono em 30/07/2026: *"competência também está pouco claro"*. A
 * escolha foi trocar **so o rotulo na tela** — banco, codigo, rotas e a
 * `PAUTA-contador` mantem `competencia`, que e o termo CONTABIL e e o que o
 * contador usa ("a competencia governa a receita", PAUTA 1).
 *
 * Existe como componente e nao como texto solto em cinco telas porque o
 * argumento contra o rename total foi justamente **nao ter dois vocabularios
 * divergindo**. Se a frase estivesse copiada, ela divergiria entre as telas na
 * primeira vez que alguem a ajustasse.
 */
export const DICA_DO_MES = 'o mês do consumo, não o mês em que a cobrança é paga';

/* [01/10/2026, etapa 8] A FRASE VIROU CONSTANTE quando o seletor do mês de
 * trabalho, na casca, passou a dizê-la também: é a mesma frase, e duas cópias
 * divergiriam na primeira correção — o argumento acima, uma vez mais. As telas
 * do mês não têm mais campo de mês (o mês é um só, no menu); a linha continua
 * ao lado dos campos de data que sobraram, como o de Contas a pagar. */
export const AjudaDoMes = () => (
  <div className="fraco" style={{ fontSize: 13, marginTop: 2 }}>
    {DICA_DO_MES}
  </div>
);

export function Escolha(p: {
  valor: string; ao: (v: string) => void; rotuloAcessivel?: string;
  opcoes: Array<{ valor: string; texto: string }>; primeira?: string;
  desabilitado?: boolean; className?: string;
  /** O `id` do select, para um `<label htmlFor>` de fora apontar para ele. */
  id?: string;
}) {
  return (
    <div className={`campo-caixa${p.className ? ` ${p.className}` : ''}`}>
      <select id={p.id} value={p.valor} aria-label={p.rotuloAcessivel} disabled={p.desabilitado}
              onChange={(e) => p.ao(e.target.value)}>
        {p.primeira !== undefined && <option value="">{p.primeira}</option>}
        {p.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      <span className="adorno"><Icone nome="abrir_menu" tamanho={13} /></span>
    </div>
  );
}

/**
 * O PORQUE AO LADO DO ROTULO, e ele nasce FECHADO.
 *
 * Pedido do dono em 24/08/2026, com a operacao assumindo o sistema. A explicacao
 * ja existia na central de ajuda, e o custo de chegar la era abrir o painel,
 * buscar o assunto e perder o formulario de vista - o suficiente para ninguem
 * fazer, e ai o campo e preenchido no chute.
 *
 * FECHADO POR PADRAO E DELIBERADO. Um formulario de oito campos com oito
 * paragrafos abertos nao e mais explicado: e ilegivel, e a pessoa aprende a
 * pular tudo. Quem ja sabe nao ve nada; quem nao sabe tem a resposta a um clique
 * e sem sair da tela.
 *
 * O TEXTO NAO MORA AQUI. Vem de `porques.ts`, o mesmo que a central de ajuda le -
 * duas copias da mesma frase divergiriam na primeira correcao, e as duas
 * pareceriam certas.
 */
function PorqueDoCampo({ chave, rotulo }: { chave: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const texto = PORQUE[chave];
  if (!texto) return null;
  return (
    <>
      <button type="button" className="campo-porque-botao" aria-expanded={aberto}
              aria-label={`Por que ${rotulo} é pedido`}
              onClick={() => setAberto((v) => !v)}>
        <Icone nome="ajuda" tamanho={13} />
      </button>
      {aberto && <p className="campo-porque">{texto}</p>}
    </>
  );
}

/**
 * O CAMPO COM ROTULO.
 *
 * [01/10/2026, etapa 5] O ROTULO E LIGADO AO CAMPO por `htmlFor` e `id`
 * (`useId`), e nao mais so encostado nele. Ate aqui o `<label>` era um irmao
 * solto: clicar no rotulo nao punha o cursor no campo, e o leitor de tela,
 * entrando no input, ouvia «editar texto» sem nome — o nome so existia para
 * quem ve. O select e a data tambem levam o `id`.
 *
 * O PORQUE SAIU DE DENTRO DO `<label>` pelo mesmo motivo: o nome acessivel de
 * um campo e o TEXTO INTEIRO do rotulo ligado a ele, e com o botao la dentro
 * o campo «Chave Pix» passaria a se chamar «Chave Pix Por que Chave Pix e
 * pedido». Rotulo e botao agora dividem uma linha (`.campo-rotulo`), lado a
 * lado como antes.
 *
 * O TECLADO DO CELULAR sai do rotulo (`tecladoDoCampo`, em `teclado.ts`):
 * valor e percentual abrem o teclado com virgula, o CEP o numerico, o CPF ou
 * CNPJ o de texto em maiuscula (o CNPJ ja tem letra). `teclado` sobrepoe.
 */
export function Campo(p: {
  rotulo: string; valor: string; ao: (v: string) => void;
  tipo?: string; dica?: string; opcoes?: Array<{ valor: string; texto: string }>;
  /** O `id` do assunto da ajuda que explica POR QUE este dado e pedido. O texto
   *  sai de `porques.ts`; escrever a explicacao aqui seria a segunda copia. */
  porqueDe?: string;
  /** O teclado do celular, quando o rotulo nao basta para inferir. */
  teclado?: Teclado;
  /** O campo esta errado: o `aria-invalid` e a frase, ligada por
   *  `aria-describedby`. A frase aparece logo abaixo do campo. */
  erro?: string | null;
  /** Mostra e nao deixa editar (o «Provedor» do conector, que so tem um). */
  somenteLeitura?: boolean;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const teclado = p.teclado ?? tecladoDoCampo(p.rotulo, p.tipo);
  return (
    <div className="campo">
      {p.rotulo && (
        <div className="campo-rotulo">
          <label htmlFor={id}>{p.rotulo}</label>
          {p.porqueDe && <PorqueDoCampo chave={p.porqueDe} rotulo={p.rotulo} />}
        </div>
      )}
      {p.opcoes
        ? <Escolha id={id} valor={p.valor} ao={p.ao} opcoes={p.opcoes} primeira="—" rotuloAcessivel={p.rotulo || undefined} />
        : p.tipo === 'date'
          ? <CampoData id={id} valor={p.valor} ao={p.ao} rotuloAcessivel={p.rotulo || undefined} />
          : <input id={id} type={p.tipo ?? 'text'} value={p.valor} placeholder={p.dica}
                   readOnly={p.somenteLeitura || undefined}
                   {...teclado}
                   aria-invalid={p.erro ? true : undefined}
                   aria-describedby={p.erro ? idErro : undefined}
                   onChange={(e) => p.ao(e.target.value)} />}
      {p.erro && <p className="campo-erro" id={idErro}>{p.erro}</p>}
    </div>
  );
}

/**
 * O INTERRUPTOR, no lugar do checkbox nativo.
 *
 * `role="switch"` com `aria-checked` de verdade: o desenho mudou, a semantica
 * nao. Um `<div>` com aparencia de switch e um controle que existe para quem ve
 * e nao existe para quem usa leitor de tela — e nesta tela os dois interruptores
 * decidem `sandbox` e `ativo` do conector de cobranca, que e onde um clique
 * errado emite cobranca de verdade.
 */
export function Interruptor(p: {
  ligado: boolean; ao: (v: boolean) => void; rotulo: ReactNode;
  /** Obrigatorio na pratica quando `rotulo` e vazio — e o caso da coluna
   *  "Mostrar" da aba Documento, onde o cabecalho da coluna e o unico rotulo
   *  visivel e ele nao chega a leitor de tela linha por linha. */
  rotuloAcessivel?: string;
  desabilitado?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={p.ligado} className="interruptor"
            aria-label={p.rotuloAcessivel}
            disabled={p.desabilitado} onClick={() => p.ao(!p.ligado)}>
      <span className="trilho" aria-hidden="true"><span className="pino" /></span>
      <span>{p.rotulo}</span>
    </button>
  );
}

// --------------------------------------------------------------------- botao

/**
 * O BOTAO SO DE ICONE — o que era um "OK" ao lado do input dentro da tabela.
 *
 * O `rotulo` E OBRIGATORIO no tipo, e nao por formalidade: um botao cujo unico
 * conteudo e um `<svg aria-hidden>` nao tem nome nenhum para leitor de tela, e a
 * tabela de Unidades tem 39 deles. Sem `aria-label` a pessoa ouviria "botao,
 * botao, botao" trinta e nove vezes. O rotulo tambem vira `title`, que e a dica
 * de quem usa mouse e nao adivinha o que o icone faz.
 */
export function BotaoDeIcone(p: {
  icone: NomeDeIcone; rotulo: string; ao: () => void;
  desabilitado?: boolean; primario?: boolean; grande?: boolean;
}) {
  return (
    <button type="button" title={p.rotulo} aria-label={p.rotulo}
            className={`so-icone${p.grande ? ' grande' : ''}${p.primario ? ' primario' : ''}`}
            disabled={p.desabilitado} onClick={p.ao}>
      <Icone nome={p.icone} tamanho={p.grande ? 18 : 16} peso="bold" />
    </button>
  );
}

// ------------------------------------------------------------------- pagina

/**
 * A PAGINA: o titulo, a frase de baixo e — desde 30/09/2026 — o ATO DA TELA ao
 * lado do titulo.
 *
 * `acao` EXISTE PARA O «NOVO …» DOS CADASTROS (etapa 4a). Ate esta data as cinco
 * telas de cadastro abriam com o formulario de criar, vazio, acima da lista — em
 * Clientes, 3 das 40 linhas cabiam acima da dobra. A lista vem primeiro agora, e
 * criar e um botao no alto, no mesmo lugar nas cinco: quem procura «como
 * cadastro» olha para o canto do titulo uma vez e aprende as cinco telas.
 */
export const Pagina = ({ titulo, sub, acao, mes, children }: {
  titulo: string; sub?: string; acao?: ReactNode;
  /**
   * O MÊS QUE A TELA MOSTRA, por extenso («setembro de 2026») — 01/10/2026,
   * etapa 8. O mês de trabalho é escolhido uma vez, no menu, e vale para as
   * telas do mês; quem chega a uma delas por um link precisa saber, sem abrir
   * o menu, em que mês está. O título diz: «Cobranças de setembro de 2026». O
   * nome da tela vem primeiro e intacto — é a palavra do menu (RM13) —, e o
   * mês entra na mesma linha, no mesmo `h1`.
   */
  mes?: string | null;
  children: ReactNode;
}) => {
  const h1 = <h1>{titulo}{mes && <span className="titulo-do-mes"> de {mes}</span>}</h1>;
  return (
    <>
      {acao ? (
        /* O TÍTULO E A FRASE NUMA COLUNA, o ato na outra: no celular o ato desce
           para DEPOIS da frase, e não fica espremido entre o título e ela. */
        <div className="pagina-cab">
          <div className="pagina-cab-texto">
            {h1}
            {sub && <p className="sub">{sub}</p>}
          </div>
          <div className="pagina-acao">{acao}</div>
        </div>
      ) : (
        <>
          {h1}
          {sub && <p className="sub">{sub}</p>}
        </>
      )}
      {children}
    </>
  );
};

/**
 * O BOTAO «NOVO …» — o gatilho do `PainelDeCriar`.
 *
 * NAO E O PRIMARIO DA TELA, de proposito: nas telas de cadastro o trabalho de
 * todo dia e conferir e completar a LISTA (o CPF que falta, o dono da usina), e
 * criar e o caso raro — cliente e unidade chegam do outro sistema sozinhos. O
 * laranja fica com o «Cadastrar» dentro do painel, que e o ato de fato.
 *
 * `controla` e o `id` do painel: `aria-controls` liga os dois para o leitor de
 * tela, e o painel devolve o foco a `<controla>-gatilho` quando fecha.
 */
export function BotaoDeCriar(p: { controla: string; aberto: boolean; ao: () => void; children: ReactNode }) {
  return (
    <button type="button" id={`${p.controla}-gatilho`} aria-expanded={p.aberto} aria-controls={p.controla}
            className={p.aberto ? 'ativo' : undefined} onClick={p.ao}>
      <Icone nome="acrescentar" tamanho={15} peso="bold" /> {p.children}
    </button>
  );
}

/**
 * O PAINEL DE CRIAR, acima da lista — e nao uma gaveta.
 *
 * ==========================================================================
 * POR QUE PAINEL E NAO GAVETA (30/09/2026, etapa 4a)
 *
 * A `GavetaDaConta` da tela Contas de luz e MODAL por um motivo que la existe:
 * conferir uma conta e um subtrabalho com ato proprio, e as acoes da fila atras
 * ficariam cobertas. Cadastrar um cliente, um dono ou uma usina nao tem nada
 * disso: sao dois a cinco campos, e ver a lista enquanto se digita AJUDA (o
 * nome ja existe? a usina ja esta la?). Prender o foco numa gaveta seria
 * interromper sem proteger nada — e o primeiro reflexo que a casa recusa.
 *
 * UM PADRAO SO, NAS CINCO TELAS: o botao no alto, o painel logo abaixo do
 * titulo, o formulario dentro, «Cancelar» e Esc fecham, e o foco anda junto —
 * entra no primeiro campo ao abrir e volta ao «Novo …» ao fechar.
 */
export function PainelDeCriar(p: {
  id: string; titulo: string; aoFechar: () => void; children: ReactNode;
  /**
   * QUEM ABRIU, quando não foi o «Novo …» do alto (01/10/2026, etapa 7a): o
   * «Criar contrato» de uma unidade da lista do que falta. O foco volta a ele
   * ao fechar — e, se ele sumiu junto (a unidade ganhou contrato), ao «Novo …».
   */
  devolverA?: string | null;
}) {
  const caixa = useRef<HTMLElement>(null);
  /* A referencia guarda o `aoFechar` mais novo sem reinstalar o efeito — o mesmo
     cuidado da `GavetaDaConta`: remontar a cada tecla arrancaria o cursor. */
  const fechar = useRef(p.aoFechar);
  fechar.current = p.aoFechar;
  const devolver = useRef(p.devolverA);
  devolver.current = p.devolverA;

  useEffect(() => {
    /* O FOCO ENTRA NO PRIMEIRO CAMPO VAZIO (etapa 7a), e não no primeiro campo:
       aberto de uma unidade, o painel já vem com ela escolhida, e o que falta
       decidir é quem trouxe o cliente. Tudo preenchido, o primeiro. */
    const campos = Array.from(caixa.current?.querySelectorAll<HTMLInputElement>('input, select, textarea') ?? []);
    (campos.find((c) => !c.value) ?? campos[0])?.focus();
    const gatilho = `${p.id}-gatilho`;
    /* Fechou (Cancelar, Esc, ou cadastrou): o foco volta a quem abriu. Sem isto
       ele cairia no `body`, e o proximo Tab recomecaria do topo da pagina. */
    return () => {
      /* SO QUANDO O FOCO SE PERDEU (etapa 7a): fechado pelo «Cancelar», pelo Esc
         ou pelo ato, ele estava dentro do painel e caiu no `body`; fechado pelo
         proprio «Novo …», ele ja esta no gatilho, e move-lo seria tirar a
         pessoa de onde ela acabou de clicar. */
      const agora = document.activeElement;
      if (agora && agora !== document.body) return;
      const origem = devolver.current ? document.getElementById(devolver.current) : null;
      (origem ?? document.getElementById(gatilho))?.focus();
    };
  }, [p.id]);

  return (
    <section id={p.id} ref={caixa} className="cartao secao painel-criar" aria-labelledby={`${p.id}-titulo`}
             onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); fechar.current(); } }}>
      <header className="painel-criar-cab">
        <h2 id={`${p.id}-titulo`}>{p.titulo}</h2>
        <button type="button" className="so-icone" onClick={p.aoFechar}
                title="Fechar (Esc)" aria-label={`Fechar — ${p.titulo}`}>
          <Icone nome="fechar" tamanho={15} peso="bold" />
        </button>
      </header>
      {p.children}
    </section>
  );
}

/**
 * O QUE SE CONFERE DE VEZ EM QUANDO, FECHADO — com o resumo de uma linha a vista.
 *
 * Entrou em 30/09/2026 (etapa 4a) para as duas secoes do pe da tela Mes: o que a
 * leitura do outro sistema achou e o que o sistema fez sozinho. As duas existem
 * para poder ser CONFERIDAS, e nao para serem lidas todo dia — abertas, elas
 * somavam quase uma tela de prosa embaixo do funil.
 *
 * `<details>` NATIVO, e nao um botao com estado: o conteudo continua no HTML
 * (o teste que monta o painel das automacoes segue enxergando as tres linhas),
 * o teclado e o leitor de tela ja sabem abrir e fechar, e nao ha efeito nenhum
 * para dar errado. O RESUMO e a parte que nao pode faltar: fechado, ele e a
 * unica coisa que diz se ha algo la dentro.
 */
export function Recolhido(p: {
  titulo: ReactNode; resumo: ReactNode; icone?: NomeDeIcone; aberto?: boolean; children: ReactNode;
  /**
   * LEMBRAR A ESCOLHA, nesta chave do navegador (01/10/2026, etapa 7c). Sem
   * ela, o recolhido abre como `aberto` manda e esquece o clique ao sair da
   * tela — o certo para o que se confere de vez em quando. Com ela, `aberto` é
   * só o jeito de NASCER, na primeira vez; depois vale o último clique da
   * pessoa, neste computador. Nasceu para o «Como fazer» do funil do mês: quem
   * já sabe fazer fecha uma vez e não lê de novo a cada tela, e quem chega pela
   * primeira vez encontra aberto.
   */
  lembrar?: string;
  /** Uma classe a mais — `leve` tira a superfície, para o recolhido que mora
   *  DENTRO de um cartão (cartão dentro de cartão é o que o g3ref recusa). */
  className?: string;
  /** O título é um `<h2>` — para o recolhido que é SEÇÃO da página e não pode
   *  sumir da lista de títulos do leitor de tela (o «Onde mora o segredo» do
   *  Conector Sicoob, que era um cartão com h2). O `<summary>` aceita um título
   *  dentro, e ele continua sendo o botão que abre. */
  secao?: boolean;
}) {
  const [escolha, setEscolha] = useState<boolean | null>(() => (p.lembrar ? lerEscolhaDoRecolhido(p.lembrar) : null));
  const aberto = escolha ?? p.aberto;
  /* O `toggle` do `<details>` chega também quando o React escreve o `open` do
     primeiro desenho — e aí o estado já é o que o navegador diz, e nada se
     grava. Só a mudança de verdade vira escolha. */
  const aoAlternar = (e: SyntheticEvent<HTMLDetailsElement>) => {
    if (!p.lembrar) return;
    const agora = e.currentTarget.open;
    if (agora === Boolean(aberto)) return;
    setEscolha(agora);
    try { localStorage.setItem(p.lembrar, agora ? '1' : '0'); } catch { /* sem armazenamento, sem memória */ }
  };
  return (
    <details className={p.className ? `recolhido ${p.className}` : 'recolhido'} open={aberto}
             onToggle={p.lembrar ? aoAlternar : undefined}>
      <summary>
        {p.secao ? (
          <h2 className="recolhido-tit">
            {p.icone && <Icone nome={p.icone} tamanho={16} />}
            {p.titulo}
          </h2>
        ) : (
          <span className="recolhido-tit">
            {p.icone && <Icone nome={p.icone} tamanho={16} />}
            {p.titulo}
          </span>
        )}
        <span className="recolhido-resumo">{p.resumo}</span>
        <Icone nome="abrir_menu" tamanho={13} peso="bold" className="recolhido-seta" />
      </summary>
      <div className="recolhido-corpo">{p.children}</div>
    </details>
  );
}

/** A escolha lembrada de um `Recolhido` (`lembrar`): aberto, fechado, ou `null`
 *  — nunca escolheu, ou o navegador não deixa ler (janela anônima com o
 *  armazenamento bloqueado LANÇA ao ler, e a ajuda de um passo não pode
 *  derrubar a tela). */
export function lerEscolhaDoRecolhido(chave: string): boolean | null {
  try {
    const v = localStorage.getItem(chave);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

/**
 * A TABELA DE TELA DE TRABALHO — e, abaixo de 720px de largura DELA, a lista de
 * cartoes.
 *
 * [01/10/2026, etapa 5] O PADRAO DA CASA PASSOU A SER DO COMPONENTE. As etapas
 * 1 e 2 fizeram Contas de luz e Cobrancas virarem cartao no celular, cada uma
 * com o seu CSS; as outras vinte tabelas continuavam rolando para o lado num
 * telefone de 390px — Unidades empurrava a PAGINA inteira 433px para fora, e
 * em Clientes a coluna «Situacao» so aparecia rolando a tabela. Agora toda
 * `Tabela` vira cartao sozinha:
 *
 *   - a medida e a da PROPRIA tabela (`container`), e nao a da janela: com o
 *     menu lateral aberto, ou numa tabela que divide a linha com outra, e a
 *     largura dela que decide;
 *   - cada celula ganha o nome da coluna em `data-rotulo`, tirado do
 *     cabecalho — escrito uma vez so, e nao repetido em cada `<td>` das
 *     vinte tabelas. Quem ja escreve o proprio `data-rotulo` nao e sobrescrito;
 *   - o CSS (`.tabela-cartoes`, em `estilo.ts`) poe a IDENTIFICACAO no alto, a
 *     SITUACAO e o VALOR logo abaixo e a ACAO no pe, na largura toda. As
 *     classes `c-id`, `c-sit`, `c-val` e `c-aco` numa celula dizem qual e qual
 *     quando a ordem das colunas nao diz (em Contas a receber a primeira coluna
 *     e o vencimento, e quem se procura e o cliente).
 *
 * `cartoes={false}` e para as duas tabelas que ja tem cartao proprio, com
 * grade desenhada coluna a coluna (a fila e as registradas de Contas de luz, e
 * a do mes em Cobrancas).
 */
/** `useLayoutEffect` no navegador (o rotulo chega antes da pintura, sem o
 *  cartao piscar sem nome) e `useEffect` no render do teste, onde o primeiro
 *  avisa a cada tabela que nao faz nada no servidor. */
const useEfeitoDeLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const Tabela = ({ cabecalho, children, vazio, cartoes = true }: {
  cabecalho: ReactNode; children: ReactNode; vazio?: ReactNode;
  /** `'estreita'` [01/10/2026, etapa 6]: a tabela curta de resumo, que vira
   *  cartao so abaixo de 440px DE TABELA — numa coluna de meia tela do
   *  computador ela continua tabela.
   *  `'larga'` [01/10/2026, etapa 7a]: a tabela de muitas colunas com o menu
   *  «⋯» na linha (Contratos), que vira cartao abaixo de 860px — a medida de
   *  Cobranças — e por isso nunca precisa rolar para o lado: a rolagem fica
   *  aberta, e o menu da ultima linha nao e cortado por ela. */
  cartoes?: boolean | 'estreita' | 'larga';
}) => {
  const temLinha = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : Boolean(children);
  const caixa = useRef<HTMLDivElement>(null);
  /* O ROTULO DE CADA CELULA, a cada render: linha nova (filtro, pagina, linha
     aberta) nasce sem ele. So escreve onde falta ou mudou — trezentas linhas
     sao trezentas comparacoes de texto, e nenhuma escrita na maioria das vezes. */
  useEfeitoDeLayout(() => {
    if (cartoes && caixa.current) rotularCelulas(caixa.current);
  });
  /* A ORDENACAO DO CARTAO sai do proprio cabecalho: as colunas que ordenam sao
     os `ThOrd` dele. Sem linha nao ha o que ordenar, e o seletor nao aparece. */
  const ordenaveis = temLinha ? colunasOrdenaveis(cabecalho) : null;
  const seletor = ordenaveis && <OrdenarPor {...ordenaveis} />;
  const corpo = (
    <div className="rolagem">
      {temLinha
        ? <table><thead><tr>{cabecalho}</tr></thead><tbody>{children}</tbody></table>
        : <div className="vazio">{vazio ?? 'Nada aqui ainda.'}</div>}
    </div>
  );
  return cartoes
    ? <div className={typeof cartoes === 'string' ? `tabela-cartoes ${cartoes}` : 'tabela-cartoes'} ref={caixa}>{seletor}{corpo}</div>
    : <>{seletor}{corpo}</>;
};

/**
 * Escreve `data-rotulo` em cada `<td>` com o texto do `<th>` da mesma coluna.
 * Exportada para quem monta `<table>` a mao dentro de `.tabela-cartoes`.
 *
 * O texto do cabecalho e o VISIVEL: o que esta em `.so-leitor` («Ações»,
 * «Detalhe») e para o leitor de tela, e no cartao a coluna de botoes nao
 * precisa de rotulo — o botao diz o que faz. Celula que atravessa colunas
 * (`colSpan`, a linha de detalhe e a pergunta na linha) nao ganha rotulo.
 */
export function rotularCelulas(raiz: HTMLElement): void {
  const tabela = raiz.querySelector('table');
  if (!tabela) return;
  const nomes: string[] = [];
  for (const th of Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead tr:first-child > th'))) {
    let texto = '';
    for (const no of Array.from(th.childNodes)) {
      if (no instanceof HTMLElement && no.classList.contains('so-leitor')) continue;
      texto += no.textContent ?? '';
    }
    texto = texto.replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (th.colSpan || 1); i++) nomes.push(texto);
  }
  for (const tr of Array.from(tabela.querySelectorAll<HTMLTableRowElement>('tbody > tr'))) {
    let coluna = 0;
    for (const td of Array.from(tr.cells)) {
      const largura = td.colSpan || 1;
      /* Rotulo que nao veio daqui (`data-rotulo-auto` ausente) foi escrito no
         JSX, por quem conhece a coluna melhor que o cabecalho: ele manda. */
      const proprio = td.hasAttribute('data-rotulo') && !td.hasAttribute('data-rotulo-auto');
      const nome = nomes[coluna] ?? '';
      if (largura === 1 && !proprio && td.getAttribute('data-rotulo') !== nome) {
        td.setAttribute('data-rotulo', nome);
        td.setAttribute('data-rotulo-auto', '');
      }
      coluna += largura;
    }
  }
}

export const linha: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };

// ------------------------------------------------------------- estado visivel

/** Valor de dominio -> rotulo legivel: "nao_medido" -> "Não medido". O valor no
 *  banco continua minusculo com underscore; so a EXIBICAO capitaliza. */
export function rotulo(s: string): string {
  const texto = s.replace(/_/g, ' ').replace('nao ', 'não ');
  if (texto === 'ok') return 'OK';
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * A PILULA DE ESTADO. Preenchida suave, com icone E texto dentro.
 *
 * [30/09, etapa 4a] OS TONS SAO CINCO E TEM NOME DE SIGNIFICADO (`TomDoSelo`):
 * `erro` e o unico vermelho, e so a falha o usa; lacuna de cadastro e `a_fazer`
 * (ambar, com o lapis). A regra inteira esta em `iconografia.ts`.
 *
 * OS TRES SINAIS SAO DELIBERADOS e atendem a restricao 3 do tema (cor nao pode
 * ser o unico sinal): a cor do fundo, o desenho do icone e a palavra. Tirar
 * qualquer um deles deixa alguem sem a informacao — daltonico perde a cor, quem
 * usa leitor de tela perde o icone, e quem le rapido pega o icone antes da
 * palavra.
 *
 * ATE 29/07 ELA ERA CONTORNADA, e a troca esta registrada na nota de adjacencia
 * do `tema.ts`: a separacao entre estado e acento passou a ser de PESO — o
 * acento e preenchido solido, o estado e preenchido suave.
 */
export const Marca = ({ selo, children }: {
  /**
   * [01/10/2026, etapa 7b] O SELO INTEIRO, e não mais `tom` e `icone` soltos.
   * Até aqui cada tela escolhia a cor do seu selo, e a crítica de 01/10 achou a
   * mesma recusa do banco vermelha numa tela, âmbar noutra e cinza numa
   * terceira. Agora a cor e o desenho de cada estado vêm de `tom-do-estado.ts`
   * — e só de lá: um `tom=` aqui não compila, e um `selo={{ … }}` escrito à mão
   * é recusado pela suíte `web/tests/tom-do-estado.ts`.
   */
  selo: Selo;
  children: ReactNode;
}) => (
  <span className={`marca ${selo.tom}`}>
    <Icone nome={selo.icone} tamanho={12} peso="bold" />
    {children}
  </span>
);

/**
 * O INDICADOR DE CARGA: a engrenagem girando com o sol da G3 parado no centro.
 *
 * O TEXTO AO LADO NAO E ENFEITE. Sob `prefers-reduced-motion` a engrenagem para
 * de girar — e ai o unico sinal de "estou trabalhando" e a frase. Um spinner sem
 * legenda seria informacao que desaparece para quem pediu menos movimento.
 */
export const Carregando = ({ texto = 'Carregando…' }: { texto?: string }) => (
  <div className="carregando" role="status">
    <span className="marca-girando" aria-hidden="true">
      <Icone nome="engrenagem" tamanho={26} peso="duotone" />
      <Logotipo tamanho={12} />
    </span>
    {texto}
  </div>
);

// ------------------------------------------------------- cartao de metrica

/**
 * O CARTAO DE METRICA. Borda de 1px, canto reto, o numero na condensada — e o
 * icone PEQUENO, ao lado do nome.
 *
 * [30/09, etapa 4a] A MARCA D'AGUA SAIU. Era o icone a 44px, em `--acento`, a
 * 11% de opacidade no canto do cartao — o pedido de 30/07 para a marca ganhar
 * presenca. Numa tela de trabalho ela era ruido: quatro desenhos grandes e
 * apagados competindo com os quatro numeros que a pessoa veio ler. O icone
 * ficou, a 14px e na cor do rotulo, onde ele ajuda a achar o cartao sem pesar.
 *
 * `KpiSimNao` saiu no mesmo dia: os tres cartoes «Pode faturar / emitir boleto /
 * repartir» da tela Mes repetiam, em sim e nao, a linha de cadastro do funil logo
 * acima — e eram os unicos que o usavam.
 *
 * [30/09] A SOMBRA DO SEGUNDO DEGRAU SAIU com a etapa 0: no g3ref nada
 * flutua, e o KPI e um cartao como os outros.
 */
export function Kpi(p: {
  nome: ReactNode; valor: ReactNode; icone?: NomeDeIcone; tom?: 'ok' | 'erro' | 'alerta';
}) {
  const cor = p.tom === 'ok' ? 'var(--ok)' : p.tom === 'erro' ? 'var(--erro)' : p.tom === 'alerta' ? 'var(--alerta)' : undefined;
  return (
    <div className="kpi">
      <div className="nome">
        {p.icone && <Icone nome={p.icone} tamanho={14} />}
        {p.nome}
      </div>
      <div className="valor" style={cor ? { color: cor } : undefined}>{p.valor}</div>
    </div>
  );
}

// ----------------------------------------------------------------- ordenacao
//
// ORDENACAO E DO CLIENTE, e isso e decisao e nao preguica: as listas chegam
// inteiras (o maior universo real e ~500 linhas por `limite`), entao ordenar e
// filtrar aqui evita uma ida ao servidor por clique — e o servidor nem oferece
// `order by` nas rotas de listagem.

export type Ordem = { chave: string; desc: boolean };

export function useOrdenacao(padrao: string): { ordem: Ordem; alternar: (chave: string) => void } {
  const [ordem, setOrdem] = useState<Ordem>({ chave: padrao, desc: false });
  return {
    ordem,
    alternar: (chave) => setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: false })),
  };
}

/** Ordena uma copia. Nulo vai para o FIM nas duas direcoes: "sem vencimento"
 *  no topo de uma lista ordenada por vencimento esconderia justamente as datas. */
export function ordenar<T>(
  lista: T[], ordem: Ordem,
  chaves: Record<string, (t: T) => string | number | boolean | null | undefined>,
): T[] {
  const f = chaves[ordem.chave];
  if (!f) return lista;
  return [...lista].sort((a, b) => {
    const va = f(a), vb = f(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return ordem.desc ? -r : r;
  });
}

/**
 * AS DUAS DIREÇÕES DITAS COMO ORDEM (01/10/2026, etapa 7c), para a coluna de
 * estado — «Situação (crescente)» não diz o que vem primeiro. A chave da coluna
 * tem de ser o peso do tom (`pesoDoSelo`), ou a ordem dita na opção mentiria.
 */
export const DIRECOES_DA_SITUACAO = ['o que precisa de você primeiro', 'o que já fechou primeiro'] as const;
/** As do cadastro que só é ativo ou inativo (a chave põe o ativo antes). */
export const DIRECOES_DO_ATIVO = ['ativos primeiro', 'inativos primeiro'] as const;

export function ThOrd(p: {
  chave: string; ordem: Ordem; ao: (chave: string) => void;
  num?: boolean; children: ReactNode;
  /** O nome das duas direções no «Ordenar por» do cartão — crescente e
   *  decrescente, nessa ordem. Sem ele, «(crescente)» e «(decrescente)». */
  direcoes?: readonly [string, string];
}) {
  const ativa = p.ordem.chave === p.chave;
  return (
    <th className={p.num ? 'num' : undefined}
        aria-sort={ativa ? (p.ordem.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="ordenar" onClick={() => p.ao(p.chave)}>
        {p.children}
        <Icone tamanho={11} peso="bold"
               nome={ativa ? (p.ordem.desc ? 'ordem_decrescente' : 'ordem_crescente') : 'ordem_nenhuma'} />
      </button>
    </th>
  );
}

/**
 * «ORDENAR POR» NO CARTAO — UMA escolha, e nao uma fileira de botoes.
 *
 * [01/10/2026, etapa 6] Na etapa 5 o cabecalho que ordena virava, no cartao,
 * uma fileira de botoes de 44px: Contas a pagar empilhava tres fileiras, e a
 * lista comecava abaixo da metade da primeira tela de um telefone. Agora e um
 * `<select>` com nome («Ordenar por»), e cada opcao diz a coluna E a direcao:
 * a escolha que o computador faz em dois cliques na seta vira uma so, no
 * seletor que o telefone ja sabe abrir — e o leitor de tela anuncia o nome, o
 * valor e a lista.
 *
 * A DIRECAO E «crescente» E «decrescente» em toda coluna, e nao «de A a Z» ou
 * «mais antigo primeiro»: varias colunas ordenam por uma CHAVE que nao e o
 * texto que se ve, e uma palavra que descreve o texto mentiria nelas. E e o
 * mesmo nome da seta do computador (`ordem_crescente`).
 *
 * [01/10/2026, etapa 7c] MENOS NA COLUNA DE ESTADO, que diz a ordem com
 * palavras («Situação: o que precisa de você primeiro» / «… o que já fechou
 * primeiro»): «Situação (crescente)» nao dizia nada a ninguem. A coluna passa
 * `direcoes`, e a chave dela e o peso do tom (`pesoDoSelo`), para a palavra e a
 * ordem serem a mesma coisa.
 *
 * NAO HA UM SEGUNDO ESTADO: a escolha chama o MESMO `ao` dos cabecalhos, com o
 * contrato de `useOrdenacao().alternar` — coluna nova comeca crescente, a
 * mesma coluna inverte. Para cair em «decrescente» numa coluna nova, chama
 * duas vezes; as duas atualizacoes sao funcionais e se aplicam em ordem.
 *
 * Aparece so quando a tabela e cartao (o CSS de `.tabela-cartoes` e o de
 * Cobrancas, `.em-tabela`, o mostram); na tabela, a ordem continua na seta do
 * cabecalho.
 */
export type ColunaOrdenavel = { chave: string; texto: string; direcoes?: readonly [string, string] };

/** O texto visivel de um no (o nome de uma coluna ordenavel). */
function textoDoNo(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textoDoNo).join('');
  if (isValidElement(n)) return textoDoNo((n.props as { children?: ReactNode }).children);
  return '';
}

/** Os `ThOrd` de um cabecalho, na ordem em que aparecem — com o `ordem` e o `ao`
 *  que eles dividem. `null` quando nenhuma coluna ordena. */
export function colunasOrdenaveis(cabecalho: ReactNode): {
  colunas: ColunaOrdenavel[]; ordem: Ordem; ao: (chave: string) => void;
} | null {
  const colunas: ColunaOrdenavel[] = [];
  let ordem: Ordem | null = null;
  let ao: ((chave: string) => void) | null = null;
  const visitar = (no: ReactNode): void => {
    Children.forEach(no, (filho) => {
      if (!isValidElement(filho)) return;
      if (filho.type === ThOrd) {
        const p = filho.props as Parameters<typeof ThOrd>[0];
        colunas.push({ chave: p.chave, texto: textoDoNo(p.children).replace(/\s+/g, ' ').trim(), direcoes: p.direcoes });
        ordem = p.ordem; ao = p.ao;
      } else if (filho.type === Fragment) {
        visitar((filho.props as { children?: ReactNode }).children);
      }
    });
  };
  visitar(cabecalho);
  return colunas.length && ordem && ao ? { colunas, ordem, ao } : null;
}

/** O texto de uma opção do «Ordenar por»: «Vencimento (crescente)», ou, na
 *  coluna que diz a ordem, «Situação: o que precisa de você primeiro». */
export function rotuloDaDirecao(c: ColunaOrdenavel, desc: boolean): string {
  if (c.direcoes) return `${c.texto}: ${c.direcoes[desc ? 1 : 0]}`;
  return `${c.texto} (${desc ? 'decrescente' : 'crescente'})`;
}

export function OrdenarPor(p: { colunas: ColunaOrdenavel[]; ordem: Ordem; ao: (chave: string) => void }) {
  const id = useId();
  const valor = `${p.ordem.chave}:${p.ordem.desc ? 'desc' : 'asc'}`;
  const escolher = (v: string): void => {
    const i = v.lastIndexOf(':');
    const chave = v.slice(0, i);
    const desc = v.slice(i + 1) === 'desc';
    if (chave !== p.ordem.chave) {
      p.ao(chave);
      if (desc) p.ao(chave);
    } else if (desc !== p.ordem.desc) {
      p.ao(chave);
    }
  };
  return (
    <div className="ordenar-por">
      <label htmlFor={id}>Ordenar por</label>
      <div className="campo-caixa">
        <select id={id} value={valor} onChange={(e) => escolher(e.target.value)}>
          {p.colunas.flatMap((c) => [
            <option key={`${c.chave}:asc`} value={`${c.chave}:asc`}>{rotuloDaDirecao(c, false)}</option>,
            <option key={`${c.chave}:desc`} value={`${c.chave}:desc`}>{rotuloDaDirecao(c, true)}</option>,
          ])}
        </select>
        <span className="adorno"><Icone nome="abrir_menu" tamanho={13} /></span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- busca e filtro

/** Normaliza para busca: minusculo e sem acento, dos dois lados. Quem digita
 *  "joao" precisa achar "João". */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export const contem = (alvo: string | null | undefined, busca: string): boolean =>
  !busca || (alvo != null && normalizar(alvo).includes(normalizar(busca)));

export function Busca(p: { valor: string; ao: (v: string) => void; dica?: string;
  /** O `id` do campo — para o foco voltar a ele quando um recorte sai
   *  (`MostrandoSo`, etapa 7a). */
  id?: string;
}) {
  return (
    <div className="busca">
      {/* O input vem ANTES do icone no DOM de proposito: e o que permite
          `input:focus + .adorno-esquerda` acender a lupa junto com o foco. */}
      <input id={p.id} type="search" value={p.valor} placeholder={p.dica ?? 'Buscar…'}
             aria-label={p.dica ?? 'Buscar'} onChange={(e) => p.ao(e.target.value)} />
      <span className="adorno-esquerda"><Icone nome="buscar" tamanho={15} peso="bold" /></span>
    </div>
  );
}

/** O filtro da barra de ferramentas: um `Escolha` com rotulo acessivel e sem
 *  `<label>` visivel, porque a primeira opcao ja diz o que ele filtra
 *  ("Todas as situações"). */
export const Filtro = (p: {
  valor: string; ao: (v: string) => void; rotulo: string;
  opcoes: Array<{ valor: string; texto: string }>;
}) => <Escolha valor={p.valor} ao={p.ao} rotuloAcessivel={p.rotulo} opcoes={p.opcoes} />;

/** A barra acima da tabela: busca e filtros a esquerda, a contagem a direita.
 *  A contagem "N de M" e o que diz que um filtro esta ATIVO — lista curta sem
 *  aviso de filtro e o jeito de "sumir" um cadastro que esta la. */
export const Ferramentas = ({ children, contagem }: { children: ReactNode; contagem?: string }) => (
  <div className="ferramentas">
    {children}
    {contagem && <span className="contagem">{contagem}</span>}
  </div>
);

// ------------------------------------------------------- o foco preso
/**
 * O QUE RECEBE TAB DENTRO DE UMA CAIXA, na ordem do documento e so o que esta
 * desenhado. [01/10/2026, etapa 5] Saiu do `menu-lateral.tsx` quando a central
 * de ajuda passou a prender o foco tambem: dois paineis com `aria-modal`, uma
 * regra so do que conta como focavel.
 */
export const focaveis = (raiz: HTMLElement): HTMLElement[] =>
  Array.from(raiz.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  )).filter((el) => el.getClientRects().length > 0);

// ------------------------------------------------------------------- o menu

/**
 * O MENU SUSPENSO. Fecha por clique fora, por `Escape` e por escolher um item.
 *
 * OS TRES CAMINHOS DE FECHAR SAO O MINIMO, e o que faltar deles vira o menu que
 * gruda na tela: sem clique fora a pessoa precisa achar o gatilho de novo, sem
 * `Escape` quem usa teclado fica preso, e sem fechar ao escolher o menu tapa o
 * efeito da propria escolha.
 *
 * [30/09, etapa 2] O TECLADO ANDA DENTRO DELE. A critica de 30/09 mediu o que
 * faltava para quem nao usa mouse: o menu abria e o foco ficava no gatilho, as
 * setas nao faziam nada e o `Escape` fechava deixando o foco solto. Agora e o
 * padrao de menu da WAI-ARIA, o mesmo que o seletor de setor ja fazia:
 *
 *   - abrir leva o foco ao primeiro item (ou ao marcado, num grupo de radio);
 *   - seta para baixo/para cima anda e da a volta; Home e End vao as pontas;
 *   - seta para baixo no gatilho FECHADO abre;
 *   - `Escape` fecha e DEVOLVE o foco ao gatilho; Tab para fora fecha.
 *
 * Os itens sao os `button` com `role` de item de menu dentro do painel — quem
 * monta o menu ja os escrevia assim.
 *
 * `soIcone` e para o menu de uma LINHA de tabela («mais acoes»): o gatilho vira
 * o quadrado de 30px do `BotaoDeIcone`, e o `rotulo` e o nome dele para o leitor
 * de tela e para o `title`.
 *
 * [30/09, etapa 4a] OS MODOS `lugares` E `fixo` SAIRAM. Existiam para o menu
 * «Cadastros ▾» da barra do topo (etapa 3), que a etapa 3b trocou pelo menu
 * lateral no mesmo dia — e nada mais os usava. Um modo sem chamador e codigo
 * que ninguem testa e todo mundo le. Sairam junto `classeDoGatilho` e
 * `rotuloDoPainel`, que so aquele menu passava.
 *
 * `acima` (30/09/2026, etapa 3b): O PAINEL ABRE PARA CIMA. O menu da conta
 * desceu da barra do topo para o PE do menu lateral, e abrindo para baixo ele
 * nasceria fora da janela. A seta do gatilho vira para cima junto (no CSS), para
 * o desenho dizer para que lado a lista vai sair.
 */
export function Menu(p: {
  gatilho: ReactNode; rotulo: string; children: ReactNode;
  soIcone?: boolean; className?: string;
  /** O painel abre para CIMA do gatilho — para menu que mora no pe da janela. */
  acima?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  const SELETOR = '.menu-painel [role="menuitem"]:not(:disabled), .menu-painel [role="menuitemradio"]:not(:disabled)';
  const itens = (): HTMLElement[] => Array.from(caixa.current?.querySelectorAll<HTMLElement>(SELETOR) ?? []);

  const fechar = (devolverFoco: boolean) => {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  };

  const abrir = () => setAberto(true);

  useEffect(() => {
    if (!aberto) return;
    const lista = itens();
    (lista.find((b) => b.getAttribute('aria-checked') === 'true' || b.hasAttribute('aria-current')) ?? lista[0])?.focus();
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(true); };
    addEventListener('mousedown', fora);
    addEventListener('keydown', tecla);
    return () => { removeEventListener('mousedown', fora); removeEventListener('keydown', tecla); };
  }, [aberto]);

  const aoTeclar = (e: EventoDeTecla<HTMLDivElement>) => {
    const lista = itens();
    if (lista.length === 0) return;
    const i = lista.indexOf(document.activeElement as HTMLElement);
    const ir = (j: number) => { e.preventDefault(); lista[(j + lista.length) % lista.length]?.focus(); };
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i < 0 ? lista.length - 1 : i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(lista.length - 1);
  };

  const classeDoBotao = p.soIcone ? 'so-icone' : undefined;

  return (
    <div className={`menu${p.acima ? ' menu-acima' : ''}${p.className ? ` ${p.className}` : ''}`} ref={caixa}
         onBlur={(e) => {
           /* O foco saiu da caixa (Tab depois do ultimo item): fecha. So com
              destino, pelo mesmo motivo escrito no seletor de setor. */
           if (aberto && e.relatedTarget && !caixa.current?.contains(e.relatedTarget as Node)) setAberto(false);
         }}>
      <button ref={botao} type="button"
              aria-haspopup="menu" aria-expanded={aberto}
              aria-label={p.rotulo}
              title={p.soIcone ? p.rotulo : undefined}
              className={classeDoBotao}
              onClick={() => (aberto ? setAberto(false) : abrir())}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); abrir(); }
              }}>
        {p.gatilho}
        {!p.soIcone && <Icone nome="abrir_menu" tamanho={12} peso="bold" className="menu-seta" />}
      </button>
      {aberto && (
        <div className="menu-painel" role="menu" aria-label={p.rotulo}
             onKeyDown={aoTeclar}
             onClick={(e) => {
               /* Escolher fecha. O foco volta ao gatilho so se o item nao o
                  levou para outro lugar (uma confirmacao que se abre, por ex.). */
               if ((e.target as Element).closest('[role^="menuitem"]')) {
                 setAberto(false);
                 requestAnimationFrame(() => {
                   if (!document.activeElement || document.activeElement === document.body) botao.current?.focus();
                 });
               }
             }}>
          {p.children}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- o tema

const NOME_DO_MODO: Record<ModoTema, { texto: string; icone: NomeDeIcone }> = {
  claro: { texto: 'Tema claro', icone: 'tema_claro' },
  escuro: { texto: 'Tema escuro', icone: 'tema_escuro' },
  sistema: { texto: 'Tema do sistema', icone: 'tema_sistema' },
};

/** O seletor de tema virou item de menu em 30/07: era um `<select>` na barra, e
 *  um select de tres opcoes ao lado do nome da pessoa e do botao de sair
 *  competia por atencao com a navegacao. */
export function ItensDeTema() {
  const [modo, setModo] = useState<ModoTema>(() => lerModo());
  const escolher = (m: ModoTema) => { aplicarModo(m); setModo(m); };
  return (
    <>
      <div className="titulo">Aparência</div>
      {(Object.keys(NOME_DO_MODO) as ModoTema[]).map((m) => (
        <button key={m} type="button" role="menuitemradio" aria-checked={modo === m}
                onClick={() => escolher(m)}>
          <Icone nome={NOME_DO_MODO[m].icone} tamanho={16} />
          {NOME_DO_MODO[m].texto}
          {modo === m && <Icone nome="ok" tamanho={13} peso="bold" className="ao-fim" />}
        </button>
      ))}
    </>
  );
}
