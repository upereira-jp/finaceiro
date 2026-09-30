// O ROTEIRO DO MÊS, na parte que DESENHA — e ele recebe tudo por propriedade.
//
// É O MESMO PAR de `saude-do-dinheiro.ts` + `saude-corpo.tsx`, e pelo mesmo
// motivo escrito lá: `renderToStaticMarkup` não roda efeito, então um componente
// que busca sozinho renderiza o estado vazio e o teste mede o nada. Recebendo a
// leitura por propriedade, qualquer estado do mês é montável sem rede e sem
// tempo — e `caso-render.tsx` monta os que importam.
//
// ============================================================================
// AS DECISÕES DE DESENHO (30/09/2026, etapa 3 do redesenho)
//
//   O MÊS É UM FUNIL, NÃO UMA FILA. Os cinco passos aparecem lado a lado, cada
//   um com QUANTAS unidades estão nele agora. Até esta data a caixa era uma
//   fila — «você está no 1 de 5», e os passos 2 a 5 apagados — e num mês com
//   quinze cobranças emitidas ela dizia «1 de 5» porque ainda havia conta a ler;
//
//   UM PASSO EM DESTAQUE, pelo RISCO. O «Comece aqui» vai para o passo em que o
//   dinheiro corre perigo (a recusa do banco, a vencida), e não para o primeiro.
//   A regra está em `escolherOFoco`, com suíte;
//
//   UM PAINEL SÓ, e a pessoa escolhe qual. Os passos são abas (`role="tab"`) de
//   um painel com o que fazer, o botão e o como fazer. Ele abre no destaque, e
//   qualquer outro passo se abre com um clique ou com as setas — cinco
//   instruções abertas ao mesmo tempo é o mesmo que nenhuma;
//
//   O CADASTRO É UMA LINHA PRÓPRIA, com o link de onde se resolve cada coisa.
//   Ele trava unidades, não passos, e por isso não disputa o destaque;
//
//   NÃO MEDIDO É «—» E DIZ ISSO. Um número que não chegou não vira zero, e zero
//   não vira verde: a casa inteira trata «medido e certo» e «nunca medido» como
//   coisas diferentes;
//
//   QUANDO TUDO FECHA, A CAIXA FALA. Uma caixa que some quando o mês acaba tem a
//   mesma cara de uma caixa que quebrou.

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Ligacao } from './rota.tsx';
import { Icone } from './ui.tsx';
import {
  mesNoFunil, ondeEstouNoMes,
  type ChaveDoPasso, type LeituraDoMes, type PassoDoMes, type PassoNoMapa, type TravaDoPasso,
} from './roteiro-do-mes.ts';

/** Um passo do funil, como aba. O número, o título, a contagem e o risco. */
function AbaDoPasso({ passo, escolhido, idAba, idPainel, aoEscolher }: {
  passo: PassoDoMes; escolhido: boolean; idAba: string; idPainel: string; aoEscolher: () => void;
}) {
  const medido = passo.quantos !== null;
  const classes = ['roteiro-passo', passo.foco ? 'foco' : '', medido && passo.quantos === 0 ? 'zerado' : '',
                   passo.risco ? 'com-risco' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" role="tab" id={idAba} aria-selected={escolhido} aria-controls={idPainel}
            tabIndex={escolhido ? 0 : -1} className={classes} data-passo={passo.chave}
            onClick={aoEscolher}>
      {/* O SELO EXISTE EM TODA ABA, vazio nas outras: é o que alinha o número
          das cinco na mesma altura, sem depender de quantas linhas o título
          de cada uma ocupa. */}
      <span className="roteiro-selo rot-alta">{passo.foco ? 'Comece aqui' : ''}</span>
      <span className="roteiro-cab">
        <span className="roteiro-num" aria-hidden="true">{passo.numero}</span>
        <span className="roteiro-tit">{passo.titulo}</span>
      </span>
      <span className="roteiro-qtd">{medido ? passo.quantos : '—'}</span>
      <span className="roteiro-rot">{medido ? passo.rotulo : 'não medido'}</span>
      {passo.contexto && <span className="roteiro-ctx">{passo.contexto}</span>}
      {passo.risco && (
        <span className="roteiro-risco">
          <Icone nome="aviso_alerta" tamanho={14} peso="bold" /> {passo.risco.frase}
        </span>
      )}
    </button>
  );
}

/** O painel do passo escolhido: o que é, o botão, e como se faz. */
function PainelDoPasso({ passo, idAba, idPainel }: { passo: PassoDoMes; idAba: string; idPainel: string }) {
  return (
    <div className="roteiro-painel" role="tabpanel" id={idPainel} aria-labelledby={idAba}>
      <div className="roteiro-painel-cab">
        <h3>{passo.numero} · {passo.titulo}</h3>
        {passo.automatico && <span className="fraco">o sistema faz sozinho</span>}
      </div>

      {passo.risco && (
        <p className="roteiro-painel-risco">
          <Icone nome="aviso_alerta" tamanho={15} peso="bold" /> <strong>{passo.risco.frase}.</strong>
        </p>
      )}

      <p className="roteiro-painel-oque">{passo.oQueFazer}</p>

      {/* O BOTÃO VEM ANTES DO «COMO», e não no fim dele: quem já sabe fazer não
          precisa ler quatro linhas para achar a porta. O nome é o da aba, letra
          por letra (`RM13`). */}
      <p className="roteiro-painel-ir">
        <Ligacao para={passo.destino.endereco} className="botao primario">
          Abrir {passo.destino.rotulo} <Icone nome="ir_para" tamanho={15} peso="bold" />
        </Ligacao>
      </p>

      {/* NUMERADO E NÃO EM MARCADORES: são atos em ordem, e a ordem é o que a
          pessoa precisa. Uma lista de marcadores convida a escolher. */}
      <h4 className="roteiro-como-tit">Como fazer</h4>
      <ol className="roteiro-como">
        {passo.comoFazer.map((l) => <li key={l}>{l}</li>)}
      </ol>
    </div>
  );
}

/** Uma pendência de cadastro: o que é, quantos, e o ato que a resolve. */
function Trava({ trava }: { trava: TravaDoPasso }) {
  return (
    <li>
      <span className="roteiro-trava-nome">{trava.titulo}</span>
      {trava.faltam > 0 && <span className="fraco"> · {trava.faltam} {trava.contagem}</span>}
      {' '}
      {trava.endereco && trava.rotuloDoDestino
        ? <Ligacao para={trava.endereco}>{trava.rotuloDoDestino}</Ligacao>
        : <span className="fraco">não há tela para isto — veja a linha na tabela abaixo</span>}
    </li>
  );
}

export type CorpoDoRoteiro = LeituraDoMes & {
  /** «setembro de 2026», já formatado por quem chamou — este módulo não conhece
   *  calendário, e inventar um segundo formatador daria duas grafias do mesmo
   *  mês na mesma tela. */
  competencia: ReactNode;
};

const ORDEM: readonly ChaveDoPasso[] = ['ler', 'gerar', 'emitir', 'cobrar', 'receber'];

/**
 * A CAIXA INTEIRA. Nunca devolve `null`: mesmo com o mês fechado ela fala, e
 * mesmo sem número nenhum ela mostra os cinco passos — que já é a resposta para
 * «o que este sistema espera de mim».
 */
export function CorpoDoRoteiro({ competencia, ...leitura }: CorpoDoRoteiro) {
  const mes = mesNoFunil(leitura);
  const base = useId();
  const [escolha, setEscolha] = useState<ChaveDoPasso | null>(null);
  /* Sem escolha da pessoa, o painel é o do destaque; sem destaque (mês fechado
     ou nada medido), o do primeiro passo — ele é o que ensina o mês. */
  const aberto = escolha ?? mes.foco?.chave ?? 'ler';
  const passoAberto = mes.passos.find((p) => p.chave === aberto)!;
  const idAba = (c: ChaveDoPasso) => `${base}-aba-${c}`;
  const idPainel = `${base}-painel`;

  /* AS SETAS ANDAM ENTRE OS PASSOS e abrem o painel de cada um — o padrão de
     abas da WAI-ARIA, com as duas direções valendo porque no celular a lista é
     vertical. */
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ORDEM.indexOf(aberto);
    const ir = (j: number) => {
      e.preventDefault();
      const c = ORDEM[(j + ORDEM.length) % ORDEM.length]!;
      setEscolha(c);
      document.getElementById(idAba(c))?.focus();
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(ORDEM.length - 1);
  };

  return (
    <section className={`cartao secao roteiro estado-${mes.estado}`} aria-labelledby={`${base}-titulo`}>
      <div className="roteiro-topo">
        <h2 id={`${base}-titulo`}>O mês de {competencia}</h2>
        {/* A FRASE É A MESMA da tabela de conferências e da Central de Ajuda:
            as três saem de `mesNoFunil`, e não têm como discordar. */}
        <p className="roteiro-frase">
          {mes.estado === 'fechado' && <Icone nome="ok" tamanho={16} peso="bold" />}
          {mes.frase}
        </p>
      </div>

      <div className="roteiro-passos" role="tablist" aria-label="Os cinco passos do mês" onKeyDown={aoTeclar}>
        {mes.passos.map((p) => (
          <AbaDoPasso key={p.chave} passo={p} escolhido={p.chave === aberto}
                      idAba={idAba(p.chave)} idPainel={idPainel} aoEscolher={() => setEscolha(p.chave)} />
        ))}
      </div>

      <PainelDoPasso passo={passoAberto} idAba={idAba(aberto)} idPainel={idPainel} />

      {(mes.travas.length > 0 || mes.travasDoRepasse.length > 0) && (
        <div className="roteiro-travas">
          {mes.travas.length > 0 && (
            <>
              <p className="roteiro-travas-tit">
                <Icone nome="aviso_alerta" tamanho={15} peso="bold" />
                <strong>O cadastro trava parte do mês</strong>
                <span className="fraco">— a unidade que cai aqui não anda enquanto isto não for preenchido.</span>
              </p>
              <ul>{mes.travas.map((t) => <Trava key={t.camada} trava={t} />)}</ul>
            </>
          )}
          {mes.travasDoRepasse.length > 0 && (
            <p className="fraco roteiro-travas-repasse">
              {mes.travasDoRepasse.length === 1
                ? 'E uma conferência só impede dividir o dinheiro quando ele entrar'
                : `E ${mes.travasDoRepasse.length} conferências só impedem dividir o dinheiro quando ele entrar`}
              {' '}— {mes.travasDoRepasse.map((t) => t.titulo.toLowerCase()).join(', ')}. Estão na tabela abaixo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ==========================================================================
 * A FAIXA DE ORIENTAÇÃO, dentro da tela de trabalho
 * ==========================================================================
 *
 * O funil inteiro mora em Mês; o TRABALHO mora em Contas de luz, em Cobranças e
 * termina em Contas a pagar. Quem está lá dentro perdeu o mapa: a tela não dizia
 * que parte do mês ela é, nem para onde se vai quando ela acaba.
 *
 * UMA FAIXA, E NÃO UM SEGUNDO ROTEIRO. Ela diz que passos são estes, o que vem
 * antes e o que vem depois, e para. O estado ao vivo fica em Mês, a um clique —
 * repetir estado em três telas seria criar três lugares para discordarem.
 */

/** «Ler as contas de luz do mês e Gerar as cobranças». */
const nomes = (ps: readonly PassoNoMapa[]): string =>
  (ps.length === 1 ? ps[0]!.titulo : `${ps.slice(0, -1).map((p) => p.titulo).join(', ')} e ${ps[ps.length - 1]!.titulo}`);

/** O rótulo da tela onde um passo vizinho acontece, quando não é esta mesma. */
function Vizinho({ passo, rotulo }: { passo: PassoNoMapa; rotulo: string }) {
  return (
    <>
      {rotulo} <strong>{passo.numero} · {passo.titulo}</strong>
      {passo.destino && <>, em <Ligacao para={passo.destino.endereco}>{passo.destino.rotulo}</Ligacao></>}.
    </>
  );
}

/** Desenha `null` para tela que não hospeda passo nenhum — e `null` é a resposta:
 *  uma faixa dizendo «esta tela não é passo nenhum» seria ruído em toda tela de
 *  cadastro do sistema. */
export function FaixaDoPasso({ rota }: { rota: string }) {
  const onde = ondeEstouNoMes(rota);
  if (!onde) return null;

  const varios = onde.aqui.length > 1;
  /* A TELA QUE FECHA O MÊS DIZ ISSO (30/09/2026). Contas a pagar mora no setor
     Empresa, e quem chega nela pela barra de lá não sabe que é o fim de um mês
     que começou no Rateio — nem que o passo anterior está do outro lado. */
  const doMes = onde.deOutroSetor ? 'do mês do Rateio' : 'do mês';

  return (
    <div className="cartao faixa-do-passo">
      <p>
        <Icone nome="prontidao" tamanho={15} />{' '}
        <strong>
          {varios ? 'Passos' : 'Passo'}{' '}
          {onde.aqui.map((p) => p.numero).join(' e ')} de {onde.total} {doMes}:
        </strong>{' '}
        {nomes(onde.aqui)}.
        {!onde.depois && <> É aqui que o mês termina: quando o cliente paga, a parte do dono da usina e a
          comissão nascem nesta lista.</>}
      </p>

      <p className="fraco">
        {onde.antes && <Vizinho passo={onde.antes} rotulo="Antes daqui:" />}
        {onde.antes && onde.depois && ' '}
        {onde.depois && <Vizinho passo={onde.depois} rotulo="Depois daqui:" />}
        {' '}<Ligacao para="/pendencias">
          {onde.deOutroSetor ? 'Ver o mês inteiro, na aba Mês do Rateio' : 'Ver o mês inteiro'}
        </Ligacao>
      </p>
    </div>
  );
}
