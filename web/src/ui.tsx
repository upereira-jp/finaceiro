// Componentes minimos e o estilo. Um arquivo, sem biblioteca de UI.
//
// A ESCOLHA E COERENTE COM O RESTO: o servidor e `node:http` puro e as rotas sao
// "uma tabela, nao um framework". Uma biblioteca de componentes aqui seria a
// maior dependencia do projeto inteiro, para telas que sao formulario e tabela.
//
// O estilo mora num <style> injetado em vez de num .css importado porque assim
// nao ha um segundo pipeline de build para manter.
//
// O QUE MUDOU EM 29/07/2026, a pedido do dono: o visual clareou e o laranja da
// marca ganhou presenca (filete de gradiente, navegacao ativa, foco, cartoes),
// os rotulos sairam do minusculo-tudo para a caixa de sentenca, e as tabelas
// ganharam busca, filtro e ordenacao — os componentes novos estao no fim.

import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { VARIAVEIS_CSS, TIPOGRAFIA, lerModo, aplicarModo, type ModoTema } from './tema.ts';

// NENHUMA COR LITERAL DAQUI PARA BAIXO. Tudo sai de `tema.ts`, via custom
// property — inclusive a sombra e o gradiente. E o que faz "trocar a paleta"
// ser trocar um arquivo em vez de cacar hexadecimal em oito telas - e foi o que
// se pagou em 28/07, quando a paleta da G3 chegou e a troca inteira coube num
// arquivo.
export const ESTILO = `
  ${VARIAVEIS_CSS}
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fundo); color: var(--texto);
    font: ${TIPOGRAFIA.base}/${TIPOGRAFIA.linha} ${TIPOGRAFIA.familia};
  }
  ::selection { background: var(--acento-suave); }
  /* --acento-forte, e nao --acento: link e TEXTO, e o laranja da marca como
     texto da 2.35:1 no branco - reprova a restricao 1 do tema. */
  a { color: var(--acento-forte); }

  /* O topo inteiro (filete de marca + barra) rola junto e gruda junto. */
  .topo { position: sticky; top: 0; z-index: 10; }
  .filete { height: 3px; background: var(--gradiente); }
  .barra {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 10px 20px; border-bottom: 1px solid var(--borda); background: var(--fundo2);
    box-shadow: 0 1px 2px var(--sombra);
  }
  .marca-app { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 15px; }
  .barra nav { display: flex; gap: 4px; flex-wrap: wrap; }
  .barra nav a {
    padding: 6px 12px; border-radius: 999px; text-decoration: none;
    color: var(--fraco); font-size: 14px; font-weight: 500;
  }
  .barra nav a:hover { color: var(--texto); background: var(--fundo); }
  /* Navegacao ativa e o acento como SUPERFICIE (--acento-suave): e presenca de
     marca sem virar texto laranja puro, que reprovaria contraste. */
  .barra nav a.ativo { background: var(--acento-suave); color: var(--acento-forte); }

  .conteudo { max-width: var(--largura); margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 17px; margin: 28px 0 10px; }
  .sub { color: var(--fraco); margin: 0 0 20px; font-size: 14px; }

  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--borda); vertical-align: top; }
  th { color: var(--fraco); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: var(--fundo); }
  td.num, th.num { text-align: right; font-variant-numeric: ${TIPOGRAFIA.numero}; }

  /* Cabecalho ordenavel: o th vira botao sem deixar de parecer cabecalho. */
  th .ordenar {
    background: none; border: 0; padding: 0; font: inherit; color: inherit;
    text-transform: inherit; letter-spacing: inherit; cursor: pointer;
    display: inline-flex; align-items: center; gap: 4px;
  }
  th .ordenar:hover { color: var(--texto); }
  th .ordenar .seta { font-size: 9px; opacity: .45; }
  th[aria-sort] .ordenar { color: var(--acento-forte); }
  th[aria-sort] .ordenar .seta { opacity: 1; }

  .rolagem {
    overflow-x: auto; border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); box-shadow: 0 1px 3px var(--sombra);
  }
  .cartao {
    border: 1px solid var(--borda); border-radius: var(--raio-cartao); padding: 16px;
    background: var(--fundo2); box-shadow: 0 1px 3px var(--sombra);
  }
  .campos { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  label { display: block; font-size: 13px; font-weight: 500; color: var(--fraco); margin-bottom: 4px; }
  input, select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--borda); border-radius: var(--raio);
    background: var(--fundo); color: var(--texto); font: inherit; font-size: 14px;
  }
  input:focus, select:focus {
    outline: none; border-color: var(--foco); box-shadow: 0 0 0 3px var(--acento-suave);
  }
  button {
    padding: 8px 14px; border-radius: var(--raio); border: 1px solid var(--borda);
    background: var(--fundo2); color: var(--texto); font: inherit; font-size: 14px;
    font-weight: 500; cursor: pointer;
    transition: border-color .12s ease, color .12s ease, background-color .12s ease;
  }
  button:hover:not(:disabled) { border-color: var(--acento); color: var(--acento-forte); }
  button.primario { background: var(--acento); border-color: var(--acento); color: var(--acento-texto); font-weight: 600; }
  /* O hover do botao primario ESCURECE (--acento-hover), nunca clareia: clarear
     derruba o contraste do texto e "apaga" o botao - e a regra documentada no
     proprio token, vinda da pesquisa de 29/07. */
  button.primario:hover:not(:disabled) {
    background: var(--acento-hover); border-color: var(--acento-hover); color: var(--acento-texto);
  }
  button:disabled { opacity: .5; cursor: default; }
  a:focus-visible, button:focus-visible, th .ordenar:focus-visible {
    outline: 2px solid var(--foco); outline-offset: 2px;
  }

  .aviso { padding: 10px 12px; border-radius: var(--raio); font-size: 14px; margin: 12px 0; }
  .aviso.erro { background: var(--erro-fundo); color: var(--erro); border: 1px solid currentColor; }
  .aviso.ok { background: var(--fundo2); color: var(--ok); border: 1px solid currentColor; }
  /* O par --alerta/--alerta-fundo ja existia no tema com o contraste medido nos
     dois temas ("sobre o proprio fundo de aviso", tema.ts); faltava a classe. */
  .aviso.alerta { background: var(--alerta-fundo); color: var(--alerta); border: 1px solid currentColor; }

  /* Estado e PILULA CONTORNADA COM O TEXTO DENTRO, nunca preenchida: e a
     separacao de forma que o tema exige entre estado e acento (a nota de
     adjacencia do tema.ts) — o acento aparece preenchido, o estado nunca. */
  .marca { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
  .marca.ok { color: var(--ok); }
  .marca.pendente { color: var(--erro); }
  .marca.nao_medido { color: var(--alerta); }
  .fraco { color: var(--fraco); }
  .vazio { padding: 32px; text-align: center; color: var(--fraco); font-size: 14px; }

  /* A barra de ferramentas das listas: busca, filtros e a contagem. */
  .ferramentas { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; }
  .ferramentas select { width: auto; }
  .ferramentas .contagem { margin-left: auto; font-size: 13px; color: var(--fraco); }
  .busca { position: relative; }
  .busca svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--fraco); }
  .busca input { padding-left: 32px; width: 250px; }

  /* Cartoes de resumo (Prontidao, Carteira). */
  .kpis { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin: 0 0 16px; }
  .kpi {
    border: 1px solid var(--borda); border-left: 3px solid var(--acento);
    border-radius: var(--raio-cartao); background: var(--fundo2);
    padding: 12px 16px; box-shadow: 0 1px 3px var(--sombra);
  }
  .kpi .nome { font-size: 12px; color: var(--fraco); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
  .kpi .valor { font-size: 22px; font-weight: 650; font-variant-numeric: ${TIPOGRAFIA.numero}; }

  /* ---------------------------------------------------------- impressao
     A decisao 3 da Q-DOCFATURA-01 foi "HTML agora, gerador de PDF depois": o PDF
     sai pelo dialogo do proprio sistema, e o que o define e este bloco. Sem ele,
     window.print() imprimiria a barra de navegacao e os botoes junto. */
  .documento {
    background: #fff; color: #111; padding: 32px; border: 1px solid var(--borda);
    border-radius: 8px; max-width: 800px;
  }
  .documento table td { padding: 6px 4px; border-bottom: 1px solid #eee; }
  @media print {
    /* Tudo fora do documento sai da pagina impressa - inclusive o que esta
       marcado com a classe naoimprime, que sao os controles da propria previa. */
    body * { visibility: hidden; }
    #documento, #documento * { visibility: visible; }
    #documento .naoimprime, .naoimprime { display: none !important; }
    #documento {
      position: absolute; left: 0; top: 0; width: 100%;
      border: none; border-radius: 0; padding: 0; max-width: none;
    }
    @page { margin: 16mm; }
  }

  /* O centro da tela de login, com o brilho quente da marca no alto. */
  .central {
    min-height: 100dvh; display: grid; place-items: center; padding: 20px;
    background: radial-gradient(70% 50% at 50% 0%, var(--acento-suave), transparent 70%);
  }
`;

export const Aviso = ({ tipo, children }: { tipo: 'erro' | 'ok' | 'alerta'; children: ReactNode }) =>
  <div className={`aviso ${tipo}`}>{children}</div>;

export function Campo(p: {
  rotulo: string; valor: string; ao: (v: string) => void;
  tipo?: string; dica?: string; opcoes?: Array<{ valor: string; texto: string }>;
}) {
  return (
    <div>
      <label>{p.rotulo}</label>
      {p.opcoes ? (
        <select value={p.valor} onChange={(e) => p.ao(e.target.value)}>
          <option value="">—</option>
          {p.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      ) : (
        <input type={p.tipo ?? 'text'} value={p.valor} placeholder={p.dica} onChange={(e) => p.ao(e.target.value)} />
      )}
    </div>
  );
}

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

export const Marca = ({ tom, children }: { tom: 'ok' | 'pendente' | 'nao_medido'; children: ReactNode }) =>
  <span className={`marca ${tom}`}>{children}</span>;

// ------------------------------------------------------------------ marca G3

/** O sol da G3, desenhado com o acento do tema — muda junto com ele. */
export const Logotipo = ({ tamanho = 20 }: { tamanho?: number }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" fill="var(--acento)" />
    <g stroke="var(--acento)" strokeWidth="1.8" strokeLinecap="round">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const [x, y] = [Math.cos(a), Math.sin(a)];
        return <line key={i} x1={12 + 7 * x} y1={12 + 7 * y} x2={12 + 9.5 * x} y2={12 + 9.5 * y} />;
      })}
    </g>
  </svg>
);

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
        <span className="seta" aria-hidden="true">{ativa ? (p.ordem.desc ? '▼' : '▲') : '↕'}</span>
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" /><line x1="15.5" y1="15.5" x2="21" y2="21" />
      </svg>
      <input type="search" value={p.valor} placeholder={p.dica ?? 'Buscar…'}
             aria-label={p.dica ?? 'Buscar'} onChange={(e) => p.ao(e.target.value)} />
    </div>
  );
}

/** A barra acima da tabela: busca e filtros a esquerda, a contagem a direita.
 *  A contagem "N de M" e o que diz que um filtro esta ATIVO — lista curta sem
 *  aviso de filtro e o jeito de "sumir" um cadastro que esta la. */
export const Ferramentas = ({ children, contagem }: { children: ReactNode; contagem?: string }) => (
  <div className="ferramentas">
    {children}
    {contagem && <span className="contagem">{contagem}</span>}
  </div>
);

// ------------------------------------------------------------------- o tema

export function SeletorDeTema() {
  const [modo, setModo] = useState<ModoTema>(() => lerModo());
  return (
    <select value={modo} aria-label="Tema" title="Tema"
            style={{ width: 'auto', padding: '4px 8px' }}
            onChange={(e) => { const m = e.target.value as ModoTema; aplicarModo(m); setModo(m); }}>
      <option value="claro">Tema claro</option>
      <option value="escuro">Tema escuro</option>
      <option value="sistema">Tema do sistema</option>
    </select>
  );
}
