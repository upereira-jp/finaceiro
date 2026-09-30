// O SELETOR DE SETOR FINANCEIRO — o nome do setor atual com o ⌃⌄, e a lista que
// ele abre.
//
// ============================================================================
// POR QUE AS DUAS PÍLULAS VIRARAM UM MENU (27/09/2026)
//
// Pedido do dono: *«Atualize para um ícone parecido com setas viradas para cima
// e para baixo; ^+v no mesmo ícone. Esse ícone abre as opções de setor
// financeiro»*, com o Supabase como referência. O desenho de lá é o de migalha —
// `organização / projeto ⌃⌄` —, em que o nome diz ONDE você está e as duas setas
// dizem que dali se vai a outros lugares. Aqui: `Financeiro G3 / Rateio ⌃⌄`.
//
// Três ganhos, e nenhum é só de gosto:
//
//   1. A BARRA DIZ UMA COISA SÓ. As duas pílulas mostravam o setor atual E o
//      outro, lado a lado; a migalha mostra o atual, e o outro fica a um clique;
//   2. O SETOR CRESCE SEM PEDIR LARGURA. Um terceiro setor é uma linha a mais no
//      menu, e não uma terceira pílula empurrando o bloco da sessão para baixo;
//   3. O MENU TEM ESPAÇO PARA DIZER O QUE CADA SETOR É — desenho, nome e uma
//      linha de resumo —, que duas palavras numa pílula não tinham.
//
// ============================================================================
// O QUE CONTINUOU IGUAL, de propósito
//
//   O SETOR É DERIVADO DO CAMINHO. Quem desenha passa o funil atual; o único
//   estado daqui é «a lista está aberta».
//   OS ITENS SÃO ÂNCORAS (`Ligacao`), e não botões: botão do meio e «copiar
//   endereço» continuam funcionando, como nas pílulas.
//   TROCAR DE SETOR LEVA À PRIMEIRA TELA DELE — Mês no Rateio (até 30/09/2026
//   Pendências), Contas a receber na Empresa (`primeiraTelaDoFunil`, `I4l`).
//
// ============================================================================
// DO LADO DA MARCA PARA O ALTO DO MENU LATERAL (30/09/2026, etapa 3b)
//
// A barra do topo saiu, e o seletor foi junto com a marca para o alto do menu
// lateral, logo abaixo de «Financeiro G3». Nada do comportamento mudou — mesma
// lista, mesmas setas, mesmo foco —; muda o lugar, e o gatilho passou a ocupar
// a largura do menu, que é o desenho de «em que lugar estou» de todo menu
// lateral. A migalha inclinada entre a marca e o setor saiu: um em cima do
// outro, a relação já é de endereço.
//
// NÃO REUSA O `Menu` de `ui.tsx`, e a diferença é de SIGNIFICADO: aquele é
// `role="menu"`, uma lista de AÇÕES (tema, sair) feita de botões. Esta é uma
// lista de LUGARES, e leitor de tela precisa ouvir «link, atual», não «item de
// menu». O padrão é o de divulgação — botão com `aria-expanded` que mostra uma
// lista de links —, com as setas do teclado como atalho a mais.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icone } from './icones.tsx';
import { Ligacao } from './rota.tsx';
import { PASTAS, TELAS, primeiraTelaDoFunil, type Funil } from './navegacao.ts';

// ============================================================================
// A SEGUNDA PASTA (30/09/2026): «ADMINISTRAÇÃO DA PLATAFORMA»
//
// O menu passou a ter dois blocos, cada um com o seu título: os setores
// financeiros (itens = SETORES, que levam à primeira tela de cada um) e a
// administração (itens = as TELAS dela, porque ali se vai a uma função). Um
// bloco sem nada que o vínculo veja não é desenhado — nem o título: quem não
// administra não fica sabendo, pelo menu, que a pasta existe.
//
// QUEM VÊ O QUÊ chega pronto em `visiveis` (`funisVisiveis(setores)` no
// `app.tsx`). Este componente não conhece sessão.

export function SeletorDeSetor({ atual, visiveis, rotaAtual }: {
  atual: Funil;
  /** Os funis que o vínculo vê, na ordem de `FUNIS`. */
  visiveis: readonly Funil[];
  /** A rota aberta — marca a tela atual dentro da pasta de administração. */
  rotaAtual: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const idDaLista = useId();

  const itens = (): HTMLAnchorElement[] =>
    Array.from(caixa.current?.querySelectorAll<HTMLAnchorElement>('.setor-item') ?? []);

  /** Fechar pelo teclado DEVOLVE o foco ao gatilho: sem isso, o Esc deixaria o
   *  foco num link que acabou de sair da página, e o próximo Tab recomeçaria do
   *  topo do documento. */
  const fechar = (devolverFoco: boolean) => {
    setAberto(false);
    if (devolverFoco) gatilho.current?.focus();
  };

  useEffect(() => {
    if (!aberto) return;
    // O FOCO VAI PARA O SETOR ATUAL ao abrir — é de onde se parte para o outro.
    // Aberto pelo mouse, o anel não aparece: o `:focus-visible` segue a última
    // forma de interação, e ela foi o clique.
    (itens().find((a) => a.hasAttribute('aria-current')) ?? itens()[0])?.focus();
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') fechar(true); };
    addEventListener('mousedown', fora);
    addEventListener('keydown', tecla);
    return () => { removeEventListener('mousedown', fora); removeEventListener('keydown', tecla); };
  }, [aberto]);

  /** Setas, Home e End andam entre os setores, e dão a volta nas pontas. Tab
   *  continua saindo da lista normalmente — é o `onBlur` abaixo que a fecha. */
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    const lista = itens();
    const i = lista.indexOf(document.activeElement as HTMLAnchorElement);
    const ir = (j: number) => { e.preventDefault(); lista[(j + lista.length) % lista.length]?.focus(); };
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(lista.length - 1);
  };

  return (
    <div className="setor" ref={caixa}
         // O FOCO SAIU DA CAIXA (Tab depois do último setor) fecha a lista. Só
         // quando há um destino: no Safari o clique em botão não lhe dá foco, e
         // fechar com `relatedTarget` nulo faria o clique no próprio gatilho
         // fechar aqui e reabrir no `onClick` logo depois.
         onBlur={(e) => {
           if (aberto && e.relatedTarget && !caixa.current?.contains(e.relatedTarget as Node)) setAberto(false);
         }}>
      <button ref={gatilho} type="button" className="setor-gatilho"
              aria-expanded={aberto} aria-controls={idDaLista}
              aria-label={`${atual.pasta === 'setores' ? 'Setor financeiro' : 'Pasta'}: ${atual.nome}. Trocar`}
              title="Trocar de setor ou abrir a administração"
              onClick={() => setAberto((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); setAberto(true); }
              }}>
        <Icone nome={atual.icone} tamanho={16} className="setor-simbolo" />
        {/* O nome num `span` próprio (30/09/2026): com o menu lateral recolhido o
            gatilho fica só com o desenho e as setas, e o nome sai da VISTA — o
            `aria-label` acima continua dizendo o setor inteiro. */}
        <span className="setor-rotulo">{atual.rotulo}</span>
        <Icone nome="trocar_setor" tamanho={14} peso="bold" className="setor-setas" />
      </button>

      {aberto && (
        <div className="setor-painel" id={idDaLista} onKeyDown={aoTeclar}
             // Escolher um setor fecha a lista e devolve o foco ao gatilho — que
             // agora mostra o setor novo, e é o que o teclado precisa confirmar.
             onClick={(e) => { if ((e.target as Element).closest('.setor-item')) fechar(true); }}>
          {PASTAS.map((pasta) => {
            const funis = visiveis.filter((f) => f.pasta === pasta.chave);
            if (funis.length === 0) return null;
            return (
              <div key={pasta.chave} className="setor-pasta">
                <div className="titulo rot-alta">{pasta.titulo}</div>
                <ul>
                  {pasta.chave === 'setores'
                    ? funis.map((f) => {
                        const ativo = f.chave === atual.chave;
                        return (
                          <li key={f.chave}>
                            {/* `aria-current="true"`, e não "page": o item é o SETOR em
                                que a pessoa está, e o link leva à primeira tela dele — que
                                pode não ser a tela aberta agora. */}
                            <Ligacao para={primeiraTelaDoFunil(f.chave).rota} atual={ativo ? 'true' : false}
                                     className="setor-item">
                              <span className="setor-selo"><Icone nome={f.icone} tamanho={17} /></span>
                              <span className="setor-texto">
                                <strong>{f.rotulo}</strong>
                                <span>{f.resumo}</span>
                              </span>
                              {ativo && <Icone nome="ok" tamanho={14} peso="bold" className="setor-marca" />}
                            </Ligacao>
                          </li>
                        );
                      })
                    : TELAS.filter((t) => funis.some((f) => f.chave === t.funil)).map((t) => {
                        // Aqui o item É a tela: "página atual" é verdade.
                        const ativo = t.rota === rotaAtual;
                        return (
                          <li key={t.rota}>
                            <Ligacao para={t.rota} atual={ativo} className="setor-item">
                              <span className="setor-selo"><Icone nome={t.icone} tamanho={17} /></span>
                              <span className="setor-texto">
                                <strong>{t.titulo}</strong>
                                {t.resumo && <span>{t.resumo}</span>}
                              </span>
                              {ativo && <Icone nome="ok" tamanho={14} peso="bold" className="setor-marca" />}
                            </Ligacao>
                          </li>
                        );
                      })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
