// O QUE NÃO CHEGOU AO BANCO, na parte que DESENHA — e ela recebe tudo por
// propriedade, de propósito.
//
// ============================================================================
// POR QUE SÃO DOIS COMPONENTES E NÃO UM, e é a mesma divisão das automações
//
//   `FaixaDaEmissao`    o ALARME, no alto de Pendências. CONTA, não lista: «4
//                       faturas emitidas estão sem boleto no banco, a mais
//                       antiga há 9 dias». Existe para ninguém precisar abrir a
//                       tela de emissão para descobrir que precisa abri-la;
//   `PainelDaEmissao`   a LISTA, na tela de emissão e cobrança, que é onde se
//                       age sobre ela — cada linha tem o motivo, o que o banco
//                       respondeu e o botão que pede o boleto.
//
// Uma faixa que listasse as quatro faturas viraria a segunda tela de emissão, e
// o alarme deixaria de caber na primeira dobra da tela de Pendências. Uma lista
// sem faixa dependeria de alguém abrir a aba certa no dia certo — que é
// exatamente o que o levantamento de 10/09 disse que não acontece.
//
// COMO A SEPARAÇÃO SE PROVA: `renderToStaticMarkup` não roda efeito, então um
// componente que busca sozinho renderiza sempre o estado vazio e o teste mede o
// nada. Recebendo tudo por propriedade, qualquer estado é montável sem rede e
// sem tempo. É o mesmo par de `automacoes.ts` + `automacoes-corpo.tsx`.

import { Aviso, Icone } from './ui.tsx';
import { emReais } from './dinheiro.ts';
import {
  faixaDaEmissaoTravada, fraseDaLinha, haQuantoTempo, resumoDaEmissao, avisoDeTruncagem,
  type EmissaoTravadaNaTela, type LinhaNaTela,
} from './emissao-travada.ts';

export type CorpoDaEmissao = {
  /** `null` enquanto a leitura não voltou, e ausência de resposta não é resposta:
   *  não desenha faixa nem lista. Uma faixa que pisca vermelho durante o
   *  carregamento é ruído. */
  dados: EmissaoTravadaNaTela | null;
  /** A leitura FALHOU, e isso é dito — na lista, nunca como alarme vermelho.
   *  «Não deu para perguntar» não é «está tudo em dia», e calar seria pior que
   *  as duas: uma lista vazia é exatamente a cara de uma lista que diz que não
   *  há nada pendente. */
  erro?: string | null;
  /** O que fazer quando alguém clica em «Pedir o boleto agora». Ausente na
   *  montagem de teste e em qualquer lugar onde a ação não faz sentido — e aí o
   *  botão não é desenhado, em vez de existir sem efeito. */
  pedirBoleto?: (faturaId: string) => void;
  /** Trava os botões enquanto uma ação está em voo, como no resto da casa. */
  ocupado?: boolean;
};

const dataBr = (v: string): string => String(v).slice(0, 10).split('-').reverse().join('/');

/** Devolve `null` quando nada pede gente, e **`null` é a resposta**: quem monta
 *  não precisa saber quais níveis merecem faixa. */
export function FaixaDaEmissao({ dados }: CorpoDaEmissao) {
  const f = faixaDaEmissaoTravada(dados);
  if (!f) return null;
  return (
    <Aviso tipo={f.tom}>
      <strong>{f.titulo}</strong> {f.corpo}
    </Aviso>
  );
}

/**
 * A LISTA, e ela desenha ATÉ quando está vazia.
 *
 * A ordem é a que o servidor mandou, e ela é a do dinheiro parado: vencimento
 * mais antigo primeiro — o cliente que está há mais tempo sem receber cobrança.
 * Ordenar por gravidade poria em cima o que grita mais alto, e não o que dói há
 * mais tempo.
 */
export function PainelDaEmissao({ dados, erro, pedirBoleto, ocupado }: CorpoDaEmissao) {
  if (erro) {
    return (
      <Aviso tipo="alerta">
        <strong>Não foi possível saber quais faturas estão sem boleto no banco.</strong>{' '}
        Isso não quer dizer que estão todas certas — quer dizer que ninguém sabe. O motivo foi: {erro}
      </Aviso>
    );
  }
  if (!dados) return null;

  const truncou = avisoDeTruncagem(dados);

  return (
    <div className="cartao secao">
      <h3 style={{ marginTop: 0 }}>
        <Icone nome="boleto" tamanho={16} /> O que ainda não chegou ao banco
      </h3>
      {/*
        A AFIRMAÇÃO VEM MESMO VAZIA, e é a lição de 10/09/2026 uma camada acima:
        «nenhuma linha» e «a leitura quebrou» têm a mesma cara quando a tela cala,
        e o que se quer perceber aqui é uma AUSÊNCIA — a cobrança que não saiu.
      */}
      <p className="sub" style={{ marginBottom: dados.total === 0 ? 0 : 12 }}>
        {resumoDaEmissao(dados)}
        {truncou && <> {truncou}</>}
      </p>

      {dados.linhas.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {dados.linhas.map((l, i) => (
            <LinhaDaEmissao key={l.fatura_id} l={l} primeira={i === 0}
                            pedirBoleto={pedirBoleto} ocupado={ocupado} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDaEmissao({ l, primeira, pedirBoleto, ocupado }: {
  l: LinhaNaTela; primeira: boolean;
  pedirBoleto?: (faturaId: string) => void; ocupado?: boolean;
}) {
  const f = fraseDaLinha(l);
  /* Pedir o boleto só faz sentido onde o servidor aceita: `parado` é justamente
     a linha que ele recusa, e oferecer o botão ali seria oferecer o que já se
     sabe que volta com erro. As outras quatro passam pela mesma rota. */
  const podePedir = pedirBoleto && l.nivel !== 'parado';

  return (
    <li style={{
      borderTop: primeira ? undefined : '1px solid var(--borda-suave)',
      paddingTop: primeira ? 0 : 12,
      display: 'grid', gap: 6,
    }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {/* O ícone é o SEGUNDO sinal, e não a informação: quem não distingue a
            cor lê a mesma frase inteira. Restrição 3 do tema. O calendário é o
            que espera a próxima tentativa; a pendência é o que espera alguém. */}
        <Icone nome={f.grave ? 'pendente' : 'calendario'} tamanho={15} peso="bold" />
        <strong>{l.unidade}</strong>
        <span>{l.cliente}</span>
        <span className="fraco">vence {dataBr(l.vencimento)}</span>
        <span className="fraco">{emReais(l.valor_total_centavos)}</span>
        {haQuantoTempo(l) && <span className="fraco">{haQuantoTempo(l)}</span>}
        {f.tentativas && <span className="fraco">{f.tentativas}</span>}
      </div>
      <div style={{ lineHeight: 1.55 }}>
        {f.estado} <span className="fraco">{f.oQueFazer}</span>
      </div>
      {f.respostaDoBanco && (
        <div className="fraco" style={{ lineHeight: 1.5 }}>
          O banco respondeu: {f.respostaDoBanco}
        </div>
      )}
      {podePedir && (
        <div>
          <button onClick={() => pedirBoleto!(l.fatura_id)} disabled={ocupado}>
            <Icone nome="boleto" tamanho={14} peso="bold" /> Pedir o boleto agora
          </button>
        </div>
      )}
    </li>
  );
}
