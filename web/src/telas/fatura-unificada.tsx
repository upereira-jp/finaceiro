// A FATURA UNIFICADA — as duas abas da tela definitiva do dono.
//
// DE ONDE ISTO VEM. `github.com/lealvbl-stack/g3_fatura_unificada`, portado. A
// aba 1 sobe o PDF da fatura da Equatorial e o do boleto Sicoob, extrai por
// modelo de visao e deixa a pessoa conferir campo a campo; a aba 2 e a folha
// imprimivel.
//
// ============================================================================
// A TELA NAO CALCULA, E ESSA E A UNICA DIFERENCA ESTRUTURAL EM RELACAO A ELA
//
// A referencia recalcula tudo no navegador a cada tecla, em float. Aqui cada
// mudanca manda os campos para `POST /faturas/unificada/compor` e recebe a conta
// em CENTAVOS e as duas folhas prontas. Dois motivos, e nenhum e de gosto:
//
//   - a regra 1 proibe float, inclusive em calculo intermediario. Recalcular aqui
//     seria a SEGUNDA implementacao da conta, e as duas divergiriam no dia em que
//     alguem declarasse um desconto abaixo de 1% (medido em `centavos.ts`);
//   - o CRM consome a mesma rota e nao roda React. Composicao na tela seria
//     reescrita na hora de publicar.
//
// O CUSTO E UM ROUND-TRIP POR EDICAO, e ele e amortizado por `atraso` abaixo: a
// composicao so sai 400 ms depois da ultima tecla. Digitar um valor inteiro
// dispara uma chamada, nao oito.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  api, CAMPOS_DA_FATURA_VAZIOS, PARAMETROS_PADRAO, BOLETO_LIDO_VAZIO,
  type CamposDaFatura, type ParametrosDaEmissao, type BoletoLido,
  type ComposicaoUnificada, type LinhaDetalhada, type CampoPersonalizado,
  type RegistroDeFatura,
} from '../api.ts';
import { Aviso, Campo, Icone } from '../ui.tsx';
import { TrianguloDeAviso } from '../icones.tsx';
import { escalaDaPrevia, regraDaPagina, PX_POR_MM } from '../layout-regras.ts';
import { emReais } from '../dinheiro.ts';
import { useLargura } from '../medir-largura.ts';
import {
  ROTULO_DA_ABA, ordemDasAbas, revelaAbaOculta, abaVigente,
  FRAGMENTO_DA_ABA_OCULTA, type AbaDaFatura,
} from '../abas-da-fatura.ts';
import { LOGO_G3_DATA_URI } from '../logo-g3.ts';
import { lerBase64, mimeDo, reenviavel, naMensagem } from '../arquivo.ts';

/** `setState` sem depender do namespace `React` — o transform novo nao o poe em escopo. */
type Ajustar<T> = (f: (anterior: T) => T) => void;

/* ------------------------------------------------------------------ ajudas */

/* `lerBase64`, `mimeDo`, `reenviavel` e `naMensagem` MORAVAM AQUI ate 17/08/2026.
 * Sairam para `web/src/arquivo.ts` quando a aba Faturas passou a subir o PDF do
 * boleto emitido no banco: a segunda tela a precisar delas seria a segunda copia,
 * e `reenviavel` e justamente o tipo de detalhe que se copia com o defeito junto.
 * Nada mudou de comportamento - so de endereco. */

/** Espera `ms` depois da ULTIMA chamada. E o que torna a composicao no servidor
 *  barata o bastante para acontecer a cada tecla. */
function useAtraso<T extends unknown[]>(f: (...a: T) => void, ms: number) {
  const ref = useRef(f);
  ref.current = f;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return useCallback((...a: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(...a), ms);
  }, [ms]);
}

/* ------------------------------------------------------------- o rascunho */

/**
 * O RASCUNHO DA FATURA EM EDICAO, no navegador.
 *
 * DE ONDE VEM: a referencia grava `fatura:rascunho` a cada digitacao e recarrega
 * dele. Ate 14/08 nao haviamos portado, e um F5 apagava os 21 campos lidos, as
 * correcoes a mao, o boleto e os parametros.
 *
 * O CUSTO AQUI E MAIOR QUE LA, e e o que decide: a extracao passa por
 * `POST /faturas/ler-fatura`, que e uma chamada PAGA ao modelo de visao. Perder
 * o rascunho e perder a chamada mais todo o trabalho de conferencia.
 *
 * A CHAVE LEVA O TENANT, e a da referencia nao serve nem em browser: o seletor de
 * empresa da barra troca de tenant SEM recarregar, entao chave global faria a
 * fatura da empresa A reaparecer dentro da empresa B.
 *
 * TUDO AQUI E DEFENSIVO de proposito. `localStorage` pode estar cheio, desligado
 * (navegacao anonima com bloqueio de armazenamento) ou conter lixo de uma versao
 * anterior do formato — e nenhuma dessas tres pode derrubar a tela de faturar.
 * Rascunho e conveniencia; a fatura e o trabalho.
 */
type Rascunho = {
  campos: CamposDaFatura;
  parametros: ParametrosDaEmissao;
  boleto: BoletoLido;
  campos_personalizados: Record<string, string>;
};

const chaveDoRascunho = (tenantId: string | null) =>
  `financeiro.fatura.rascunho.${tenantId ?? 'sem-tenant'}`;

function lerRascunho(tenantId: string | null): Rascunho | null {
  try {
    const cru = localStorage.getItem(chaveDoRascunho(tenantId));
    if (!cru) return null;
    const r = JSON.parse(cru) as Partial<Rascunho>;
    if (!r || typeof r !== 'object' || !r.campos) return null;
    /* O ESPALHAMENTO SOBRE O VAZIO E O QUE SOBREVIVE A UM CAMPO NOVO: um
     * rascunho gravado antes de `outros_encargos` existir voltaria sem ele, e
     * `campos.outros_encargos.trim()` estouraria na primeira composicao. */
    return {
      campos: { ...CAMPOS_DA_FATURA_VAZIOS, ...r.campos,
                historico_consumo: Array.isArray(r.campos.historico_consumo)
                  ? r.campos.historico_consumo : [] },
      parametros: { ...PARAMETROS_PADRAO, ...(r.parametros ?? {}) },
      boleto: { ...BOLETO_LIDO_VAZIO, ...(r.boleto ?? {}),
                instrucoes: Array.isArray(r.boleto?.instrucoes) ? r.boleto.instrucoes : [] },
      campos_personalizados: (r.campos_personalizados ?? {}) as Record<string, string>,
    };
  } catch { return null; }
}

function gravarRascunho(tenantId: string | null, r: Rascunho): void {
  try { localStorage.setItem(chaveDoRascunho(tenantId), JSON.stringify(r)); }
  catch { /* armazenamento cheio ou desligado: a tela continua */ }
}

function apagarRascunho(tenantId: string | null): void {
  try { localStorage.removeItem(chaveDoRascunho(tenantId)); }
  catch { /* idem */ }
}

/**
 * A LINHA DE STATUS — e ela leva ICONE, nao so cor.
 *
 * Ate 14/08 esta area dizia sucesso e falha com `.fu-status.ok` e
 * `.fu-status.alerta`: 12,5px de texto colorido, nada mais. E a restricao 3 do
 * `tema.ts` — *"cor nunca pode ser o unico sinal"* — valendo em todo o sistema
 * menos aqui: a pilula `.marca` tem cor, icone e palavra; o `.aviso` tem cor,
 * icone, faixa e `role`; e estas duas linhas tinham cor.
 *
 * Para quem nao distingue verde de ambar, "Linha valida, digitos conferidos" e
 * "A linha nao confere" eram dois paragrafos cinzentos do mesmo tamanho.
 */
/** `margem` existe porque a referencia usa TRES distancias para a mesma linha de
 *  status: 12px depois da area de envio da fatura, 6px colada no campo que acabou
 *  de ser digitado, 10px no resto. Escrever a margem no JSX seria o comeco de uma
 *  quarta. */
function Status({ tom, margem, children }: {
  tom?: 'ok' | 'alerta'; margem?: 'rente' | 'solto'; children: ReactNode;
}) {
  return (
    <div className={['fu-status', tom, margem].filter(Boolean).join(' ')}
         role={tom === 'alerta' ? 'status' : undefined}>
      {/* `aviso_ok` e nao `sim`: o `sim` esta em `ICONES_QUE_SE_MOVEM` e a regra
          `.ic-sim` anima em qualquer lugar do sistema. O do aviso so anima dentro
          de `.aviso.ok >`, entao aqui ele fica parado — que e o certo para uma
          linha de status que reaparece a cada tecla. */}
      {tom && <Icone nome={tom === 'ok' ? 'aviso_ok' : 'aviso_alerta'} tamanho={14} peso="bold" />}
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------- a tela */

type Aba = AbaDaFatura;

/**
 * `cadastro` e um pedaco que a ABA HOSPEDA, e nao esta tela.
 *
 * A referencia e de um tenant so e por isso tem logo, emissor e chave Pix no
 * codigo. Aqui isso e cadastro por tenant, e ele mora em `documento.tsx` com o
 * estado e as rotas que ja o salvam. Passar como `children` em vez de reimplantar
 * evita a segunda copia dos cartoes - o mesmo motivo de a caixa de pagamento
 * reusar `.faixa-pgto`.
 *
 * O CADASTRO VIROU A TERCEIRA ABA EM 14/08, e nao e so mudanca de lugar. Ele
 * estava dobrado num `<details>` no pe da aba 1, e isso o fazia parecer rodape de
 * uma tela de conferencia. Ele nao e: e o que a folha IMPRIME - emissor, logo,
 * chave Pix, os textos do documento e os campos personalizados -, e "Cadastro de
 * Fatura" e uma funcionalidade nomeada pelo dono, nao um apendice. Como aba, ele
 * ganha endereco proprio, nao rola junto com trinta campos de conferencia, e para
 * de competir com o trabalho do dia por espaco vertical.
 */
export function FaturaUnificada({ logoUrl, tenantId, cadastro }: {
  logoUrl: string | null;
  /** Do `useSessao`. E a chave do rascunho — ver `RASCUNHO`. */
  tenantId: string | null;
  cadastro?: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>('leitura');

  /*
   * A ABA DE CADASTRO SAIU DA BARRA em 14/08/2026 — *"deixe a etapa de cadastro
   * da fatura oculta por enquanto"*. Ela continua alcancavel por
   * `/documento#cadastro`, e o porque de nao ter sido REMOVIDA esta em
   * `abas-da-fatura.ts`: e o unico caminho de tela para o que a folha imprime, e
   * os cinco campos do emissor estavam VAZIOS em producao no dia.
   *
   * O `hashchange` existe para os dois sentidos funcionarem SEM RECARREGAR:
   * colar o fragmento revela, apagar o fragmento esconde. Sem ele, so quem
   * entrasse na pagina ja com o `#` veria a aba, e tirar o `#` nao a fecharia.
   */
  const [revelada, setRevelada] = useState(() => revelaAbaOculta(window.location.hash));
  useEffect(() => {
    const ouvir = () => setRevelada(revelaAbaOculta(window.location.hash));
    window.addEventListener('hashchange', ouvir);
    return () => window.removeEventListener('hashchange', ouvir);
  }, []);

  const ordem = ordemDasAbas(revelada);
  /* Quem estava no cadastro e apagou o `#` cai na primeira — sem isso a barra
   * fica com nenhuma aba marcada e nenhuma no caminho do Tab. */
  const abaAtual = abaVigente(aba, ordem);
  const rascunho = lerRascunho(tenantId);
  const [campos, setCampos] = useState<CamposDaFatura>(rascunho?.campos ?? CAMPOS_DA_FATURA_VAZIOS);
  const [parametros, setParametros] = useState<ParametrosDaEmissao>(rascunho?.parametros ?? PARAMETROS_PADRAO);
  const [boleto, setBoleto] = useState<BoletoLido>(rascunho?.boleto ?? BOLETO_LIDO_VAZIO);
  const [personalizados, setPersonalizados] = useState<Record<string, string>>(
    rascunho?.campos_personalizados ?? {});

  const [composicao, setComposicao] = useState<ComposicaoUnificada | null>(null);
  const [erroDaComposicao, setErroDaComposicao] = useState<string | null>(null);

  const [statusFatura, setStatusFatura] = useState(
    rascunho ? 'Rascunho recuperado — os campos abaixo são os que estavam em edição.' : 'Nenhum arquivo enviado.');
  const [statusBoleto, setStatusBoleto] = useState('Nenhum boleto enviado.');
  const [lendoFatura, setLendoFatura] = useState(false);
  const [lendoBoleto, setLendoBoleto] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [statusRegistro, setStatusRegistro] = useState<string | null>(null);
  /* SOBE A CADA ESCRITA em `fatura_unificada_registrada` — registro novo ou
   * exclusao. E o que manda `FaturasRegistradas` reler a lista sem que esta tela
   * guarde uma copia dela para manter em dia. */
  const [registrosVersao, setRegistrosVersao] = useState(0);

  /*
   * ==========================================================================
   * O RASCUNHO PERSISTE, e ate 14/08 um F5 apagava a fatura inteira.
   *
   * Todo o estado desta aba vivia em `useState` sem hidratacao nem gravacao: os
   * 21 campos lidos, as correcoes a mao, o boleto e os parametros sumiam num
   * recarregamento acidental. Do lado de ca isso custa mais que na referencia,
   * que grava `fatura:rascunho` desde sempre — aqui a extracao passa por uma
   * chamada PAGA ao modelo de visao, entao perder o rascunho e perder dinheiro
   * mais todo o trabalho de conferencia.
   *
   * A CHAVE LEVA O TENANT, e a da referencia (`fatura:rascunho`, sem tenant) nao
   * serve nem em browser: o seletor de empresa da barra troca de tenant SEM
   * recarregar a pagina, entao uma chave global faria a fatura da empresa A
   * reaparecer dentro da empresa B.
   *
   * NAO E DADO DE NEGOCIO, e por isso nao abre migration nem cai nas regras 2, 3
   * e 9: e rascunho de EDICAO, local, do navegador de quem esta digitando. O que
   * vira dado de negocio e o REGISTRO (`POST /faturas/unificada/registros`), que
   * tem tabela, policy e trilha.
   */
  useEffect(() => {
    gravarRascunho(tenantId, { campos, parametros, boleto, campos_personalizados: personalizados });
  }, [tenantId, campos, parametros, boleto, personalizados]);

  /* A composicao pedida ao servidor. `pedido` cresce a cada chamada e a resposta
   * so e aceita se for a do ULTIMO pedido: sem isso, uma resposta lenta de uma
   * edicao antiga sobrescreve a nova, e a tela mostra o valor de duas teclas
   * atras. E o modo de falha classico de composicao remota por digitacao. */
  const pedido = useRef(0);
  const compor = useCallback(async (
    c: CamposDaFatura, p: ParametrosDaEmissao, b: BoletoLido, cp: Record<string, string>,
  ) => {
    const meu = ++pedido.current;
    try {
      /*
       * O BOLETO VIAJA INTEIRO desde 14/08, e ate aqui iam QUATRO dos sete
       * campos. Os tres que ficavam de fora — `beneficiario`, `vencimento` e
       * `valor` — sao justamente os que respondem as tres perguntas de
       * conferencia da referencia, e por isso as tres comparacoes viviam neste
       * arquivo, em float, invisiveis para o CRM que consome a mesma rota.
       */
      const r = await api.post<ComposicaoUnificada>('/faturas/unificada/compor', {
        campos: c, parametros: p, boleto: b, campos_personalizados: cp,
      });
      if (meu !== pedido.current) return;
      setComposicao(r); setErroDaComposicao(null);
    } catch (e) {
      if (meu !== pedido.current) return;
      setErroDaComposicao(naMensagem(e));
    }
  }, []);

  const comporComAtraso = useAtraso(compor, 400);
  useEffect(() => { comporComAtraso(campos, parametros, boleto, personalizados); },
            [campos, parametros, boleto, personalizados, comporComAtraso]);

  const mudar = (k: keyof CamposDaFatura) => (v: string) =>
    setCampos((s) => ({ ...s, [k]: v }));

  async function enviarFatura(f: File) {
    setLendoFatura(true);
    setStatusFatura(`Lendo ${f.name}…`);
    try {
      const lido = await api.post<CamposDaFatura>('/faturas/ler-fatura', {
        conteudo_base64: await lerBase64(f), tipo: mimeDo(f),
      });
      setCampos({ ...CAMPOS_DA_FATURA_VAZIOS, ...lido });
      setStatusFatura('Dados extraídos. Confira os campos ao lado.');
    } catch (e) {
      setStatusFatura(`Não foi possível ler: ${naMensagem(e)} Preencha os campos manualmente.`);
    } finally { setLendoFatura(false); }
  }

  async function enviarBoleto(f: File) {
    setLendoBoleto(true);
    setStatusBoleto(`Lendo ${f.name}…`);
    try {
      const lido = await api.post<BoletoLido>('/faturas/ler-boleto', {
        conteudo_base64: await lerBase64(f), tipo: mimeDo(f),
      });
      setBoleto(lido);
      const n = lido.linha_digitavel.replace(/\D/g, '').length;
      setStatusBoleto(n === 47
        ? 'Boleto lido · linha digitável com 47 dígitos.'
        : `Boleto lido, mas a linha saiu com ${n} dígitos — corrija abaixo.`);
    } catch (e) {
      setStatusBoleto(`Não foi possível ler: ${naMensagem(e)} Preencha manualmente.`);
    } finally { setLendoBoleto(false); }
  }

  /**
   * REGISTRAR A FATURA — o que alimenta o "Você já economizou" do mês que vem.
   *
   * `upsert` pela chave (UC, competência) do lado do servidor: registrar duas
   * vezes o mesmo mês da mesma UC não produz duas economias, produz uma correção.
   * Sem isso, quem conferisse um número e registrasse de novo dobraria a economia
   * acumulada impressa na folha do cliente.
   */
  async function registrar() {
    setRegistrando(true);
    setStatusRegistro(null);
    try {
      await api.post('/faturas/unificada/registros', {
        campos, parametros, boleto, campos_personalizados: personalizados,
      });
      setStatusRegistro(`Fatura registrada para a UC ${campos.unidade_consumidora} `
                      + `em ${campos.mes_referencia}. O desconto entra na economia acumulada.`);
      setRegistrosVersao((v) => v + 1);
      /* Recompoe: a economia acumulada mudou, e ela sai impressa na folha 2. */
      void compor(campos, parametros, boleto, personalizados);
    } catch (e) {
      setStatusRegistro(`Não foi possível registrar: ${naMensagem(e)}`);
    } finally { setRegistrando(false); }
  }

  /**
   * NOVA FATURA. Apaga o RASCUNHO e preserva os REGISTROS — é o que a referência
   * faz desde `36e964e`, e o motivo é que as duas coisas têm vidas diferentes: o
   * rascunho é o que está em edição agora; os registros são a série que produz a
   * economia acumulada.
   */
  function novaFatura() {
    if (!window.confirm('Começar uma nova fatura? Os dados em edição serão apagados. '
                      + 'As faturas já registradas ficam.')) return;
    setCampos(CAMPOS_DA_FATURA_VAZIOS);
    setBoleto(BOLETO_LIDO_VAZIO);
    setParametros(PARAMETROS_PADRAO);
    setPersonalizados({});
    setComposicao(null);
    setStatusFatura('Nenhum arquivo enviado.');
    setStatusBoleto('Nenhum boleto enviado.');
    setStatusRegistro(null);
    apagarRascunho(tenantId);
    setAba('leitura');
    window.scrollTo(0, 0);
  }

  const irPara = (a: Aba) => { setAba(a); window.scrollTo(0, 0); };

  return (
    <>
      {/* O `#cadastro` REVELA, nao seleciona: quem esta nele e clica em "1 ·
          Leitura" continua com a aba de cadastro na barra, porque o fragmento
          continua no endereco. Sao duas perguntas diferentes — qual aba EXISTE e
          qual esta ABERTA — e misturar as duas faria a aba sumir debaixo de quem
          so quis olhar a etapa anterior. */}
      <Abas atual={abaAtual} ordem={ordem} ao={irPara}
            acao={{ texto: 'Nova fatura', ao: novaFatura }} />

      {erroDaComposicao && (
        <div className="naoimprime"><Aviso tipo="erro">
          Não foi possível compor a fatura: {erroDaComposicao}
        </Aviso></div>
      )}

      <div id={`fu-painel-${abaAtual}`} role="tabpanel" aria-labelledby={`fu-aba-${abaAtual}`}>
        {abaAtual === 'leitura' && (
          <AbaDeLeitura
            campos={campos} mudar={mudar} setCampos={setCampos}
            parametros={parametros} setParametros={setParametros}
            boleto={boleto} setBoleto={setBoleto}
            personalizados={personalizados} setPersonalizados={setPersonalizados}
            composicao={composicao}
            statusFatura={statusFatura} statusBoleto={statusBoleto}
            lendoFatura={lendoFatura} lendoBoleto={lendoBoleto}
            enviarFatura={enviarFatura} enviarBoleto={enviarBoleto}
            registrar={registrar} registrando={registrando} statusRegistro={statusRegistro}
            registrosVersao={registrosVersao}
            aoApagarRegistro={() => {
              setRegistrosVersao((v) => v + 1);
              /* A folha 2 imprime a economia acumulada: apagar um registro a muda,
               * e sem recompor a tela seguiria mostrando a soma antiga. */
              void compor(campos, parametros, boleto, personalizados);
            }}
            irParaEmissao={() => irPara('emissao')}
            novaFatura={novaFatura}
          />
        )}
        {/* A PREVIA EM LOTE SAIU DA TELA INTEIRA em 14/08 (tarde), e nao so desta
            aba — ver o bloco no pe de `documento.tsx`. Enquanto ela existiu, o
            lugar dela foi decidido por um defeito medido que vale registrar,
            porque a causa continua viva: `AbaDeEmissao` monta `<div
            id="documento">`, o CSS de impressao e seletor de `id`, e seletor de
            `id` casa TODOS os elementos com aquele id. Duas folhas com o mesmo id
            na arvore imprimem juntas. Hoje so existe uma — e e por isso que
            qualquer coisa que volte a montar `id="documento"` tem de vir com o
            teste `W-imprime-uma-folha-so` junto. */}
        {abaAtual === 'emissao' && (
          <AbaDeEmissao composicao={composicao} logoUrl={logoUrl}
                        irParaPainel={() => irPara('leitura')} />
        )}
        {abaAtual === 'cadastro' && cadastro}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- as abas
   QUAIS SAO, QUAIS APARECEM e COMO SE CHEGA NA OCULTA agora moram em
   `abas-da-fatura.ts`, e o motivo esta escrito la: nada dentro de um `.tsx` e
   verificavel — o runner do `web/` nao le JSX. Aqui ficou o que a barra MOSTRA. */

/**
 * AS ABAS SAO UM `tablist` DE VERDADE, e nao tres botoes com uma classe.
 *
 * Ate 14/08 elas eram `<button className={... ? 'fu-aba ativa' : 'fu-aba'}>` — o
 * estado morava so numa CLASSE CSS. Duas consequencias, e nenhuma aparece
 * olhando a tela:
 *
 *   - leitor de tela nao anunciava "aba 2 de 3, selecionada". Anunciava tres
 *     botoes soltos, sem dizer que sao alternativas entre si nem qual esta em uso;
 *   - a seta do teclado nao andava entre elas. `Tab` visitava as tres uma a uma,
 *     que e o padrao de barra de botoes, e nao o de abas.
 *
 * Agora o estado e `aria-selected`, e e ELE que o CSS le (`.fu-aba[aria-selected]`).
 * Um so lugar diz qual aba esta aberta, e ele e o que a tecnologia assistiva ja
 * entende — em vez de uma classe que so o CSS entende e um atributo que so o
 * leitor entende, com a chance de os dois discordarem.
 */
function Abas({ atual, ordem, ao, acao }: {
  atual: Aba; ordem: readonly Aba[];
  ao: (a: Aba) => void; acao: { texto: string; ao: () => void };
}) {
  /* Setas andam, Home e End vao aos extremos — o padrao WAI-ARIA de `tablist`.
     A LISTA E A `ordem` RECEBIDA e nao mais uma constante do modulo: com a aba
     oculta fora da barra, uma seta que andasse pela lista completa levaria a um
     painel que a barra nao desenha. */
  const teclado = (e: React.KeyboardEvent) => {
    const i = ordem.indexOf(atual);
    const destino =
      e.key === 'ArrowRight' ? (i + 1) % ordem.length
      : e.key === 'ArrowLeft' ? (i - 1 + ordem.length) % ordem.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? ordem.length - 1
      : -1;
    if (destino < 0) return;
    e.preventDefault();
    ao(ordem[destino]!);
  };

  return (
    <div className="fu-abas naoimprime" role="tablist" aria-label="Etapas da fatura"
         onKeyDown={teclado}>
      {ordem.map((a, i) => (
        <Fragment key={a}>
          {i > 0 && <span className="fu-aba-traco" aria-hidden="true" />}
          <button type="button" role="tab" id={`fu-aba-${a}`} className="fu-aba"
                  aria-selected={atual === a} aria-controls={`fu-painel-${a}`}
                  /* So a aba ativa fica no caminho do Tab: dentro de um tablist
                     quem anda entre as abas e a seta, e o Tab entra e SAI. */
                  tabIndex={atual === a ? 0 : -1}
                  onClick={() => ao(a)}>
            {ROTULO_DA_ABA[a]}
          </button>
        </Fragment>
      ))}
      <span style={{ flex: 1 }} />
      {/* `fu-acao` E NAO `fu-aba`, e ate 14/08 era a segunda. Ela pegava o desenho
          de aba — inclusive o fundo laranja se alguem a marcasse — para um botao
          que nao seleciona painel nenhum. Na referencia ela e um contorno navy
          numa faixa propria acima da grade; aqui e o mesmo contorno, no fim da
          mesma linha, que e a mesma posicao na tela. */}
      <button type="button" className="fu-acao" onClick={acao.ao}>{acao.texto}</button>
    </div>
  );
}

/* ============================================================ aba 1: leitura */

type PropsDeLeitura = {
  campos: CamposDaFatura;
  mudar: (k: keyof CamposDaFatura) => (v: string) => void;
  setCampos: Ajustar<CamposDaFatura>;
  parametros: ParametrosDaEmissao;
  setParametros: Ajustar<ParametrosDaEmissao>;
  boleto: BoletoLido;
  setBoleto: Ajustar<BoletoLido>;
  personalizados: Record<string, string>;
  setPersonalizados: Ajustar<Record<string, string>>;
  composicao: ComposicaoUnificada | null;
  statusFatura: string; statusBoleto: string;
  lendoFatura: boolean; lendoBoleto: boolean;
  enviarFatura: (f: File) => void; enviarBoleto: (f: File) => void;
  registrar: () => void; registrando: boolean; statusRegistro: string | null;
  /** Sobe de 1 a cada escrita (registro novo ou exclusao). E o que faz a lista de
   *  `FaturasRegistradas` recarregar sem que a tela guarde copia dela. */
  registrosVersao: number;
  aoApagarRegistro: () => void;
  irParaEmissao: () => void;
  novaFatura: () => void;
};

function AbaDeLeitura(p: PropsDeLeitura) {
  const c = p.composicao?.conta;

  /*
   * ==========================================================================
   * A CONFERENCIA DO BOLETO VEM PRONTA DO SERVIDOR desde 14/08.
   *
   * Ela morava aqui — as mesmas tres perguntas da referencia, vencimento, valor e
   * beneficiario — e tinha dois defeitos, um de correcao e um de alcance:
   *
   *   1. A COMPARACAO DE VALOR PASSAVA POR FLOAT, e sumia em silencio.
   *      `Math.round(Number(valor.replace(',', '.')) * 100)` — e `String.replace`
   *      com string troca so a PRIMEIRA ocorrencia, entao "1.234,56" virava
   *      "1.234.56" e `Number` disso e `NaN`. O guarda `Number.isFinite` fazia o
   *      alerta **nao sair**: quem digitasse no formato que o proprio campo
   *      sugere perdia a conferencia inteira, sem aviso nenhum;
   *   2. O CRM NAO AS RECEBIA. Ele consome a mesma rota e nao roda React.
   *
   * E o servidor sabe MAIS: ele tambem compara valor e vencimento contra os 44
   * digitos do codigo de barras (`conferirBoleto`), que e a conferencia
   * aritmetica que so existia no fluxo antigo. Sao quatro perguntas agora, e o
   * beneficiario e conferido contra a razao social CADASTRADA em vez de contra
   * `/g3/i`, que era o nome de uma empresa cravado num sistema multi-tenant.
   */
  const alertas = p.composicao?.folha2.pagamento.alertas ?? [];

  const secoes: Array<{ titulo: string; campos: Array<[string, keyof CamposDaFatura, string?]> }> = [
    { titulo: 'Cliente', campos: [
      ['Nome / razão social', 'cliente'], ['CPF / CNPJ', 'documento'],
      ['Unidade consumidora', 'unidade_consumidora'], ['Endereço', 'endereco'],
      ['Classificação', 'classificacao'],
    ] },
    { titulo: 'Período', campos: [
      ['Mês de referência', 'mes_referencia', 'MM/AAAA'], ['Emissão', 'data_emissao'],
      ['Vencimento', 'vencimento'], ['Leitura anterior', 'leitura_anterior'],
      ['Leitura atual', 'leitura_atual'], ['Dias faturados', 'dias_faturados'],
    ] },
    { titulo: 'Energia compensada', campos: [
      ['Energia compensada (kWh)', 'energia_compensada_kwh'],
      ['Tarifa cheia (R$/kWh)', 'tarifa_kwh', 'ex.: 1,185396'],
    ] },
    { titulo: 'Repasses Equatorial', campos: [
      ['Consumo não compensado (kWh)', 'consumo_nao_compensado_kwh'],
      ['Consumo não compensado (R$)', 'consumo_nao_compensado_valor'],
      ['Iluminação pública (R$)', 'iluminacao_publica'],
      ['Bandeira tarifária', 'bandeira_tarifaria'],
      ['Bandeira (R$)', 'bandeira_valor'],
      ['Outros encargos (R$)', 'outros_encargos'],
      ['Total Equatorial (R$)', 'valor_total_equatorial'],
    ] },
  ];


  return (
    <div className="fu-grade naoimprime">
      <div className="fu-coluna">
        {/* --------------------------------------------- o PDF da Equatorial */}
        <div className="cartao">
          <div className="fu-rotulo">Fatura da Equatorial Goiás</div>
          <label className="fu-solta">
            <input type="file" accept="application/pdf,image/*"
                   disabled={p.lendoFatura}
                   onChange={(e) => reenviavel(e, p.enviarFatura)} />
            <div className="fu-solta-titulo">Enviar fatura da distribuidora</div>
            <div className="fu-solta-sub">PDF ou foto/scan — os dados são extraídos e preenchidos ao lado</div>
          </label>
          <div className="fu-status solto">{p.statusFatura}</div>
        </div>

        {/* ------------------------------------------ o boleto a gerar */}
        <div className="fu-painel">
          <div className="fu-painel-rot">Boleto a gerar no banco</div>
          <div className="fu-painel-total">
            {p.composicao?.folha1.total.valor ?? '—'}
          </div>
          <div className="fu-painel-sub">
            Vencimento {p.campos.vencimento || '—'} · UC {p.campos.unidade_consumidora || '—'}
          </div>
          <div className="fu-painel-par">
            <div>
              <div className="fu-painel-cap">Energia G3 (com desconto)</div>
              <div className="fu-painel-val">{emReais(c?.energia_g3_centavos ?? null)}</div>
            </div>
            <div>
              <div className="fu-painel-cap">Repasses Equatorial</div>
              <div className="fu-painel-val">{emReais(c?.total_equatorial_centavos ?? null)}</div>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------- o boleto */}
        <div className="cartao">
          <div className="fu-rotulo">Boleto Sicoob</div>
          {/* `curta`: na referencia esta area tem 20px de padding e titulo de 18px,
              contra 24px e 19px na da fatura. O envio da fatura e o primeiro ato
              da tela e e maior de proposito. */}
          <label className="fu-solta curta">
            <input type="file" accept="application/pdf,image/*"
                   disabled={p.lendoBoleto}
                   onChange={(e) => reenviavel(e, p.enviarBoleto)} />
            <div className="fu-solta-titulo">Enviar boleto do banco</div>
            <div className="fu-solta-sub">PDF ou foto — linha digitável e PIX são lidos do arquivo</div>
          </label>
          <div className="fu-status">{p.statusBoleto}</div>

          {/* `com-regua`: esta secao se separa por uma regua EM CIMA e titulo
              apagado; as do cartao da direita se anunciam por titulo LARANJA com
              regua embaixo. Sao as duas formas da referencia, e eram uma so aqui. */}
          <div className="fu-secao com-regua">
            <div className="fu-rotulo">Conferência do boleto</div>
            {/* `Aviso` E NAO UMA CLASSE PROPRIA. Ate 14/08 esta area desenhava a
                divergencia com `.fu-alerta` — faixa de 3px, raio so a direita,
                sem icone —, enquanto as treze telas do sistema desenham o mesmo
                fato com `.aviso`: faixa de 4px, icone na cor do estado e texto
                em `--texto`. Duas gramaticas para "atencao a isto" numa tela so
                e o tipo de divergencia que este porte existe para tirar. */}
            {alertas.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
            {alertas.length === 0 && <div className="fu-status">Nada a apontar.</div>}

            {/* DUAS GRADES E NAO UMA: a referencia poe vencimento e valor lado a
                lado (`1fr 1fr`) e o nosso numero sozinho na linha de baixo
                (`1fr`). O `auto-fit minmax(190px)` daqui os punha os tres em fila
                ou os tres empilhados, conforme a largura — nunca 2 + 1. */}
            <div className="campos duas">
              <Campo rotulo="Vencimento no boleto" valor={p.boleto.vencimento}
                     ao={(v) => p.setBoleto((s) => ({ ...s, vencimento: v }))} dica="DD/MM/AAAA" />
              <Campo rotulo="Valor no boleto" valor={p.boleto.valor}
                     ao={(v) => p.setBoleto((s) => ({ ...s, valor: v }))} dica="0,00" />
            </div>
            <div className="campos uma">
              <Campo rotulo="Nosso número" valor={p.boleto.nosso_numero}
                     ao={(v) => p.setBoleto((s) => ({ ...s, nosso_numero: v }))} dica="1-3" />
            </div>
            <div className="fu-status">Beneficiário lido: {p.boleto.beneficiario || '—'}</div>

            {/* `fu-legenda` E NAO `fu-rotulo`. Na referencia estas tres nao sao
                rotulo em caixa alta condensada: sao 13px de Barlow apagada, com
                a margem `14px 0 3px` que a classe carrega. */}
            <div className="fu-legenda">
              Instruções do boleto <span className="fraco">· uma por linha</span>
            </div>
            <textarea className="fu-area" rows={4} value={p.boleto.instrucoes.join('\n')}
                      placeholder="A partir 18/08/2026 Juros 0,03%/dia."
                      onChange={(e) => p.setBoleto((s) => ({
                        ...s, instrucoes: e.target.value.split('\n'),
                      }))} />

            <div className="fu-legenda">Linha digitável</div>
            <textarea className="fu-area mono" rows={2} value={p.boleto.linha_digitavel}
                      placeholder="47 dígitos"
                      onChange={(e) => p.setBoleto((s) => ({ ...s, linha_digitavel: e.target.value }))} />
            <StatusDaLinha
              digitos={p.boleto.linha_digitavel.replace(/\D/g, '')}
              motivo={p.composicao?.folha2.pagamento.barras_motivo ?? null}
              desenhou={Boolean(p.composicao?.folha2.pagamento.barras)} />

            <div className="fu-legenda">PIX copia e cola</div>
            {/* `miudo`: 12px contra os 13px da linha digitavel. E a diferenca da
                referencia, e ela tem motivo — o payload EMV tem tres vezes mais
                caracteres e a um ponto a mais nao cabe em tres linhas. */}
            <textarea className="fu-area mono miudo" rows={3} value={p.boleto.pix_copia_e_cola}
                      placeholder="00020101…"
                      onChange={(e) => p.setBoleto((s) => ({
                        ...s, pix_copia_e_cola: e.target.value.replace(/\s+/g, ''),
                      }))} />
            <div className="fu-status rente">
              {p.composicao?.folha2.pagamento.qr
                ? `Payload EMV reconhecido · QR gerado (versão ${p.composicao.folha2.pagamento.qr.versao}).`
                : p.composicao?.folha2.pagamento.qr_motivo
                  ? `O QR não pôde ser desenhado: ${p.composicao.folha2.pagamento.qr_motivo}`
                  : 'Sem PIX — o documento sai apenas com boleto.'}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- parâmetros
            OS DOIS CAMPOS TEM A BORDA FORTE E O FUNDO CREME, e sao os unicos da
            referencia assim. Nao e enfeite: os trinta campos de cima sao dado
            LIDO da fatura e se conferem; estes dois sao DECISAO de quem opera, e
            saem desenhados como controle, nao como valor. */}
        <div className="cartao">
          <div className="fu-rotulo">Parâmetros</div>
          <div className="campos parametros">
            <Campo rotulo="Desconto (%)" valor={p.parametros.percentual_desconto}
                   ao={(v) => p.setParametros((s) => ({ ...s, percentual_desconto: v }))} />
            <Campo rotulo="Fator CO₂ (kg/kWh)" valor={p.parametros.fator_emissao}
                   ao={(v) => p.setParametros((s) => ({ ...s, fator_emissao: v }))} />
          </div>
          <p className="sub">Fator médio da margem de operação do SIN — MCTI/SIRENE.</p>
        </div>

        {/* -------------------------------------- as faturas registradas nesta UC */}
        <FaturasRegistradas
          uc={p.campos.unidade_consumidora} versao={p.registrosVersao}
          registrar={p.registrar} registrando={p.registrando}
          statusRegistro={p.statusRegistro} aoApagar={p.aoApagarRegistro} />
      </div>

      {/* --------------------------------------------- conferência dos dados */}
      <div className="cartao">
        <div className="fu-cabeca">
          <h2>Conferência dos dados</h2>
          <span className="fraco">A extração preenche, você confere</span>
        </div>

        {secoes.map((s) => (
          <div key={s.titulo} className="fu-secao">
            <div className="fu-secao-tit">{s.titulo}</div>
            <div className="campos">
              {s.campos.map(([rotulo, chave, dica]) => (
                <Campo key={chave} rotulo={rotulo} dica={dica}
                       valor={String(p.campos[chave] ?? '')} ao={p.mudar(chave)} />
              ))}
            </div>
          </div>
        ))}

        {/* O MOTIVO VEM DE QUEM TOMOU A DECISAO. Ate 14/08 a tela reimplantava a
            condicao com `Boolean(kwh.trim()) && !tarifa.trim()` — e o prompt do
            extrator manda *"se a linha CONSUMO NAO COMPENSADO nao existir,
            retorne 0"*, entao `tarifa_kwh` chega `"0.000000"`, que e truthy. O
            aviso NUNCA aparecia no caminho da extracao, que e o unico em que ele
            importa. Agora quem decide se os cartoes saem e quem diz por que. */}
        {p.composicao?.folha1.cartoes_motivo && (
          <Aviso tipo="alerta">{p.composicao.folha1.cartoes_motivo}</Aviso>
        )}

        <div className="fu-secao">
          <div className="fu-secao-tit">Histórico de consumo lido no PDF</div>
          <div className="fu-hist-edit">
            {p.campos.historico_consumo.map((h, i) => (
              <div key={`${h.mes}-${i}`} className="fu-hist-item">
                <span className="fu-hist-mes">{h.mes}</span>
                <input className="fu-hist-kwh" value={h.kwh}
                       onChange={(e) => {
                         const v = e.target.value;
                         p.setCampos((s) => ({
                           ...s,
                           historico_consumo: s.historico_consumo.map(
                             (x, j) => (j === i ? { mes: x.mes, kwh: v } : x)),
                         }));
                       }} />
                <span className="fu-hist-un">kWh</span>
              </div>
            ))}
          </div>
          <div className="fu-status">
            {p.campos.historico_consumo.length === 0
              ? 'Sem histórico lido — o gráfico de consumo fica oculto.'
              : p.composicao?.folha2.historico_motivo
                ?? `${p.campos.historico_consumo.length} meses lidos do PDF.`}
          </div>
        </div>

        {/* ------------------------------------- os campos que o tenant inventou
            SO OS DE ORIGEM `variavel` aparecem aqui: os `fixo` vivem no cadastro
            e saem iguais em toda fatura do modelo. Repeti-los nesta tela pediria
            que alguem redigitasse, a cada fatura, um valor que o sistema ja
            conhece — e a divergencia entre o digitado e o cadastrado sairia
            impressa sem ninguem saber qual dos dois vale. */}
        <CamposDoTenant valores={p.personalizados} ao={p.setPersonalizados} />

        {/*
          OS DOIS BOTOES DO PE SAO OS DA REFERENCIA, e "Registrar" nao esta mais
          aqui — ele desceu para o cartao "Faturas registradas nesta UC", na
          coluna da esquerda, que e onde a referencia o poe.

          A MUDANCA NAO E DE LUGAR, E DE LEITURA. Registrar e imprimir eram dois
          botoes lado a lado, do mesmo tamanho, no mesmo canto — e sao atos de
          natureza diferente: imprimir e conferencia e nao escreve nada;
          registrar ESCREVE no banco e muda o que a folha do MES QUE VEM vai
          afirmar (o "Voce ja economizou" da folha 2). Junto da lista do que ja
          foi registrado, o botao mostra o efeito antes do clique.
        */}
        {/* SEM ICONE NOS DOIS, e a referencia nao tem nenhum na interface inteira
            — o unico SVG dela e a logo. O rotulo carrega o sentido sozinho aqui;
            onde o icone e o que impede a COR de ser o unico sinal (as linhas de
            status), ele ficou. Ver a nota 1 no cabecalho da secao em `estilo.ts`. */}
        <div className="fu-pe">
          <button className="primario" onClick={p.irParaEmissao} disabled={!p.composicao}>
            Ver a fatura do cliente
          </button>
          <button onClick={p.novaFatura}>Nova fatura</button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * AS FATURAS JA REGISTRADAS NESTA UC — o cartao que faltava, 14/08/2026.
 *
 * A REFERENCIA TEM ESTE CARTAO desde `36e964e` e nos nao tinhamos NENHUMA tela
 * que listasse registro. Ele e o quinto e ultimo da coluna da esquerda: mes,
 * total e um "excluir" por linha, e o botao de registrar embaixo.
 *
 * E ELE NAO CUSTOU ROTA NOVA, o que e a medida de que a lacuna era de tela e nao
 * de sistema: `GET /faturas/unificada/registros?unidade_consumidora=`,
 * `POST` e `DELETE /faturas/unificada/registros/:id` existem desde a migration
 * 29 e **as duas primeiras nao tinham um chamador de produção sequer** — o POST
 * era chamado por um botao, o GET por ninguem, e o DELETE por ninguem.
 *
 * POR QUE A LISTA IMPORTA MAIS DO QUE PARECE. A soma dos `desconto_centavos`
 * desta serie e o *"Voce ja economizou"* impresso na folha 2 do cliente. Ate
 * hoje, o unico jeito de saber o que compunha aquele numero era consultar o
 * banco: registrar duas vezes o mesmo mes era corrigido pelo `upsert` do
 * servidor, mas registrar o mes ERRADO nao tinha desfazer na tela. Agora tem.
 *
 * A CHAVE DE RECARGA E `versao` E NAO UM `useEffect` NO `statusRegistro`: o
 * status e texto para humano e muda por motivos que nao sao escrita (uma falha,
 * por exemplo). Quem sobe a versao e quem escreveu.
 */
function FaturasRegistradas({ uc, versao, registrar, registrando, statusRegistro, aoApagar }: {
  uc: string; versao: number;
  registrar: () => void; registrando: boolean; statusRegistro: string | null;
  aoApagar: () => void;
}) {
  const [lista, setLista] = useState<RegistroDeFatura[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const alvo = uc.trim();

  useEffect(() => {
    if (!alvo) { setLista(null); setErro(null); return; }
    let vivo = true;
    api.get<RegistroDeFatura[]>(
      `/faturas/unificada/registros?unidade_consumidora=${encodeURIComponent(alvo)}`)
      .then((r) => { if (vivo) { setLista(r); setErro(null); } })
      .catch((e) => { if (vivo) { setLista([]); setErro(naMensagem(e)); } });
    return () => { vivo = false; };
  }, [alvo, versao]);

  async function apagar(r: RegistroDeFatura) {
    /* A CONFIRMACAO NOMEIA O QUE SAI. A referencia apaga a linha direto; aqui a
     * linha e dado de negocio com trilha, e o que ela carrega — o desconto — sai
     * da economia impressa na folha do cliente no mes que vem. */
    if (!window.confirm(`Excluir o registro de ${r.competencia} da UC ${r.numero_uc}? `
                      + `O desconto de ${emReais(r.desconto_centavos)} sai da economia acumulada.`)) return;
    try {
      await api.del(`/faturas/unificada/registros/${r.id}`);
      aoApagar();
    } catch (e) { setErro(naMensagem(e)); }
  }

  const acumulado = (lista ?? []).reduce((a, r) => a + r.desconto_centavos, 0);

  return (
    <div className="cartao">
      <div className="fu-rotulo">Faturas registradas nesta unidade</div>

      {!alvo && <div className="fu-status">Informe a unidade consumidora para ver o histórico.</div>}
      {alvo && lista == null && <div className="fu-status">Lendo os registros…</div>}
      {alvo && lista?.length === 0 && !erro && (
        <div className="fu-status">Nenhuma fatura registrada ainda.</div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {(lista ?? []).map((r) => (
        <div key={r.id} className="fu-registro">
          <span>{r.competencia}</span>
          <span className="fu-registro-dir">
            <span className="fu-registro-val">{emReais(r.total_centavos)}</span>
            <button type="button" className="fu-texto" onClick={() => void apagar(r)}>excluir</button>
          </span>
        </div>
      ))}

      {/* O ICONE SO EXISTE ENQUANTO ESCREVE. Em repouso a referencia nao tem
          nenhum, e o rotulo basta; durante a gravacao o giro e a unica coisa que
          diz que o clique foi recebido — sem ele o botao fica so desabilitado, e
          desabilitado tambem e o estado de "faltou a UC". */}
      <button className="fu-largo fu-contorno" onClick={registrar}
              disabled={registrando || !alvo}>
        {registrando && <Icone nome="carregando" tamanho={15} />}
        {registrando ? 'Registrando…' : 'Registrar este mês'}
      </button>
      {statusRegistro && (
        <Aviso tipo={statusRegistro.startsWith('Não') ? 'erro' : 'ok'}>{statusRegistro}</Aviso>
      )}
      {(lista?.length ?? 0) > 1 && (
        <p className="sub">
          Economia acumulada de <strong>{emReais(acumulado)}</strong> em{' '}
          <strong>{lista!.length}</strong> faturas — é o número impresso na folha 2.
        </p>
      )}
    </div>
  );
}

/**
 * OS CAMPOS PERSONALIZADOS DE ORIGEM `variavel`, digitados por fatura.
 *
 * Eles sao cadastrados na aba 3 e preenchidos aqui. A lista vem do servidor a
 * cada montagem da aba: um campo criado no cadastro precisa aparecer sem
 * recarregar a pagina, e a tela nao guarda copia do cadastro por isso mesmo.
 *
 * Sem nenhum campo `variavel` cadastrado, a secao inteira nao existe — e o caso
 * normal, e uma secao vazia dizendo "nenhum campo" seria ruido permanente numa
 * tela que ja tem trinta campos.
 */
function CamposDoTenant({ valores, ao }: {
  valores: Record<string, string>; ao: Ajustar<Record<string, string>>;
}) {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  useEffect(() => {
    let vivo = true;
    api.get<CampoPersonalizado[]>('/cobranca/campos-personalizados')
      .then((r) => { if (vivo) setCampos(r.filter((c) => c.origem === 'variavel' && c.visivel)); })
      .catch(() => { if (vivo) setCampos([]); });
    return () => { vivo = false; };
  }, []);

  if (campos.length === 0) return null;
  return (
    <div className="fu-secao">
      <div className="fu-secao-tit">Campos desta fatura</div>
      <div className="campos">
        {campos.map((c) => (
          <Campo key={c.chave} rotulo={c.rotulo} valor={valores[c.chave] ?? ''}
                 ao={(v) => ao((s) => ({ ...s, [c.chave]: v }))} />
        ))}
      </div>
      <p className="sub" style={{ marginTop: 8, marginBottom: 0 }}>
        Saem na grade do cliente da folha 1. Campo vazio <strong>não sai</strong> — um rótulo com
        nada embaixo é a mesma classe do travessão que este sistema recusa.
      </p>
    </div>
  );
}

/*
 * `brl` SAIU EM 14/08, e ela era a QUARTA implementacao de "centavos -> R$"
 * do sistema (`centavos.ts` no servidor, `dinheiro.ts` no browser, e a de
 * `layout-do-documento.ts` que ja tinha sido colapsada de manha).
 *
 * Medida antes de apagar: as tres rodadas lado a lado em 220.014 casos - zero
 * divergencia entre servidor e browser, e UMA entre elas e a `brl`: com o valor
 * ausente ela devolvia **"R$ 0,00"** e `emReais` devolve **"—"**.
 *
 * A troca de comportamento e o ponto, nao o efeito colateral: o painel mostra o
 * valor A GERAR NO BANCO, e "R$ 0,00" enquanto a composicao nao voltou parece
 * RESULTADO. E a mesma regra que este projeto ja segue no papel - ausencia e
 * nomeada, nunca desenhada com zero.
 */

function StatusDaLinha({ digitos, motivo, desenhou }: {
  digitos: string; motivo: string | null; desenhou: boolean;
}) {
  if (desenhou) {
    return <Status tom="ok" margem="rente">Linha válida · dígitos verificadores conferidos · código de barras gerado.</Status>;
  }
  if (digitos.length === 0) {
    return <Status margem="rente">Cole a linha digitável de 47 dígitos gerada no banco.</Status>;
  }
  return (
    <Status tom="alerta" margem="rente">
      {motivo ?? 'A linha não confere.'} O campo é editável: corrija a partir do boleto.
    </Status>
  );
}

/* ============================================================ aba 2: emissão */

function AbaDeEmissao({ composicao, logoUrl, irParaPainel }: {
  composicao: ComposicaoUnificada | null; logoUrl: string | null;
  irParaPainel: () => void;
}) {
  if (!composicao) {
    return (
      <div className="naoimprime">
        <Aviso tipo="alerta">
          Nada para emitir ainda. Volte à aba <strong>1 · Leitura e cálculo</strong> e
          envie a fatura da Equatorial.
        </Aviso>
      </div>
    );
  }
  const { folha1, folha2, numero_da_fatura } = composicao;

  return (
    <>
      {/* A BARRA TEM A LARGURA DA FOLHA e nao a da pagina, e os dois botoes sao
          os da referencia. "Voltar ao painel" nao existia aqui: quem chegava na
          aba 2 voltava pela aba 1 la em cima, o que e outro alvo e outra
          distancia — e a acao natural depois de olhar a folha e voltar a
          corrigir o que se acabou de ver. */}
      <div className="fu-barra naoimprime">
        <span className="fraco">Fatura {numero_da_fatura}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={irParaPainel}>Voltar ao painel</button>
          <button className="fu-imprimir" onClick={() => window.print()}>Imprimir fatura</button>
        </div>
      </div>

      {/* A REGRA `@page`, INJETADA — `size` nao aceita `var()` e por isso ela nao
          mora no `estilo.ts`. SEM ELA A FOLHA SAI EM DUAS PAGINAS: medido em
          14/08, o PDF das duas folhas veio com QUATRO paginas, porque o navegador
          usa a margem padrao do sistema e a folha tem 297 mm cravados — sobra 1 mm
          e ele quebra. `margin: 0` e o que faz os 297 mm caberem nos 297 mm. */}
      <style>{regraDaPagina('A4', 'retrato')}</style>

      <div id="documento">
        {/* ------------------------------------------------------- folha 1 */}
        <Palco>
          <div className="g3">
            <div className="g3-topo">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4pt' }}>
                <img src={logoUrl ?? LOGO_G3_DATA_URI} alt="" />
                {/* Sem logo enviada, cai na marca da G3 (a da referência). Ver `logo-g3.ts`. */}
                <div className="g3-assinatura">{folha1.cabecalho.assinatura}</div>
              </div>
              {folha1.cabecalho.emissor && <div className="g3-emissor">{folha1.cabecalho.emissor}</div>}
            </div>

            <div className="g3-cliente">
              <div className="g3-cliente-topo">
                <div>
                  <div className="g3-rot">Nome / razão social</div>
                  <div className="g3-nome">{folha1.cliente.nome}</div>
                </div>
                <div>
                  <div className="g3-rot">CPF / CNPJ</div>
                  <div className="g3-doc">{folha1.cliente.documento}</div>
                </div>
              </div>
              <div className="g3-meta">
                {folha1.cliente.meta.map((m) => (
                  <div key={m.rotulo}>
                    <div className="g3-rot">{m.rotulo}</div>
                    <div className="g3-meta-val">{m.valor}</div>
                  </div>
                ))}
              </div>
            </div>

            {folha1.cartoes && (
              <>
                <div className="g3-cartoes">
                  <div className="g3-cartao sem">
                    <div className="g3-cartao-rot">{folha1.cartoes.sem_g3.rotulo}</div>
                    <div className="g3-cartao-val">{folha1.cartoes.sem_g3.valor}</div>
                  </div>
                  <div className="g3-cartao desconto">
                    <div className="g3-cartao-linha">
                      <span className="g3-cartao-rot">{folha1.cartoes.desconto.rotulo}</span>
                      <span className="g3-cartao-pct">{folha1.cartoes.desconto.percentual}</span>
                    </div>
                    <div className="g3-cartao-val">{folha1.cartoes.desconto.valor}</div>
                  </div>
                  <div className="g3-cartao com">
                    <div className="g3-cartao-rot">{folha1.cartoes.com_g3.rotulo}</div>
                    <div className="g3-cartao-val">{folha1.cartoes.com_g3.valor}</div>
                  </div>
                </div>
                <div className="g3-cartao-nota">{folha1.cartoes.nota}</div>
              </>
            )}

            <div className="g3-total">
              <div style={{ minWidth: 0 }}>
                <div className="g3-total-rot">{folha1.total.rotulo}</div>
                <div className="g3-total-det">{folha1.total.detalhe}</div>
              </div>
              <div style={{ flex: 'none' }}>
                <div className="g3-total-val">{folha1.total.valor}</div>
                <div className="g3-total-sub">Vencimento {folha1.total.vencimento}</div>
                <div className="g3-total-sub fraca">{folha1.total.nota}</div>
              </div>
            </div>

            <div className="g3-aviso">
              <TrianguloDeAviso />
              <div>
                <div className="g3-aviso-tit">{folha1.aviso.titulo}</div>
                <div className="g3-aviso-corpo">{folha1.aviso.corpo}</div>
              </div>
            </div>

            {folha1.detalhamento && <Detalhamento d={folha1.detalhamento} />}

            <div className="g3-rodape">
              <span>{folha1.rodape.emissor ?? ''}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{folha1.rodape.paginacao}</span>
            </div>
          </div>
        </Palco>

        {/* ------------------------------------------------------- folha 2 */}
        <Palco>
          <div className="g3 g3-segunda">
            <div className="g3-topo-curto">
              <img src={logoUrl ?? LOGO_G3_DATA_URI} alt="" />
              {/* Igual a folha 1: sem logo do tenant, cai na marca da G3. Antes
                  era `logoUrl && <img>`, e a folha 2 saia sem logo no topo. */}
              <div className="g3-emissor">{folha2.cabecalho.identificacao}</div>
            </div>

            {folha2.historico
              ? (
                <div className="g3-hist">
                  <div className="g3-hist-tit">
                    {folha2.historico.titulo} <span className="fraca">{folha2.historico.nota}</span>
                  </div>
                  <div className="g3-hist-barras">
                    {folha2.historico.barras.map((b, i) => (
                      <div key={`${b.mes}-${i}`} className="g3-hist-col">
                        <div className="g3-hist-num">{b.kwh}</div>
                        <div className={`g3-hist-barra${b.atual ? ' atual' : ''}`}
                             style={{ height: `${b.altura_pct}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="g3-hist-meses">
                    {folha2.historico.barras.map((b, i) => (
                      <div key={`m-${b.mes}-${i}`}>{b.mes}</div>
                    ))}
                  </div>
                </div>
              )
              : (
                /* O MOTIVO SAI NA TELA E NAO NO PAPEL: o cliente nao precisa saber
                   que o extrator nao achou a tabela; quem emite, sim. */
                <div className="g3-pendente naoimprime">{folha2.historico_motivo}</div>
              )}

            <div className="g3-indicadores">
              <div className="g3-ind destaque">
                <div className="g3-rot">{folha2.indicadores.economia.rotulo}</div>
                <div className="g3-ind-val grande">{folha2.indicadores.economia.valor}</div>
                <div className="g3-ind-nota">{folha2.indicadores.economia.nota}</div>
              </div>
              <div className="g3-ind">
                <div className="g3-rot">{folha2.indicadores.consumo.rotulo}</div>
                <div className="g3-ind-val">{folha2.indicadores.consumo.valor}</div>
              </div>
              <div className="g3-ind">
                <div className="g3-rot">{folha2.indicadores.co2.rotulo}</div>
                <div className="g3-ind-val">{folha2.indicadores.co2.valor}</div>
                <div className="g3-ind-nota">{folha2.indicadores.co2.nota}</div>
              </div>
            </div>

            <CaixaDePagamento p={folha2.pagamento} logoUrl={logoUrl} />

            <div className="g3-rodape-2">
              <div>
                {folha2.rodape.telefone && (
                  <div className="g3-tel">
                    <div className="g3-rot">Dúvidas? Fale com a gente</div>
                    <div className="g3-tel-num">{folha2.rodape.telefone}</div>
                  </div>
                )}
                {folha2.rodape.emissor && <div style={{ marginTop: '6pt' }}>{folha2.rodape.emissor}</div>}
                {folha2.rodape.endereco && <div>{folha2.rodape.endereco}</div>}
                {folha2.rodape.email && <div>{folha2.rodape.email}</div>}
                {folha2.rodape.site && <div>{folha2.rodape.site}</div>}
              </div>
              <div>
                <div className="g3-rot" style={{ marginBottom: '3pt' }}>Informações importantes</div>
                {folha2.rodape.informacoes.map((t) => <div key={t}>{t}</div>)}
              </div>
            </div>
          </div>
        </Palco>
      </div>
    </>
  );
}

/**
 * O ENVELOPE DE UMA FOLHA NA TELA: escala, recorte e corte de pagina.
 *
 * A folha tem 210 mm cravados e a tela nao tem 210 mm — o `transform` a encolhe
 * para caber, e o recorte de altura existe so para nao sobrar vao branco embaixo
 * do zoom. Impresso, o `estilo.ts` desliga os dois e a folha volta ao tamanho
 * real; e o `.folha-item` e onde as paginas sao irmas, que e onde o corte cai.
 */
function Palco({ children }: { children: ReactNode }) {
  const [palco, larguraPx] = useLargura<HTMLDivElement>();
  const escala = escalaDaPrevia(larguraPx, 210);
  return (
    <div className="folha-item">
      <div ref={palco} className="folha-recorte"
           style={{ height: 297 * PX_POR_MM * escala + 2, overflow: 'hidden' }}>
        <div className="folha-palco" style={{ ['--escala' as never]: escala }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Detalhamento({ d }: { d: NonNullable<ComposicaoUnificada['folha1']['detalhamento']> }) {
  return (
    <div className="g3-det">
      <div className="g3-det-tit">{d.titulo}</div>
      <div className="g3-det-grade">
        <div className="g3-det-cab">
          <div>Descrição</div><div className="dir">kWh</div>
          <div className="dir">Tarifa R$</div><div className="dir">Valor R$</div>
        </div>

        <div className="g3-det-secao">{d.energia.titulo}</div>
        {d.energia.linhas.map((l) => <LinhaDoDetalhe key={l.descricao} l={l} />)}

        <div className="g3-det-secao">
          {d.repasses.titulo} <span className="fraca">{d.repasses.nota}</span>
        </div>
        {d.repasses.linhas.map((l) => <LinhaDoDetalhe key={l.descricao} l={l} />)}
        <div className="g3-det-linha subtotal">
          <div>Subtotal repasses</div><div /><div />
          <div className="dir forte">{d.repasses.subtotal}</div>
        </div>

        <div className="g3-det-total">
          <div>{d.total.rotulo}</div><div /><div />
          <div className="dir">{d.total.valor}</div>
        </div>
      </div>
    </div>
  );
}

function LinhaDoDetalhe({ l }: { l: LinhaDetalhada }) {
  return (
    <div className="g3-det-linha">
      <div>{l.descricao}</div>
      <div className="dir fraca">{l.kwh}</div>
      <div className="dir">
        {/* O CHEIO TACHADO ACIMA DO COM DESCONTO, como na referencia — e o que
            mostra o desconto sem precisar dizer a palavra. */}
        {l.tarifa_cheia && <div className="tachado">{l.tarifa_cheia}</div>}
        <div className={l.tarifa_cheia ? 'forte' : ''}>{l.tarifa}</div>
      </div>
      <div className="dir">
        {l.valor_cheio && <div className="tachado">{l.valor_cheio}</div>}
        <div className={l.valor_cheio ? 'forte' : ''}>{l.valor}</div>
      </div>
    </div>
  );
}

/**
 * A CAIXA DE PAGAMENTO REUSA `.faixa-pgto*`, e a reutilizacao e a decisao.
 *
 * O desenho ja estava no sistema desde 12/08 — veio do MESMO modelo G3 — e um
 * segundo conjunto `.g3-pgto*` com a mesma geometria seria a redundancia que este
 * porte existe para tirar. As duas unicas classes novas sao as duas coisas que a
 * faixa de 12/08 nao tinha: as barras e as instrucoes do banco.
 */
function CaixaDePagamento({ p, logoUrl }: {
  p: ComposicaoUnificada['folha2']['pagamento']; logoUrl: string | null;
}) {
  return (
    <div className="faixa-pgto">
      <div className="faixa-pgto-topo">
        <span>{p.titulo}</span>
        <img src={logoUrl ?? LOGO_G3_DATA_URI} alt="" style={{ height: '10pt' }} />
      </div>

      <div className="faixa-pgto-campos">
        {p.beneficiario && (
          <div>
            <div className="faixa-pgto-rot">Beneficiário</div>
            <div className="faixa-pgto-val">{p.beneficiario}</div>
          </div>
        )}
        {p.campos.map((c) => (
          <div key={c.rotulo}>
            <div className="faixa-pgto-rot">{c.rotulo}</div>
            <div className={c.rotulo === 'Valor do documento' ? 'faixa-pgto-total' : 'faixa-pgto-val'}>
              {c.valor}
            </div>
          </div>
        ))}
      </div>

      {p.instrucoes.length > 0 && (
        <div className="faixa-pgto-instr">
          <div className="faixa-pgto-rot">Instruções</div>
          {p.instrucoes.map((t) => <div key={t}>{t}</div>)}
        </div>
      )}

      {/* DUAS VIAS SO QUANDO HA DUAS. Sem QR, a via do boleto ocupa a faixa
          inteira em vez de dividir com uma coluna vazia. */}
      <div className="faixa-pgto-vias"
           style={{ gridTemplateColumns: p.qr ? '0.8fr 1.2fr' : '1fr' }}>
        {p.qr && (
          <div className="faixa-pgto-via">
            <div className="faixa-pgto-rot" style={{ textAlign: 'center' }}>Pague com PIX</div>
            {/* O SVG VEM PRONTO DO SERVIDOR — ver `qrcode.ts`. O CRM consome a
                mesma rota e nao roda React; um QR desenhado aqui obrigaria o
                outro lado a portar o codificador. */}
            <div className="faixa-pgto-qr" aria-label="QR Code do Pix"
                 dangerouslySetInnerHTML={{ __html: p.qr.svg }} />
            <div className="faixa-pgto-nota" style={{ textAlign: 'center' }}>
              Aponte a câmera do app do seu banco
            </div>
            {p.pix_texto && <div className="faixa-pgto-codigo">{p.pix_texto}</div>}
          </div>
        )}

        <div className="faixa-pgto-via">
          <div className="faixa-pgto-rot" style={{ textAlign: 'center' }}>Pague com boleto</div>
          {p.barras
            ? (
              <div className="faixa-pgto-barras" aria-label="Código de barras do boleto"
                   dangerouslySetInnerHTML={{ __html: p.barras.svg }} />
            )
            : (
              /* A AUSENCIA E DITA, e so na tela: o cliente nao precisa ler que a
                 linha nao confere; quem emite precisa. */
              <div className="g3-pendente naoimprime">{p.barras_motivo}</div>
            )}
          <div className="faixa-pgto-linha">{p.linha_formatada ?? '—'}</div>
          {p.barras && (
            <div className="faixa-pgto-nota" style={{ textAlign: 'center' }}>
              Pagável em qualquer banco até o vencimento.
            </div>
          )}
        </div>
      </div>

      <div className="faixa-pgto-rodape">
        {p.rodape_legal.map((t) => <div key={t}>{t}</div>)}
      </div>
    </div>
  );
}
