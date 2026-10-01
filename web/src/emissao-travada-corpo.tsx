// O QUE NÃO CHEGOU AO BANCO, na parte que DESENHA — e ela recebe tudo por
// propriedade, de propósito.
//
// ============================================================================
// ERAM DOIS COMPONENTES, E FICOU UM (30/09/2026, etapa 4a)
//
//   `PainelDaEmissao`   a LISTA, na tela Cobranças, que é onde se age sobre
//                       ela — cada linha tem o motivo, o que o banco respondeu
//                       e o botão que pede o boleto.
//
// O outro era `FaixaDaEmissao`, o ALARME que contava no alto de Pendências. Ele
// saiu da tela na etapa 3 e do código na 4a — ver a nota logo abaixo.
//
// ⚠️ A FAIXA SAIU DA TELA MÊS EM 30/09/2026 (etapa 3 do redesenho), e o que ela
// dizia mudou de lugar, não de dono. Ela ficava acima do roteiro do mês, em
// vermelho, mandando agir no passo 4 — enquanto o roteiro, logo abaixo, dizia
// «você está no 1 de 5». Duas respostas para «o que eu faço agora». Agora o
// PASSO 4 do funil conta as cobranças sem boleto (do mês e de outros meses) e
// ganha o destaque quando alguma pede gente — a mesma contagem, numa resposta
// só (`roteiro-do-mes.ts`, `RM2`/`RM10`). Na etapa 4a o componente e a regra que
// o alimentava (`faixaDaEmissaoTravada`) saíram também: nenhuma tela o montava,
// e código que ninguém monta é código que ninguém confere.
//
// COMO A SEPARAÇÃO SE PROVA: `renderToStaticMarkup` não roda efeito, então um
// componente que busca sozinho renderiza sempre o estado vazio e o teste mede o
// nada. Recebendo tudo por propriedade, qualquer estado é montável sem rede e
// sem tempo. É o mesmo par de `automacoes.ts` + `automacoes-corpo.tsx`.

import { Aviso, Icone } from './ui.tsx';
import { emReais } from './dinheiro.ts';
import { diaEmBr, mesEmBr, mesPorExtenso } from './formato.ts';
import {
  fraseDaLinha, haQuantoTempo, resumoDaEmissao, avisoDeTruncagem,
  type EmissaoTravadaNaTela, type LinhaNaTela,
} from './emissao-travada.ts';
import { acaoDaLinha, lerRecusa, type RecusaLida, type StatusDaCobranca } from './emissao-regras.ts';
import { RecusaNaTela } from './emissao-corpo.tsx';

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
  /** O que fazer quando alguém clica em «Pedir o boleto». Ausente na
   *  montagem de teste e em qualquer lugar onde a ação não faz sentido — e aí o
   *  botão não é desenhado, em vez de existir sem efeito. */
  pedirBoleto?: (faturaId: string) => void;
  /** Trava os botões enquanto uma ação está em voo, como no resto da casa. */
  ocupado?: boolean;
  /**
   * A RECUSA QUE A TELA CONHECE para a linha (30/09, etapa 2). A tela de emissão
   * sabe mais que a lista: tem o endereço de cada unidade e a recusa que acabou
   * de voltar. Sem esta função, a lista lê só o que o banco gravou
   * (`ultimo_erro`), e já traduz os códigos conhecidos.
   */
  recusaDe?: (l: LinhaNaTela) => RecusaLida | null;
};

/** A recusa que a própria linha carrega, quando o código é conhecido. */
const recusaGravada = (l: LinhaNaTela): RecusaLida | null =>
  lerRecusa({ texto: l.boleto?.ultimo_erro, numeroUc: l.unidade, mes: String(l.competencia).slice(0, 7) });

/* O MES E O DIA SAEM DE `formato.ts` desde 30/09/2026 (etapa 4b): as duas
   copias locais que moravam aqui eram a quinta e a sexta do sistema. */
const mesCurto = (v: string): string => (mesPorExtenso(v) ? mesEmBr(v) : '');

/**
 * A LISTA, e ela desenha ATÉ quando está vazia.
 *
 * A ordem é a que o servidor mandou, e ela é a do dinheiro parado: vencimento
 * mais antigo primeiro — o cliente que está há mais tempo sem receber cobrança.
 * Ordenar por gravidade poria em cima o que grita mais alto, e não o que dói há
 * mais tempo.
 */
export function PainelDaEmissao({ dados, erro, pedirBoleto, ocupado, recusaDe }: CorpoDaEmissao) {
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
    <section className="cartao secao" id="em-banco" aria-labelledby="em-banco-titulo">
      {/* H2 E NÃO H3 (30/09): a lista é uma seção da página, irmã da tabela do
          mês — e o salto h1 → h3 era um dos achados da crítica. */}
      <h2 id="em-banco-titulo" style={{ marginTop: 0 }}>
        <Icone nome="boleto" tamanho={17} /> O que ainda não chegou ao banco
      </h2>
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
                            pedirBoleto={pedirBoleto} ocupado={ocupado}
                            recusa={(recusaDe ?? recusaGravada)(l)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaDaEmissao({ l, primeira, pedirBoleto, ocupado, recusa }: {
  l: LinhaNaTela; primeira: boolean;
  pedirBoleto?: (faturaId: string) => void; ocupado?: boolean;
  recusa: RecusaLida | null;
}) {
  const f = fraseDaLinha(l);
  /*
   * A AÇÃO É A MESMA DA TABELA DO MÊS (`acaoDaLinha`), e até 30/09 não era.
   *
   * O botão «Pedir o boleto agora» aparecia em toda linha menos a `parado` —
   * inclusive na recusada por ENDEREÇO, que o servidor recusa de novo, pelo
   * mesmo motivo, até alguém completar o endereço em outra tela. Agora a recusa
   * conhecida troca o botão pela SAÍDA dela («Completar o endereço», já na
   * linha da unidade), e a linha que o sistema está retentando sozinho
   * (`esperando`) não oferece clique — a frase dela já diz que não é preciso.
   */
  const acao = acaoDaLinha(l.status_fatura as StatusDaCobranca, l, recusa);
  const conhecida = recusa && l.status_fatura === 'emitida' ? recusa : null;

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
        <Icone nome={f.grave ? 'falha' : 'calendario'} tamanho={15} peso="bold" />
        <strong>{l.unidade}</strong>
        <span>{l.cliente}</span>
        {mesCurto(l.competencia) && <span className="fraco">mês {mesCurto(l.competencia)}</span>}
        <span className="fraco">vence {diaEmBr(l.vencimento)}</span>
        <span className="fraco">{emReais(l.valor_total_centavos)}</span>
        {haQuantoTempo(l) && <span className="fraco">{haQuantoTempo(l)}</span>}
        {f.tentativas && <span className="fraco">{f.tentativas}</span>}
      </div>
      {conhecida ? (
        /* A RECUSA CONHECIDA SUBSTITUI a frase genérica do nível: «o banco vem
           recusando» não diz o que fazer, e «falta o endereço do pagador» diz. */
        <RecusaNaTela recusa={conhecida} unidade={l.unidade} />
      ) : (
        <>
          <div style={{ lineHeight: 1.55 }}>
            {f.estado} <span className="fraco">{f.oQueFazer}</span>
          </div>
          {/* A cobrança vencida saiu do estado que aceita boleto: a recusa não
              tem mais saída aqui, mas ela é dita traduzida quando conhecida — o
              código cru só atrás do detalhe técnico, como em toda a tela. */}
          {recusa ? (
            <div className="fraco" style={{ lineHeight: 1.5 }}>
              A última recusa do banco foi: {recusa.frase}
            </div>
          ) : f.respostaDoBanco && (
            <div className="fraco" style={{ lineHeight: 1.5 }}>
              O banco respondeu: {f.respostaDoBanco}
            </div>
          )}
        </>
      )}
      {acao.tipo === 'pedir_boleto' && pedirBoleto && (
        <div>
          <button type="button" onClick={() => pedirBoleto(l.fatura_id)} disabled={ocupado}
                  aria-label={`Pedir o boleto da unidade ${l.unidade}`}>
            <Icone nome="boleto" tamanho={14} peso="bold" /> Pedir o boleto
          </button>
        </div>
      )}
    </li>
  );
}
