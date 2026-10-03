// O DESENHO DO PAINEL DE SAÚDE — só desenho, sem busca (03/10/2026).
//
// Mesmo par de `saude-do-dinheiro.ts` + `saude-corpo.tsx` e de `automacoes.ts` +
// `automacoes-corpo.tsx`: as regras moram no `.ts` (`painel-de-saude.ts`), que a
// suíte lê; este arquivo recebe a leitura pronta e desenha, para o desenho poder
// ser MONTADO num teste (`renderToStaticMarkup` não roda efeito). Quem busca é
// `painel-de-saude-tela.tsx`.
//
// A SUPERFÍCIE É A DO RODAPÉ QUE ELE SUBSTITUI no Mês: `Recolhido`, com o resumo
// de uma linha à vista e a lista dentro, régua entre as linhas e sem cartão dentro
// de cartão. Abre sozinho quando alguma peça pede atenção.

import { Recolhido, Marca, DetalheTecnico } from './ui.tsx';
import { Ligacao } from './rota.tsx';
import { SELO_DA_PECA_DE_SAUDE } from './tom-do-estado.ts';
import {
  pecasDaSaude, resumoDaSaude, temAlarme, algoLido, aindaLendo, ROTULO_DO_ESTADO_DA_PECA,
  type LeituraDaSaude,
} from './painel-de-saude.ts';

export function CorpoDoPainelDeSaude({ leitura }: { leitura: LeituraDaSaude }) {
  /* NADA ANTES DA PRIMEIRA RESPOSTA — ver `algoLido`. */
  if (!algoLido(leitura)) return null;
  const pecas = pecasDaSaude(leitura);
  return (
    <Recolhido icone="aviso_ok" titulo="Saúde do sistema" resumo={resumoDaSaude(pecas, aindaLendo(leitura))}
               aberto={temAlarme(pecas)}>
      <p className="sub" style={{ marginBottom: 12 }}>
        O caminho do dinheiro, peça por peça: o que o sistema faz sozinho, o banco, os pagamentos que o
        banco avisou e não entraram aqui, e o que ainda não existe. Quando uma peça quebra, o aviso
        também sobe para o alto da tela.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        {pecas.map((p, i) => (
          <li key={p.chave}
              style={{
                borderTop: i === 0 ? undefined : '1px solid var(--borda-suave)',
                paddingTop: i === 0 ? 0 : 12,
                lineHeight: 1.55,
              }}>
            <Marca selo={SELO_DA_PECA_DE_SAUDE[p.estado]}>{ROTULO_DO_ESTADO_DA_PECA[p.estado]}</Marca>{' '}
            <strong>{p.nome}</strong> {p.frase}
            {p.detalhes.length > 0 && (
              <ul className="fraco" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'var(--t-meta)' }}>
                {p.detalhes.map((d, j) => <li key={j}>{d}</li>)}
              </ul>
            )}
            {p.destino && (
              <div style={{ marginTop: 4 }}>
                <Ligacao para={p.destino.endereco}>{p.destino.rotulo}</Ligacao>
              </div>
            )}
            {p.tecnico.length > 0 && (
              <DetalheTecnico de={p.nome}>
                {p.tecnico.map((t, j) => <div key={j}>{t}</div>)}
              </DetalheTecnico>
            )}
          </li>
        ))}
      </ul>
    </Recolhido>
  );
}
