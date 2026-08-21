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
// `Menu` (a area do usuario), `Kpi`/`KpiSimNao` (o cartao flutuante) e
// `Carregando` (a engrenagem com o sol da G3).

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { lerModo, aplicarModo, type ModoTema } from './tema.ts';
import { Icone, Logotipo } from './icones.tsx';
import { ICONE_DO_ESTADO, ICONE_DO_AVISO, type NomeDeIcone } from './iconografia.ts';

export { Icone, Logotipo };
export { ESTILO } from './estilo.ts';

// ------------------------------------------------------------------- avisos

/**
 * O AVISO. Faixa lateral de 4px na cor do estado, icone na mesma cor, e o TEXTO
 * em `--texto`.
 *
 * A COR SAIU DO TEXTO DE PROPOSITO, em 30/07. Antes o aviso inteiro era escrito
 * na cor do estado, e a maioria dos avisos deste sistema tem dois paragrafos
 * explicando o que fazer — sao os que dizem "esta lista nao esta vazia, ela e
 * desconhecida". Paragrafo em vermelho e mais dificil de ler que o proprio erro,
 * e ler e o ponto. A cor ficou onde chama atencao sem atravancar: a borda e o
 * icone.
 */
export const Aviso = ({ tipo, children }: { tipo: 'erro' | 'ok' | 'alerta'; children: ReactNode }) => (
  <div className={`aviso ${tipo}`} role={tipo === 'erro' ? 'alert' : undefined}>
    <Icone nome={ICONE_DO_AVISO[tipo]} tamanho={18} peso="bold" />
    <div className="corpo">{children}</div>
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
export function DetalheTecnico({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {/* Reusa a classe do painel de ajuda de propósito: é o mesmo gesto — «há
          mais, e você decide se quer» — e dois desenhos para um gesto só fariam
          a pessoa aprender duas vezes. */}
      <button type="button" className="ajuda-pergunta" aria-expanded={aberto}
              style={{ fontSize: 12, fontWeight: 500, padding: '6px 0' }}
              onClick={() => setAberto((x) => !x)}>
        <Icone nome={aberto ? 'subir' : 'descer'} tamanho={11} peso="bold" />
        {aberto ? 'ocultar detalhe técnico' : 'ver detalhe técnico'}
      </button>
      {aberto && (
        <div className="fraco detalhe-tecnico"
             style={{ fontSize: 12, lineHeight: 1.55, paddingLeft: 19, paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </>
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
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={`campo-data${p.className ? ` ${p.className}` : ''}`} style={p.style}>
      <input ref={ref} type={p.mes ? 'month' : 'date'} value={p.valor} aria-label={p.rotuloAcessivel}
             onChange={(e) => p.ao(e.target.value)} />
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
export const AjudaDoMes = () => (
  <div className="fraco" style={{ fontSize: 12, marginTop: 2 }}>
    o mês do consumo, não o mês em que a fatura é paga
  </div>
);

export function Escolha(p: {
  valor: string; ao: (v: string) => void; rotuloAcessivel?: string;
  opcoes: Array<{ valor: string; texto: string }>; primeira?: string;
  desabilitado?: boolean; className?: string;
}) {
  return (
    <div className={`campo-caixa${p.className ? ` ${p.className}` : ''}`}>
      <select value={p.valor} aria-label={p.rotuloAcessivel} disabled={p.desabilitado}
              onChange={(e) => p.ao(e.target.value)}>
        {p.primeira !== undefined && <option value="">{p.primeira}</option>}
        {p.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      <span className="adorno"><Icone nome="abrir_menu" tamanho={13} /></span>
    </div>
  );
}

export function Campo(p: {
  rotulo: string; valor: string; ao: (v: string) => void;
  tipo?: string; dica?: string; opcoes?: Array<{ valor: string; texto: string }>;
}) {
  return (
    <div>
      <label>{p.rotulo}</label>
      {p.opcoes
        ? <Escolha valor={p.valor} ao={p.ao} opcoes={p.opcoes} primeira="—" rotuloAcessivel={p.rotulo} />
        : p.tipo === 'date'
          ? <CampoData valor={p.valor} ao={p.ao} rotuloAcessivel={p.rotulo} />
          : <input type={p.tipo ?? 'text'} value={p.valor} placeholder={p.dica}
                   onChange={(e) => p.ao(e.target.value)} />}
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

export const Pagina = ({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) => (
  <>
    <h1>{titulo}</h1>
    {sub && <p className="sub">{sub}</p>}
    {children}
  </>
);

export const Tabela = ({ cabecalho, children, vazio }: {
  cabecalho: ReactNode; children: ReactNode; vazio?: ReactNode;
}) => {
  const temLinha = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : Boolean(children);
  return (
    <div className="rolagem">
      {temLinha
        ? <table><thead><tr>{cabecalho}</tr></thead><tbody>{children}</tbody></table>
        : <div className="vazio">{vazio ?? 'Nada aqui ainda.'}</div>}
    </div>
  );
};

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
export const Marca = ({ tom, icone, children }: {
  tom: 'ok' | 'pendente' | 'nao_medido';
  /** Sobrepõe o ícone do TOM pelo ícone do SIGNIFICADO. Existe porque a fatura
   *  tem seis status mapeados em três tons: "Emitida" é tom `nao_medido` e
   *  exibiria a interrogação de "não sei", que é o certo para uma camada não
   *  medida e o errado para uma fatura emitida. Ver
   *  `ICONE_DO_STATUS_DA_FATURA`. */
  icone?: NomeDeIcone;
  children: ReactNode;
}) => (
  <span className={`marca ${tom}`}>
    <Icone nome={icone ?? ICONE_DO_ESTADO[tom]} tamanho={12} peso="bold" />
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
 * O CARTAO DE METRICA. Borda de 1px, sombra do segundo degrau e o icone como
 * MARCA D'AGUA — grande, em `--acento`, a 11% de opacidade.
 *
 * A BORDA ESQUERDA DE 3px SAIU. Ela era o sinal de marca do cartao ate 29/07, e
 * o pedido de 30/07 foi exatamente trocar "borda generica grossa" por "borda
 * finissima mais sombra, para o cartao flutuar". A presenca da marca nao se
 * perdeu — mudou de lugar, e ficou maior.
 */
export function Kpi(p: {
  nome: ReactNode; valor: ReactNode; icone: NomeDeIcone; tom?: 'ok' | 'erro' | 'alerta';
}) {
  const cor = p.tom === 'ok' ? 'var(--ok)' : p.tom === 'erro' ? 'var(--erro)' : p.tom === 'alerta' ? 'var(--alerta)' : undefined;
  return (
    <div className="kpi">
      <div className="nome">{p.nome}</div>
      <div className="valor" style={cor ? { color: cor } : undefined}>{p.valor}</div>
      <span className="marca-dagua"><Icone nome={p.icone} tamanho={44} peso="duotone" /></span>
    </div>
  );
}

/**
 * O CARTAO DE SIM OU NAO — "pode faturar" e "pode repartir".
 *
 * A PALAVRA CONTINUA ESCRITA ao lado do icone grande, e isso e a restricao 3 de
 * novo: `pode_faturar` e a resposta de maior consequencia da tela, e ela nao pode
 * depender de reconhecer um desenho verde. O icone entra desenhando-se uma vez —
 * e o unico movimento desta tela, para o olho ir nele primeiro.
 */
export function KpiSimNao(p: { nome: ReactNode; sim: boolean; icone: NomeDeIcone }) {
  return (
    <div className="kpi">
      <div className="nome">{p.nome}</div>
      <div className="valor sim-nao" style={{ color: p.sim ? 'var(--ok)' : 'var(--erro)' }}>
        <Icone nome={p.sim ? 'sim' : 'nao'} tamanho={26} peso="fill" />
        {p.sim ? 'Sim' : 'Não'}
      </div>
      <span className="marca-dagua"><Icone nome={p.icone} tamanho={44} peso="duotone" /></span>
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

export function ThOrd(p: {
  chave: string; ordem: Ordem; ao: (chave: string) => void;
  num?: boolean; children: ReactNode;
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

// -------------------------------------------------------------- busca e filtro

/** Normaliza para busca: minusculo e sem acento, dos dois lados. Quem digita
 *  "joao" precisa achar "João". */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export const contem = (alvo: string | null | undefined, busca: string): boolean =>
  !busca || (alvo != null && normalizar(alvo).includes(normalizar(busca)));

export function Busca(p: { valor: string; ao: (v: string) => void; dica?: string }) {
  return (
    <div className="busca">
      {/* O input vem ANTES do icone no DOM de proposito: e o que permite
          `input:focus + .adorno-esquerda` acender a lupa junto com o foco. */}
      <input type="search" value={p.valor} placeholder={p.dica ?? 'Buscar…'}
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

// ------------------------------------------------------------------- o menu

/**
 * O MENU SUSPENSO. Fecha por clique fora, por `Escape` e por escolher um item.
 *
 * OS TRES CAMINHOS DE FECHAR SAO O MINIMO, e o que faltar deles vira o menu que
 * gruda na tela: sem clique fora a pessoa precisa achar o gatilho de novo, sem
 * `Escape` quem usa teclado fica preso, e sem fechar ao escolher o menu tapa o
 * efeito da propria escolha.
 */
export function Menu(p: { gatilho: ReactNode; rotulo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    addEventListener('mousedown', fora);
    addEventListener('keydown', tecla);
    return () => { removeEventListener('mousedown', fora); removeEventListener('keydown', tecla); };
  }, [aberto]);

  return (
    <div className="menu" ref={caixa}>
      <button type="button" aria-haspopup="menu" aria-expanded={aberto} aria-label={p.rotulo}
              onClick={() => setAberto((v) => !v)}>
        {p.gatilho}
        <Icone nome="abrir_menu" tamanho={12} peso="bold" />
      </button>
      {aberto && (
        <div className="menu-painel" role="menu" onClick={() => setAberto(false)}>
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
