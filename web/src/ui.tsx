// Componentes minimos e o estilo. Um arquivo, sem biblioteca de UI.
//
// A ESCOLHA E COERENTE COM O RESTO: o servidor e `node:http` puro e as rotas sao
// "uma tabela, nao um framework". Uma biblioteca de componentes aqui seria a
// maior dependencia do projeto inteiro, para telas que sao formulario e tabela.
//
// O estilo mora num <style> injetado em vez de num .css importado porque assim
// nao ha um segundo pipeline de build para manter, e o tema segue o do sistema
// operacional do usuario - operacao trabalha o dia todo nisto.

import type { ReactNode, CSSProperties } from 'react';

export const ESTILO = `
  :root {
    --fundo: #ffffff; --fundo2: #f6f7f9; --texto: #16181d; --fraco: #6b7280;
    --borda: #e3e6ea; --acento: #1f6feb; --erro: #b42318; --erro-fundo: #fef3f2;
    --ok: #067647; --alerta: #b54708; --alerta-fundo: #fffaeb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fundo: #0f1115; --fundo2: #161a21; --texto: #e6e8ec; --fraco: #9aa3af;
      --borda: #262c36; --acento: #4c8dff; --erro: #ff6b6b; --erro-fundo: #2a1416;
      --ok: #4ade80; --alerta: #fbbf24; --alerta-fundo: #2a2113;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fundo); color: var(--texto);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  a { color: var(--acento); }
  .barra {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 10px 20px; border-bottom: 1px solid var(--borda); background: var(--fundo2);
    position: sticky; top: 0; z-index: 10;
  }
  .barra nav { display: flex; gap: 4px; flex-wrap: wrap; }
  .barra nav a {
    padding: 6px 10px; border-radius: 6px; text-decoration: none; color: var(--fraco); font-size: 14px;
  }
  .barra nav a.ativo { background: var(--fundo); color: var(--texto); box-shadow: inset 0 0 0 1px var(--borda); }
  .conteudo { max-width: 1100px; margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 28px 0 10px; }
  .sub { color: var(--fraco); margin: 0 0 20px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--borda); vertical-align: top; }
  th { color: var(--fraco); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .rolagem { overflow-x: auto; border: 1px solid var(--borda); border-radius: 8px; }
  .cartao { border: 1px solid var(--borda); border-radius: 8px; padding: 16px; background: var(--fundo2); }
  .campos { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  label { display: block; font-size: 13px; color: var(--fraco); margin-bottom: 4px; }
  input, select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--borda); border-radius: 6px;
    background: var(--fundo); color: var(--texto); font: inherit; font-size: 14px;
  }
  button {
    padding: 8px 14px; border-radius: 6px; border: 1px solid var(--borda);
    background: var(--fundo); color: var(--texto); font: inherit; font-size: 14px; cursor: pointer;
  }
  button.primario { background: var(--acento); border-color: var(--acento); color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  .aviso { padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 12px 0; }
  .aviso.erro { background: var(--erro-fundo); color: var(--erro); border: 1px solid currentColor; }
  .aviso.ok { background: var(--fundo2); color: var(--ok); border: 1px solid currentColor; }
  .marca { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
  .marca.ok { color: var(--ok); }
  .marca.pendente { color: var(--erro); }
  .marca.nao_medido { color: var(--alerta); }
  .fraco { color: var(--fraco); }
  .vazio { padding: 28px; text-align: center; color: var(--fraco); font-size: 14px; }
`;

export const Aviso = ({ tipo, children }: { tipo: 'erro' | 'ok'; children: ReactNode }) =>
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
  cabecalho: ReactNode; children: ReactNode; vazio?: string;
}) => {
  const temLinha = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : Boolean(children);
  return (
    <div className="rolagem">
      {temLinha
        ? <table><thead><tr>{cabecalho}</tr></thead><tbody>{children}</tbody></table>
        : <div className="vazio">{vazio ?? 'nada aqui ainda'}</div>}
    </div>
  );
};

export const linha: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
