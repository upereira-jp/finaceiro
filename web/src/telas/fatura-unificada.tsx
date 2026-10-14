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
//
// ============================================================================
// 14/10/2026 — O DESENHO E AS FUNCOES VOLTAM A SER OS DA REFERENCIA
//
// Pedido do dono: *"na aba Contas de luz, restaure o design e funções para como
// existe em https://g3-fatura-unificada.vercel.app/"*. De 30/09 a 14/10 a aba 1
// foi a tela do LOTE (fila e registradas em largura total, a conta aberta numa
// gaveta); esse desenho esta guardado na tag `design-contas-de-luz-2026-10-14`.
//
// Agora a aba e a da referencia no ar (commit `a43b1f3`): a barra navy com
// «1 · Leitura e cálculo» e «2 · Emissão», «Nova fatura», a grade de 380px com
// a conta da Equatorial, o painel «Boleto a gerar no banco», o «Boleto Sicoob»
// lido em dois tempos («Ler boleto com IA»), os «Parâmetros» e as «Faturas
// registradas nesta UC» com «Registrar este mês»; a «Conferência dos dados» a
// direita; e na aba 2 «Voltar ao painel» e «Imprimir fatura». As frases de
// status sao as dela.
//
// O QUE FICOU DO SISTEMA, porque o mes precisa e a referencia nao tem: enviar
// VARIAS contas de uma vez (a fila do mes), «Faltam N contas» e as contas
// registradas do mes com «Gerar N cobranças» e «2ª via» — embaixo da grade, nas
// tabelas de `fatura-lote-corpo.tsx` — e a aba «3 · Dados de quem cobra».

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  api, CAMPOS_DA_FATURA_VAZIOS, PARAMETROS_PADRAO, BOLETO_LIDO_VAZIO,
  type CamposDaFatura, type ParametrosDaEmissao, type BoletoLido,
  type ComposicaoUnificada, type LinhaDetalhada, type CampoPersonalizado,
  type RegistroDeFatura, type UnidadeConsumidora, type ModeloDeFatura,
} from '../api.ts';
import { Aviso, Campo, Icone, MostrandoSo } from '../ui.tsx';
import { ContasQueFaltam } from '../contas-que-faltam.tsx';
import { FILTROS_DA_TELA, filtroDaConsulta, rotuloDoRecorte, esquecerORecorte } from '../destino-da-camada.ts';
import { useMesDoTrabalho } from '../seletor-de-mes.tsx';
import { TrianguloDeAviso } from '../icones.tsx';
import {
  escalaDaPrevia, regraDaPagina, PX_POR_MM,
  proximoNivelDoAperto, classesDoAperto, larguraDoCampoDaFolha,
} from '../layout-regras.ts';
import { emReais, percentualEmBr, camposParaDecimais, decimaisParaCampos } from '../dinheiro.ts';
import { useLargura } from '../medir-largura.ts';
import {
  ROTULO_DA_ABA, ABAS, abaDoFragmento, fragmentoDaAba, type AbaDaFatura,
} from '../abas-da-fatura.ts';
import { LOGO_G3_DATA_URI, LOGO_G3_SOBRE_NAVY_DATA_URI } from '../logo-g3.ts';
import { lerBase64, mimeDo, reenviavel, naMensagem } from '../arquivo.ts';
import { EXPLICACAO_DO_REGISTRO } from '../../../src/dominio/fatura-do-registro.ts';
import { lerCompetencia } from '../../../src/dominio/competencia.ts';
import {
  recusaDoArquivo, normalizarUc, chaveDoItem, resumoDoLote, corrigirItem,
  LEITURAS_SIMULTANEAS, type ItemDoLote,
} from '../lote-de-contas.ts';
import {
  LIMITE_DA_LISTA, listaParcial, filtrarRegistradas, selecaoParaGerar,
  ordemDasRegistradas,
  podeGerar, mesDoRegistro, mesCurto,
  type EstadoDaGeracao, type FiltroDasRegistradas,
} from '../registradas-regras.ts';
import { TabelaDaFila, TabelaDasRegistradas } from '../fatura-lote-corpo.tsx';
import { PerguntaNaTela } from '../serie.tsx';
import { mapaDoCadastro, numeroDaUcNaTela } from '../formato.ts';

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
  /**
   * A FILA DO LOTE, e ela entrou no rascunho em 08/09/2026 porque o que se
   * perdia ali era DINHEIRO.
   *
   * A fila vivia so em `useState`. Um F5 no meio de 29 leituras apagava a fila
   * inteira — e cada linha lida custou uma chamada PAGA ao modelo de visao. E o
   * F5 acidental e justamente o caminho mais provavel num trabalho que leva
   * dezenas de minutos com a aba aberta.
   *
   * SO O QUE SOBREVIVE A SERIALIZACAO ENTRA: os `File` nao entram no rascunho e
   * nao poderiam — o navegador nao os devolve depois do recarregamento. Uma
   * linha que ainda nao tinha sido lida volta como `falhou`, dizendo para subir
   * o arquivo de novo; uma linha ja lida volta inteira, com os campos que a
   * chamada paga produziu.
   */
  lote?: ItemDoLote[];
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
      lote: Array.isArray(r.lote) ? r.lote.map(restaurarItem) : [],
    };
  } catch { return null; }
}

/**
 * A LINHA DA FILA, DE VOLTA DO RASCUNHO.
 *
 * Quem estava `na_fila`, `lendo` ou `registrando` volta como `falhou`: o `File`
 * nao atravessa o recarregamento e a leitura nao pode ser retomada de onde
 * parou. Dizer isso na propria linha, com o nome do arquivo, e o que permite a
 * pessoa subir de novo SO os que faltaram — apagar a fila faria ela recomecar as
 * 29.
 */
function restaurarItem(i: ItemDoLote): ItemDoLote {
  const perdido = i.estado === 'na_fila' || i.estado === 'lendo' || i.estado === 'registrando';
  if (!perdido) return i;
  return {
    ...i,
    estado: 'falhou',
    erro: 'A página foi recarregada antes desta leitura terminar. Envie este arquivo de novo.',
  };
}

function gravarRascunho(tenantId: string | null, r: Rascunho): void {
  try { localStorage.setItem(chaveDoRascunho(tenantId), JSON.stringify(r)); }
  catch {
    /* Armazenamento cheio ou desligado: a tela continua. Com o lote dentro, o
     * rascunho ficou MAIOR — 29 linhas com 21 campos cada —, entao estourar a
     * cota deixou de ser hipotetico. Perder o rascunho e ruim; travar a tela por
     * causa dele seria pior. */
  }
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
/** `margem` existe porque a referencia usa QUATRO distancias para a mesma linha
 *  de status: 12px depois da area de envio da conta, 8px sob «Ler boleto com
 *  IA», 6px colada no campo que acabou de ser digitado, 10px no resto.
 *
 *  [14/10/2026] A LINHA NEUTRA E TEXTO PURO, como na referencia — o icone so
 *  existe quando ha tom (sucesso ou falha), que e quando a cor diz alguma coisa. */
type LinhaDeStatus = { texto: string; tom: 'ok' | 'alerta' | null };
function Status({ tom, margem, children }: {
  tom?: 'ok' | 'alerta' | null; margem?: 'rente' | 'solto' | 'm8'; children: ReactNode;
}) {
  if (!tom) return <div className={['fu-status', margem].filter(Boolean).join(' ')}>{children}</div>;
  return (
    <div className={['fu-status', 'com-icone', tom, margem].filter(Boolean).join(' ')} role="status">
      {/* `aviso_ok` e nao `sim`: o `sim` esta em `ICONES_QUE_SE_MOVEM` e a regra
          `.ic-sim` anima em qualquer lugar do sistema. O do aviso so anima dentro
          de `.aviso.ok >`, entao aqui ele fica parado — que e o certo para uma
          linha de status que reaparece a cada tecla. */}
      <Icone nome={tom === 'ok' ? 'aviso_ok' : 'aviso_alerta'} tamanho={14} peso="bold" />
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
 * O CADASTRO VIROU A TERCEIRA ABA EM 14/08, e nao e so mudanca de lugar: ele e
 * o que a folha IMPRIME - emissor, logo, chave Pix, os textos do documento e os
 * campos personalizados -, e "Cadastro de Fatura" e uma funcionalidade nomeada
 * pelo dono, nao um apendice. Desde 30/09 ela fica na barra (ver
 * `abas-da-fatura.ts`).
 */
export function FaturaUnificada({ logoUrl, tenantId, cadastro, aoMudarAba }: {
  logoUrl: string | null;
  /** Do `useSessao`. E a chave do rascunho — ver `RASCUNHO`. */
  tenantId: string | null;
  cadastro?: ReactNode;
  /** A aba aberta, para a tela dizer o mes no titulo so na aba que o mostra
   *  (etapa 8): a folha do cliente e os dados de quem cobra nao tem mes. */
  aoMudarAba?: (aba: Aba) => void;
}) {
  /*
   * A ABA NASCE DO ENDERECO: `/documento#cadastro` abre direto no cadastro — e o
   * link da tela de Pendencias, da ajuda e de tres mensagens do servidor.
   *
   * O `hashchange` existe para o link funcionar SEM RECARREGAR, de dentro da
   * propria tela (`navegar` dispara o evento quando o fragmento muda — ver
   * `rota.tsx`). E `irPara` escreve o fragmento de volta: o endereco sempre diz
   * a aba aberta, entao um `#cadastro` esquecido no endereco nao impede o
   * proximo link de abrir o cadastro.
   */
  const [aba, setAba] = useState<Aba>(() => abaDoFragmento(window.location.hash) ?? 'leitura');
  useEffect(() => {
    const ouvir = () => { const a = abaDoFragmento(window.location.hash); if (a) setAba(a); };
    window.addEventListener('hashchange', ouvir);
    return () => window.removeEventListener('hashchange', ouvir);
  }, []);
  useEffect(() => { aoMudarAba?.(aba); }, [aba, aoMudarAba]);

  /* O MES DE TRABALHO (etapa 8): a lista do que falta ler e a das registradas
   * mostram o mes escolhido no menu, e a fila avisa a conta de outro mes. */
  const { mes: mesDoTrabalho, escolher: escolherMes } = useMesDoTrabalho();

  const rascunho = lerRascunho(tenantId);
  const [campos, setCampos] = useState<CamposDaFatura>(rascunho?.campos ?? CAMPOS_DA_FATURA_VAZIOS);
  const [parametros, setParametros] = useState<ParametrosDaEmissao>(rascunho?.parametros ?? PARAMETROS_PADRAO);
  /* `true` assim que a tela passa a ter opiniao propria sobre os parametros:
   * rascunho recuperado, segunda via carregada, ou alguem digitando no campo.
   * Enquanto for `false`, o padrao CADASTRADO manda — ver o bloco em `compor`. */
  const parametrosTocados = useRef(rascunho?.parametros != null);
  /* A CONTA QUE ENTRA NA CONFERENCIA NASCE SEM OPINIAO SOBRE PARAMETROS, e ate
   * 30/09/2026 so a «Nova fatura» fazia isso. «Conferir» outra linha da fila
   * trocava os campos e deixava o desconto da conta anterior no painel — e
   * «Registrar este mes» manda `parametros`, entao a conta B era gravada com o
   * desconto que alguem digitou para a A (`a1d6abc`). */
  function esquecerParametros() {
    parametrosTocados.current = false;
    setParametros(PARAMETROS_PADRAO);
    setPersonalizados({});
  }
  const [boleto, setBoleto] = useState<BoletoLido>(rascunho?.boleto ?? BOLETO_LIDO_VAZIO);
  const [personalizados, setPersonalizados] = useState<Record<string, string>>(
    rascunho?.campos_personalizados ?? {});

  const [composicao, setComposicao] = useState<ComposicaoUnificada | null>(null);
  const [erroDaComposicao, setErroDaComposicao] = useState<string | null>(null);

  /* AS LINHAS DE STATUS SAO AS DA REFERENCIA, frase por frase (14/10/2026):
   * «Nenhum arquivo enviado.», «Lendo <arquivo>…», «Interpretando a fatura com a
   * IA…», «Dados extraídos. Confira os campos ao lado.». */
  const [statusFatura, setStatusFatura] = useState('Nenhum arquivo enviado.');
  /*
   * O BOLETO EM DOIS TEMPOS, como na referencia: escolher o arquivo so o guarda
   * («Arquivo pronto — clique em "Ler boleto com IA".») e a leitura — uma
   * chamada PAGA ao modelo de visao — acontece no botao. Ate 14/10 a escolha ja
   * disparava a leitura.
   */
  const arquivoDoBoleto = useRef<File | null>(null);
  const [nomeBoleto, setNomeBoleto] = useState('Nenhum boleto enviado.');
  const [statusBoleto, setStatusBoleto] = useState<LinhaDeStatus>({ texto: '', tom: null });
  const [lendoBoleto, setLendoBoleto] = useState(false);
  function esquecerBoleto(nota = '') {
    arquivoDoBoleto.current = null;
    setNomeBoleto('Nenhum boleto enviado.');
    setStatusBoleto({ texto: nota, tom: null });
  }
  const [registrando, setRegistrando] = useState(false);
  const [statusRegistro, setStatusRegistro] = useState<string | null>(null);
  /* SOBE A CADA ESCRITA em `fatura_unificada_registrada` — registro novo,
   * exclusao ou cobranca gerada. E o que manda as listas de registro relerem sem
   * que esta tela guarde uma copia delas para manter em dia. */
  const [registrosVersao, setRegistrosVersao] = useState(0);

  /* QUAL LINHA DA FILA esta na conferencia (ou `null`: conta digitada, segunda
   * via, rascunho recuperado). O que se corrige na conferencia volta para ela. */
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const abertoIdAgora = useRef(abertoId);
  abertoIdAgora.current = abertoId;
  /** O chip de unidade da lista de registradas do mes. Ver `FiltroDasRegistradas`. */
  const [unidadeDaLista, setUnidadeDaLista] = useState<string | null>(null);
  /*
   * O RECORTE DO ENDEREÇO (01/10/2026, etapa 7a): `?pendencia=sem_conta` é o
   * botão «15 contas a ler» do Mês. A aba abre com «Faltam N contas» aberto, logo
   * acima da grade, e as registradas do mês ficam fora até o «x» do «Mostrando só».
   */
  const [recorte, setRecorte] = useState(() => filtroDaConsulta(location.search, FILTROS_DA_TELA['/documento']));

  /*
   * ==========================================================================
   * O LOTE DO MES — `Q-CONTA-LOTE-01`, decidida em 08/09/2026
   *
   * A referencia sobe UMA conta por vez, e com uma so esta tela faz exatamente o
   * mesmo: a conta lida enche a «Conferência dos dados». Com VARIAS de uma vez
   * (a carteira tem dezenas de UCs), cada uma vira uma linha da «Fila deste mês»,
   * embaixo da grade, e «Conferir» a traz para a conferencia.
   *
   * O QUE ESTE ESTADO NAO E: um segundo caminho de composicao. A fila LE e
   * REGISTRA pelas MESMAS duas rotas da conta avulsa (`/faturas/ler-fatura` e
   * `/faturas/unificada/registros`). As regras de "esta linha pode registrar?"
   * moram em `lote-de-contas.ts`, sem JSX, porque o runner do `web/` nao le
   * `.tsx` e o que nao pode ser verificado nao e regra (regra 8).
   */
  const [lote, setLote] = useState<ItemDoLote[]>(rascunho?.lote ?? []);
  const [registrandoLote, setRegistrandoLote] = useState(false);
  /** As UCs do cadastro, so para AVISAR que a conta e de uma unidade que nao
   *  existe aqui. Nao bloqueia — o servidor aceita `unidade_consumidora_id` nulo. */
  const [ucsDoCadastro, setUcsDoCadastro] = useState<ReadonlySet<string>>(new Set());
  /** [30/09/2026, etapa 4b] A MESMA LISTA, agora tambem para MOSTRAR o numero
   *  como o cadastro o guarda (`formato.ts:numeroDaUcNaTela`). */
  const [cadastroDeUcs, setCadastroDeUcs] = useState<ReadonlyMap<string, string>>(new Map());

  /* Os `File` NAO entram no estado do React: eles nao sao serializaveis, nao vao
   * para o rascunho e manter um PDF de 3 MB por linha em `useState` seguraria a
   * memoria da aba inteira depois que a leitura ja acabou. */
  const arquivosDoLote = useRef(new Map<string, File>());
  const proximoIdDoLote = useRef(0);
  const loteAgora = useRef<ItemDoLote[]>([]);
  useEffect(() => { loteAgora.current = lote; }, [lote]);
  /** A linha que, lida, vai direto para a conferencia: a de um envio de UM
   *  arquivo so — o fluxo da referencia. Num envio de varias, nenhuma: a vigesima
   *  nona nao pode sobrescrever a conferencia da primeira. */
  const abrirAoLer = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api.get<UnidadeConsumidora[]>('/unidades-consumidoras')
      .then((l) => {
        if (!vivo) return;
        setUcsDoCadastro(new Set(l.map((u) => normalizarUc(u.numero_uc))));
        setCadastroDeUcs(mapaDoCadastro(l.map((u) => u.numero_uc)));
      })
      /* A LISTA E CONVENIENCIA, e falhar em busca-la nao pode travar o lote: sem
       * ela `avisoDoItem` simplesmente nao acusa UC desconhecida (`L3i`). */
      .catch(() => { if (vivo) { setUcsDoCadastro(new Set()); setCadastroDeUcs(new Map()); } });
    return () => { vivo = false; };
  }, [tenantId]);

  const ajustarItem = useCallback((id: string, mudar: (i: ItemDoLote) => ItemDoLote) => {
    setLote((s) => s.map((i) => (i.id === id ? mudar(i) : i)));
  }, []);

  /* O que a conferencia corrige volta para a linha aberta — ver `corrigirItem`.
   * Devolve o MESMO array quando nada mudou: carregar a conta copia os campos da
   * linha, e isso nao pode regravar o rascunho nem redesenhar a fila. */
  useEffect(() => {
    if (!abertoId) return;
    setLote((s) => {
      let mudou = false;
      const n = s.map((i) => {
        if (i.id !== abertoId) return i;
        const c = corrigirItem(i, campos);
        if (c !== i) mudou = true;
        return c;
      });
      return mudou ? n : s;
    });
  }, [campos, abertoId]);

  /** Poe uma conta na «Conferência dos dados». O boleto e o status do registro
   *  sao da conta anterior, e saem junto. */
  function carregarConta(id: string | null, c: CamposDaFatura, status: string) {
    if (id === null || id !== abertoIdAgora.current) esquecerParametros();
    setCampos(c);
    setBoleto(BOLETO_LIDO_VAZIO);
    esquecerBoleto();
    setStatusFatura(status);
    setStatusRegistro(null);
    setAbertoId(id);
  }

  const lerItemDoLote = useCallback(async (id: string) => {
    const f = arquivosDoLote.current.get(id);
    if (!f) return;
    const sozinho = () => abrirAoLer.current === id;
    ajustarItem(id, (i) => ({ ...i, estado: 'lendo', erro: null }));
    try {
      const conteudo = await lerBase64(f);
      if (sozinho()) setStatusFatura('Interpretando a fatura com a IA…');
      const lido = await api.post<CamposDaFatura>('/faturas/ler-fatura', { conteudo_base64: conteudo, tipo: mimeDo(f) });
      const lidos = { ...CAMPOS_DA_FATURA_VAZIOS, ...lido };
      ajustarItem(id, (i) => ({ ...i, estado: 'lido', erro: null, campos: lidos }));
      if (sozinho()) {
        abrirAoLer.current = null;
        carregarConta(id, lidos, 'Dados extraídos. Confira os campos ao lado.');
      }
    } catch (e) {
      /* A LINHA QUE FALHOU NAO SOME e continua com o nome do arquivo: e por ele
       * que a pessoa sabe qual PDF reenviar. */
      ajustarItem(id, (i) => ({ ...i, estado: 'falhou', erro: naMensagem(e) }));
      if (sozinho()) {
        abrirAoLer.current = null;
        setStatusFatura(`Não foi possível ler o PDF: ${semPontoFinal(naMensagem(e))}. Preencha os campos manualmente.`);
      }
    } finally {
      arquivosDoLote.current.delete(id);
    }
    // `carregarConta` le refs e setters, que nao mudam entre desenhos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustarItem]);

  /*
   * A BOMBA DA FILA: no maximo `LEITURAS_SIMULTANEAS` leituras ao mesmo tempo.
   * Reage a `lote` porque toda leitura que termina muda o estado — entao a
   * proxima parte sozinha, sem `setInterval`.
   */
  useEffect(() => {
    const lendo = lote.filter((i) => i.estado === 'lendo').length;
    if (lendo >= LEITURAS_SIMULTANEAS) return;
    const proximo = lote.find((i) => i.estado === 'na_fila' && arquivosDoLote.current.has(i.id));
    if (proximo) void lerItemDoLote(proximo.id);
  }, [lote, lerItemDoLote]);

  /** «Enviar fatura da distribuidora»: um arquivo segue o caminho da referencia;
   *  varios entram na fila do mes. */
  function adicionarAoLote(escolhidos: FileList | null) {
    const arquivos = Array.from(escolhidos ?? []);
    if (arquivos.length === 0) return;
    const novos: ItemDoLote[] = arquivos.map((f) => {
      const id = `a${proximoIdDoLote.current++}`;
      const recusa = recusaDoArquivo({ nome: f.name, tamanho: f.size, tipo: mimeDo(f) });
      /* A RECUSA VIRA LINHA, e nao um alerta que some. */
      if (recusa) return { id, nome: f.name, tamanho: f.size, estado: 'falhou' as const, campos: null, erro: recusa };
      arquivosDoLote.current.set(id, f);
      return { id, nome: f.name, tamanho: f.size, estado: 'na_fila' as const, campos: null, erro: null };
    });
    if (novos.length === 1) {
      const n = novos[0]!;
      if (n.estado === 'falhou') {
        abrirAoLer.current = null;
        setStatusFatura(`Não foi possível ler o PDF: ${semPontoFinal(n.erro ?? '')}. Preencha os campos manualmente.`);
      } else {
        abrirAoLer.current = n.id;
        setStatusFatura(`Lendo ${n.nome}…`);
      }
    } else {
      abrirAoLer.current = null;
      setStatusFatura(`${novos.length} contas entraram na fila deste mês, mais abaixo — cada uma é lida na ordem; `
                      + 'abra uma em «Conferir».');
    }
    setLote((s) => [...s, ...novos]);
  }

  /**
   * REGISTRA AS LINHAS, UMA DE CADA VEZ — em serie, porque sao escritas na mesma
   * tabela e cada uma abre transacao no servidor.
   *
   * NAO MANDA `parametros`: sem eles a rota aplica o `modeloVigente()`, que e o
   * percentual de desconto CADASTRADO.
   */
  async function registrarDoLote(ids: readonly string[]) {
    setRegistrandoLote(true);
    try {
      for (const id of ids) {
        const item = loteAgora.current.find((i) => i.id === id);
        if (!item?.campos) continue;
        ajustarItem(id, (i) => ({ ...i, estado: 'registrando', erro: null }));
        try {
          await api.post('/faturas/unificada/registros', {
            campos: item.campos, boleto: BOLETO_LIDO_VAZIO, campos_personalizados: {},
          });
          ajustarItem(id, (i) => ({ ...i, estado: 'registrado', erro: null }));
          setRegistrosVersao((v) => v + 1);
        } catch (e) {
          ajustarItem(id, (i) => ({ ...i, estado: 'falhou', erro: naMensagem(e) }));
        }
      }
    } finally { setRegistrandoLote(false); }
  }

  /** «Conferir»: a linha da fila sobe para a «Conferência dos dados», e a tela
   *  vai junto ate a grade. */
  function abrirConta(item: ItemDoLote) {
    if (!item.campos) return;
    carregarConta(item.id, item.campos,
      `Conferindo «${item.nome}». O que você corrigir aqui vale também para a linha da fila.`);
    requestAnimationFrame(() => {
      document.getElementById('fu-grade')?.scrollIntoView({ block: 'start' });
      document.getElementById('fu-conferencia-titulo')?.focus({ preventScroll: true });
    });
  }

  /*
   * ==========================================================================
   * O RASCUNHO PERSISTE, e ate 14/08 um F5 apagava a fatura inteira — aqui a
   * extracao e uma chamada PAGA ao modelo de visao. A chave leva o tenant (o
   * seletor de empresa troca de tenant SEM recarregar). Nao e dado de negocio:
   * o que vira dado e o REGISTRO, que tem tabela, policy e trilha.
   */
  useEffect(() => {
    gravarRascunho(tenantId, {
      campos, parametros, boleto, campos_personalizados: personalizados, lote,
    });
  }, [tenantId, campos, parametros, boleto, personalizados, lote]);

  /* A composicao pedida ao servidor. `pedido` cresce a cada chamada e a resposta
   * so e aceita se for a do ULTIMO pedido: sem isso, uma resposta lenta de uma
   * edicao antiga sobrescreve a nova. */
  const pedido = useRef(0);
  const compor = useCallback(async (
    c: CamposDaFatura, p: ParametrosDaEmissao, b: BoletoLido, cp: Record<string, string>,
  ) => {
    const meu = ++pedido.current;
    /* [01/10/2026, etapa 6] OS PARAMETROS VAO NO TEXTO CANONICO, e o ambiguo
     * NAO VAI — a frase fica no campo. */
    const conv = camposParaDecimais(p);
    if (!conv.ok) {
      setErroDaComposicao('um dos parâmetros desta conta não é um número que a tela aceite — a frase está no campo.');
      return;
    }
    try {
      const r = await api.post<ComposicaoUnificada>('/faturas/unificada/compor', {
        campos: c, parametros: conv.valor, boleto: b, campos_personalizados: cp,
      });
      if (meu !== pedido.current) return;
      setComposicao(r); setErroDaComposicao(null);
      /*
       * O DESCONTO SAI DO CADASTRO (08/09/2026): a rota monta os parametros
       * como `{ do modelo vigente, ...(o que a tela mandou) }`. ADOTA UMA VEZ E
       * SO SE NINGUEM TOCOU — quem digita 25 continua com 25, e a segunda via
       * conta como decisao (ela restaura os parametros com que foi gravada).
       */
      if (!parametrosTocados.current && r.modelo) {
        parametrosTocados.current = true;
        setParametros(decimaisParaCampos({
          percentual_desconto: r.modelo.percentual_desconto_padrao,
          fator_emissao: r.modelo.fator_emissao_padrao,
        }));
      }
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

  /* «Registrada» SO VALE PARA O QUE FOI GRAVADO: mexer num campo depois disso
   * faz a frase mentir — o que esta na tela ja nao e o que esta no banco. */
  useEffect(() => { setStatusRegistro(null); }, [campos]);

  /** Guarda o boleto escolhido. A leitura e no botao — ver `arquivoDoBoleto`. */
  function escolherBoleto(f: File) {
    arquivoDoBoleto.current = f;
    setNomeBoleto(f.name);
    setStatusBoleto({ texto: 'Arquivo pronto — clique em "Ler boleto com IA".', tom: null });
  }

  async function lerBoleto() {
    const f = arquivoDoBoleto.current;
    if (!f) {
      setStatusBoleto({ texto: 'Envie o PDF ou a foto do boleto primeiro.', tom: 'alerta' });
      return;
    }
    setLendoBoleto(true);
    setStatusBoleto({ texto: 'Lendo o boleto com a IA…', tom: null });
    try {
      const lido = await api.post<BoletoLido>('/faturas/ler-boleto', {
        conteudo_base64: await lerBase64(f), tipo: mimeDo(f),
      });
      setBoleto({ ...BOLETO_LIDO_VAZIO, ...lido });
      const n = lido.linha_digitavel.replace(/\D/g, '').length;
      setStatusBoleto(n === 47
        ? { texto: 'Boleto lido · linha digitável com 47 dígitos.', tom: 'ok' }
        : { texto: `Boleto lido, mas a linha digitável saiu com ${n} dígitos — corrija abaixo.`, tom: 'alerta' });
    } catch (e) {
      setStatusBoleto({
        texto: `Não foi possível ler o boleto: ${semPontoFinal(naMensagem(e))}. Preencha os campos abaixo manualmente.`,
        tom: 'alerta',
      });
    } finally { setLendoBoleto(false); }
  }

  /**
   * «REGISTRAR ESTE MÊS» — o que alimenta o "Você já economizou" do mês que vem.
   *
   * `upsert` pela chave (UC, competência) do lado do servidor: registrar duas
   * vezes o mesmo mês da mesma UC não produz duas economias, produz uma correção.
   */
  async function registrar() {
    if (!campos.unidade_consumidora.trim() || !lerCompetencia(campos.mes_referencia)) {
      setStatusRegistro('Informe a unidade consumidora e o mês de referência (MM/AAAA).');
      return;
    }
    /* O mesmo texto canonico da composicao — e a mesma recusa (ver `compor`). */
    const conv = camposParaDecimais(parametros);
    if (!conv.ok) {
      setStatusRegistro('Não foi possível registrar: um dos parâmetros desta conta não é um número que a tela aceite — a frase está no campo.');
      return;
    }
    setRegistrando(true);
    setStatusRegistro(null);
    try {
      await api.post('/faturas/unificada/registros', {
        campos, parametros: conv.valor, boleto, campos_personalizados: personalizados,
      });
      setStatusRegistro(`Fatura de ${campos.mes_referencia.trim()} registrada.`);
      setRegistrosVersao((v) => v + 1);
      /* A LINHA DO LOTE FECHA JUNTO: a aberta e, para as outras, a CHAVE (UC,
       * competencia) — a mesma do `upsert` do servidor. Sem isto a fila
       * continuaria oferecendo «Registrar» para uma conta ja gravada. */
      const gravada = chaveDoItem({
        id: '', nome: '', tamanho: 0, estado: 'lido', erro: null, campos,
      });
      setLote((s) => s.map((i) => (
        i.estado !== 'registrado' && (i.id === abertoId || (gravada && chaveDoItem(i) === gravada))
          ? { ...i, estado: 'registrado', erro: null }
          : i)));
      /* Recompoe: a economia acumulada mudou, e ela sai impressa na folha 2. */
      void compor(campos, parametros, boleto, personalizados);
    } catch (e) {
      setStatusRegistro(`Não foi possível registrar: ${naMensagem(e)}`);
    } finally { setRegistrando(false); }
  }

  /** «excluir» na lista da UC. O servidor recusa nomeando a conta que ja virou
   *  cobranca — por isso a lista nem oferece o ato nela. */
  async function excluirRegistro(r: RegistroDeFatura) {
    try {
      await api.del(`/faturas/unificada/registros/${r.id}`);
      setStatusRegistro('Registro excluído.');
      setRegistrosVersao((v) => v + 1);
      void compor(campos, parametros, boleto, personalizados);
    } catch (e) {
      setStatusRegistro(`Não foi possível excluir: ${naMensagem(e)}`);
    }
  }

  /**
   * A SEGUNDA VIA: recarrega na tela um mês já registrado, com os parâmetros
   * congelados daquele mês, e abre a «2 · Emissão». A pergunta (quando há conta
   * em edição) acontece na linha da lista do mês que pediu (`TabelaDasRegistradas`).
   */
  async function carregarSegundaVia(r: RegistroDeFatura) {
    const mes = mesCurto(mesDoRegistro(r));
    const v = await api.get<{
      campos: CamposDaFatura; parametros: ParametrosDaEmissao; boleto: BoletoLido;
    }>(`/faturas/unificada/registros/${r.id}/segunda-via`);
    carregarConta(null, { ...CAMPOS_DA_FATURA_VAZIOS, ...v.campos }, `2ª via de ${mes} carregada do que foi gravado.`);
    /* A segunda via restaura os parametros COM QUE AQUELA FATURA FOI GRAVADA.
     * Sobrescreve-los pelo padrao de hoje faria a segunda via mentir sobre o
     * que foi cobrado. */
    parametrosTocados.current = true;
    setParametros(decimaisParaCampos(v.parametros));
    setBoleto({ ...BOLETO_LIDO_VAZIO, ...v.boleto });
    if (v.boleto?.linha_digitavel) setStatusBoleto({ texto: 'Faixa de pagamento da 1ª via.', tom: null });
    irPara('emissao');
  }

  /**
   * «NOVA FATURA», como na referência desde `36e964e`: apaga o RASCUNHO e
   * preserva os REGISTROS — o rascunho é o que está em edição; os registros são
   * a série que produz a economia acumulada. A fila do mês também fica. A
   * pergunta, quando há o que perder, acontece na própria tela (`NovaFatura`).
   */
  function novaFatura() {
    abrirAoLer.current = null;
    carregarConta(null, CAMPOS_DA_FATURA_VAZIOS, 'Nenhum arquivo enviado.');
    setComposicao(null);
    apagarRascunho(tenantId);
    irPara('leitura');
  }

  /* O ENDERECO ACOMPANHA A ABA (`fragmentoDaAba`). `replaceState`, e nao
   * `pushState`: trocar de aba nao e navegar. */
  function irPara(a: Aba) {
    setAba(a);
    const frag = fragmentoDaAba(a);
    if (window.location.hash !== frag) {
      history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${frag}`);
    }
    window.scrollTo(0, 0);
  }

  /** A lista das registradas do mês abre na série de uma unidade. */
  function verUnidadeNaLista(uc: string | null) {
    setUnidadeDaLista(uc?.trim() || null);
  }

  /** A conta em edição, dita como a pessoa a reconhece — ou `null` quando não
   *  há nenhuma, e aí «Nova fatura» e «2ª via» não têm o que perder nem por que
   *  perguntar. */
  const contaEmEdicao = campos.unidade_consumidora.trim()
    ? `unidade ${campos.unidade_consumidora.trim()}`
    : campos.cliente.trim() || null;
  const resumo = useMemo(() => resumoDoLote(lote, ucsDoCadastro), [lote, ucsDoCadastro]);
  const novaNoTopo = <NovaFatura emEdicao={contaEmEdicao} ao={novaFatura} forma="topo" />;
  const novaNoPe = <NovaFatura emEdicao={contaEmEdicao} ao={novaFatura} forma="pe" />;
  const faltam = (aberto: boolean) => (
    <ContasQueFaltam mes={mesDoTrabalho} versao={registrosVersao} aberto={aberto} />
  );

  return (
    <div className="fu-ref">
      <BarraDoTopo atual={aba} ao={irPara} logoUrl={logoUrl} />

      <div id={`fu-painel-${aba}`} role="tabpanel" aria-labelledby={`fu-aba-${aba}`}>
        {aba === 'leitura' && (
          <div className="fu-leitura naoimprime">
            <div className="fu-topo-acoes">{novaNoTopo}</div>

            <MostrandoSo rotulo={rotuloDoRecorte('/documento', recorte)} focarDepois="fu-registradas-titulo"
                         aoRemover={() => { setRecorte(''); esquecerORecorte(); }} />
            {recorte === 'sem_conta' && faltam(true)}

            {/*
              O EMISSOR VAZIO ACUSA AQUI (08/09/2026). `linhaDoEmissor` devolve
              `null` com razao social e CNPJ vazios, e a folha sai sem o
              cabecalho, sem o «Beneficiário» e sem o aviso contra boleto falso,
              que amarra no nome. O botao abre a aba 3 direto.
            */}
            {composicao && !composicao.folha1.cabecalho.emissor && (
              <Aviso tipo="alerta">
                <strong>A folha vai sair sem dizer quem está cobrando.</strong> Razão social e CNPJ do
                emissor estão em branco, e nada recusa por isso: o cabeçalho, o campo «Beneficiário» da
                faixa de pagamento e o aviso contra boleto falso somem — é o nome que os sustenta.
                {' '}
                <button type="button" onClick={() => irPara('cadastro')}>Preencher os dados de quem cobra</button>
              </Aviso>
            )}

            <div className="fu-grade" id="fu-grade">
              <div className="fu-coluna">
                <CartaoDaConta status={statusFatura} adicionar={adicionarAoLote} />
                <PainelNavy composicao={composicao} campos={campos} erro={erroDaComposicao} />
                <CartaoDoBoleto
                  boleto={boleto} setBoleto={setBoleto} composicao={composicao}
                  nome={nomeBoleto} status={statusBoleto} lendo={lendoBoleto}
                  escolher={escolherBoleto} ler={() => void lerBoleto()} />
                <CartaoDosParametros
                  parametros={parametros} modelo={composicao?.modelo ?? null}
                  setParametros={(f) => { parametrosTocados.current = true; setParametros(f); }} />
                <RegistradasDaUnidade
                  uc={campos.unidade_consumidora} versao={registrosVersao}
                  registrar={() => void registrar()} registrando={registrando}
                  status={statusRegistro} excluir={(r) => void excluirRegistro(r)} />
              </div>

              <ConferenciaDosDados
                campos={campos} mudar={mudar} setCampos={setCampos}
                composicao={composicao} erroDaComposicao={erroDaComposicao}
                personalizados={personalizados} setPersonalizados={setPersonalizados}
                verFatura={() => irPara('emissao')} novaFatura={novaNoPe} />
            </div>

            {/* O MÊS, EMBAIXO DA GRADE: o que a referência não tem e o passo 2 do
                mês precisa — a fila de várias contas, o que falta ler e as
                contas registradas do mês com «Gerar N cobranças». */}
            <div className="fu-mes">
              {lote.length > 1 && (
                <TabelaDaFila
                  mesDoTrabalho={mesDoTrabalho} aoMudarMes={escolherMes}
                  itens={lote} ucs={ucsDoCadastro} cadastro={cadastroDeUcs} registrando={registrandoLote}
                  principal={resumo.prontos > 0} abertaId={abertoId}
                  registrar={(ids) => void registrarDoLote(ids)}
                  conferir={abrirConta}
                  remover={(id) => setLote((s) => s.filter((i) => i.id !== id))}
                  limpar={() => { arquivosDoLote.current.clear(); setLote([]); setAbertoId(null); }}
                />
              )}
              {recorte !== 'sem_conta' && faltam(false)}
              {recorte !== 'sem_conta' && (
                <ContasRegistradas
                  mesDoTrabalho={mesDoTrabalho}
                  cadastro={cadastroDeUcs}
                  versao={registrosVersao}
                  /* O laranja e de «Registrar N» quando a fila esta a vista com
                     conta a registrar; senao, e o passo seguinte do mes. */
                  principal={lote.length <= 1 || resumo.prontos === 0}
                  unidade={unidadeDaLista} aoMudarUnidade={verUnidadeNaLista}
                  segundaVia={carregarSegundaVia} emEdicao={contaEmEdicao}
                  aoMudar={() => {
                    setRegistrosVersao((v) => v + 1);
                    /* A folha 2 imprime a economia acumulada: apagar um registro a
                     * muda, e sem recompor a tela seguiria mostrando a soma antiga. */
                    void compor(campos, parametros, boleto, personalizados);
                  }}
                />
              )}
            </div>
          </div>
        )}
        {/* UMA FOLHA SO NA ARVORE: `AbaDaFolha` monta `<div id="documento">`, o
            CSS de impressao e seletor de `id`, e duas folhas com o mesmo id
            imprimem juntas (`W-imprime-uma-folha-so`). */}
        {aba === 'emissao' && (
          <AbaDaFolha composicao={composicao} logoUrl={logoUrl} erro={erroDaComposicao}
                      mes={campos.mes_referencia.trim()}
                      temConta={Boolean(campos.unidade_consumidora.trim() || campos.cliente.trim())}
                      voltar={() => irPara('leitura')} />
        )}
        {aba === 'cadastro' && cadastro}
      </div>
    </div>
  );
}

/** «Não foi possível ler.» → «Não foi possível ler» — a frase da referência
 *  acrescenta o próprio ponto depois da mensagem. */
const semPontoFinal = (t: string): string => t.trim().replace(/[.\s]+$/, '');

/* ------------------------------------------------------- a barra navy
   QUAIS ABAS EXISTEM e COMO SE CHEGA DIRETO NO CADASTRO moram em
   `abas-da-fatura.ts`. Aqui ficou o que a barra MOSTRA. */

/**
 * A BARRA DA REFERÊNCIA: a marca e «Emissão de faturas» à esquerda, as abas à
 * direita, sobre o navy. As abas são um `tablist` de verdade — o estado é
 * `aria-selected`, e é ele que o CSS lê; a seta anda, Home e End vão aos
 * extremos (o padrão WAI-ARIA), e só a aba ativa fica no caminho do Tab.
 */
function BarraDoTopo({ atual, ao, logoUrl }: {
  atual: Aba; ao: (a: Aba) => void; logoUrl: string | null;
}) {
  const teclado = (e: React.KeyboardEvent) => {
    const i = ABAS.indexOf(atual);
    const destino =
      e.key === 'ArrowRight' ? (i + 1) % ABAS.length
      : e.key === 'ArrowLeft' ? (i - 1 + ABAS.length) % ABAS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? ABAS.length - 1
      : -1;
    if (destino < 0) return;
    e.preventDefault();
    ao(ABAS[destino]!);
    requestAnimationFrame(() => document.getElementById(`fu-aba-${ABAS[destino]!}`)?.focus());
  };
  return (
    <div className="fu-topo naoimprime">
      <div className="fu-topo-marca">
        {/* Sem logo do tenant, a marca da G3 no desenho para o navy (a da barra
            da referência) — a mesma fronteira multi-tenant da folha. */}
        <img src={logoUrl ?? LOGO_G3_SOBRE_NAVY_DATA_URI} alt={logoUrl ? 'Logo da empresa' : 'G3 Solar'} />
        <span className="fu-topo-rotulo">Emissão de faturas</span>
      </div>
      <div className="fu-abas-lista" role="tablist" aria-label="Partes de Contas de luz" onKeyDown={teclado}>
        {ABAS.map((a, i) => (
          <Fragment key={a}>
            {/* O traço liga os dois PASSOS da referência; a divisa separa o
                cadastro, que não é passo. */}
            {i > 0 && <span className={a === 'cadastro' ? 'fu-aba-divisa' : 'fu-aba-traco'} aria-hidden="true" />}
            <button type="button" role="tab" id={`fu-aba-${a}`} className="fu-aba"
                    aria-selected={atual === a} aria-controls={`fu-painel-${a}`}
                    tabIndex={atual === a ? 0 : -1}
                    onClick={() => ao(a)}>
              {ROTULO_DA_ABA[a]}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * «NOVA FATURA» — os dois da referência: o contorno navy no alto e o leve no pé
 * da conferência. A referência pergunta num `window.confirm`; aqui a pergunta,
 * com o texto dela, acontece no lugar do botão, e só quando há o que perder.
 */
function NovaFatura({ emEdicao, ao, forma }: {
  emEdicao: string | null; ao: () => void; forma: 'topo' | 'pe';
}) {
  const [perguntando, setPerguntando] = useState(false);
  if (perguntando) {
    return (
      <PerguntaNaTela forma="linha" tom="perigo" rotulo="Confirmar: começar uma nova fatura"
                      manter="Manter a edição" confirmar="Começar uma nova fatura"
                      aoManter={() => setPerguntando(false)}
                      aoConfirmar={() => { setPerguntando(false); ao(); }}>
        Começar uma nova fatura? Os dados em edição ({emEdicao}) serão apagados. As faturas já
        registradas são mantidas.
      </PerguntaNaTela>
    );
  }
  return (
    <button type="button" className={forma === 'topo' ? 'fu-contorno' : 'fu-leve'}
            onClick={() => (emEdicao ? setPerguntando(true) : ao())}>
      Nova fatura
    </button>
  );
}

/* ============================================ a coluna da esquerda */

/**
 * «FATURA DA EQUATORIAL GOIÁS» — a área de envio. UM CAMPO SÓ, com `multiple`:
 * escolher um arquivo faz o que a referência faz (a conta enche a conferência);
 * escolher vários manda cada um para a fila do mês.
 */
function CartaoDaConta({ status, adicionar }: { status: string; adicionar: (f: FileList | null) => void }) {
  return (
    <div className="fu-cartao">
      <h2 className="fu-rot">Fatura da Equatorial Goiás</h2>
      <label className="fu-solta">
        <input type="file" accept="application/pdf,image/*" multiple
               onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
        <span className="fu-solta-titulo">Enviar fatura da distribuidora</span>
        <span className="fu-solta-sub">PDF ou foto/scan — os dados são extraídos e preenchidos abaixo</span>
      </label>
      <div className="fu-status solto" role="status">{status}</div>
    </div>
  );
}

/**
 * O PAINEL NAVY — «Boleto a gerar no banco»: o número que se digita no internet
 * banking, com o vencimento que a FOLHA imprime (o nosso, já antecipado — não o
 * da Equatorial) e a UC. A conta vem do servidor, em centavos; a tela nunca a
 * refaz.
 */
function PainelNavy({ composicao, campos, erro }: {
  composicao: ComposicaoUnificada | null; campos: CamposDaFatura; erro: string | null;
}) {
  const c = composicao?.conta;
  const total = erro ? '—' : composicao?.folha1.total.valor ?? emReais(0);
  const vencimento = composicao?.folha1.total.vencimento?.trim() || campos.vencimento.trim() || '—';
  return (
    <div className="fu-painel">
      <div className="fu-painel-rot">Boleto a gerar no banco</div>
      <div className="fu-painel-total">{total}</div>
      <div className="fu-painel-sub">Vencimento {vencimento} · UC {campos.unidade_consumidora.trim() || '—'}</div>
      <div className="fu-painel-par">
        <div>
          <div className="fu-painel-cap">Energia G3 (com desconto)</div>
          <div className="fu-painel-val">{erro ? '—' : emReais(c?.energia_g3_centavos ?? 0)}</div>
        </div>
        <div>
          <div className="fu-painel-cap">Repasses Equatorial</div>
          <div className="fu-painel-val">{erro ? '—' : emReais(c?.total_equatorial_centavos ?? 0)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * «BOLETO SICOOB»: o boleto emitido no banco, lido em dois tempos, e a
 * conferência dele.
 *
 * A CONFERÊNCIA VEM PRONTA DO SERVIDOR desde 14/08 (`pagamento.alertas`): as
 * perguntas da referência — vencimento, valor, beneficiário — mais a aritmética
 * dos 44 dígitos do código de barras, sem float e com o beneficiário conferido
 * contra a razão social CADASTRADA, e não contra `/g3/i`.
 */
function CartaoDoBoleto(p: {
  boleto: BoletoLido;
  setBoleto: Ajustar<BoletoLido>;
  composicao: ComposicaoUnificada | null;
  nome: string;
  status: LinhaDeStatus;
  lendo: boolean;
  escolher: (f: File) => void;
  ler: () => void;
}) {
  const id = useId();
  const pagamento = p.composicao?.folha2.pagamento ?? null;
  const alertas = pagamento?.alertas ?? [];
  const doBanco = pagamento?.boleto_origem === 'banco';
  const nossoNumero = pagamento?.campos.find((c) => c.rotulo === 'Nosso número')?.valor;
  const linhaConferida = Boolean(pagamento?.barras);
  const pix = p.boleto.pix_copia_e_cola.trim();
  /* A LINHA DO PIX É A DA REFERÊNCIA, com a verdade do servidor por cima: sem
     Pix colado e com a chave padrão cadastrada, a folha sai com o QR estático —
     e «sai apenas com boleto» seria falso. */
  const statusPix: LinhaDeStatus = !pix
    ? { texto: pagamento?.pix_origem === 'estatico'
          ? pagamento.pix_nota ?? 'Sem PIX no boleto — a folha sai com o QR do Pix estático.'
          : 'Sem PIX — o documento sai apenas com boleto.', tom: null }
    : !pix.startsWith('0002')
      ? { texto: 'Payload colado, mas não começa com 0002 — confira no boleto.', tom: 'alerta' }
      : pagamento?.qr && pagamento.pix_origem === 'boleto'
        ? { texto: 'Payload EMV reconhecido · QR Code gerado.', tom: 'ok' }
        : { texto: pagamento?.qr_motivo ? `O QR não pôde ser desenhado: ${pagamento.qr_motivo}` : 'Payload EMV reconhecido.', tom: pagamento?.qr_motivo ? 'alerta' : null };

  return (
    <div className="fu-cartao">
      <h2 className="fu-rot">Boleto Sicoob</h2>
      <label className="fu-solta curta">
        <input type="file" accept="application/pdf,image/*" disabled={p.lendo}
               onChange={(e) => reenviavel(e, p.escolher)} />
        <span className="fu-solta-titulo">Enviar boleto do banco</span>
        <span className="fu-solta-sub">PDF ou foto — linha digitável e PIX são lidos do arquivo</span>
      </label>
      <div className="fu-status">{p.nome}</div>
      <button type="button" className="fu-laranja largo" onClick={p.ler} disabled={p.lendo}>
        Ler boleto com IA
      </button>
      <Status tom={p.status.tom} margem="m8">{p.status.texto || 'Nenhum boleto lido ainda.'}</Status>
      {doBanco && (
        <div className="fu-status">
          Esta conta já é cobrança e tem boleto registrado no banco
          {nossoNumero && nossoNumero !== '—' ? ` (nosso número ${nossoNumero})` : ''}: a folha imprime a
          linha, o código de barras e o Pix dele. Os campos abaixo só valem para um boleto que ainda não
          está no banco.
        </div>
      )}

      <div className="fu-conf">
        <h3 className="fu-rot m8">Conferência do boleto</h3>
        {alertas.map((a) => <div key={a} className="fu-alerta" role="status">{a}</div>)}

        <div className="fu-par">
          <div>
            <label className="fu-leg" htmlFor={`${id}-venc`}>Vencimento no boleto</label>
            <input id={`${id}-venc`} className="fu-campo" value={p.boleto.vencimento} placeholder="DD/MM/AAAA"
                   onChange={(e) => { const v = e.target.value; p.setBoleto((s) => ({ ...s, vencimento: v })); }} />
          </div>
          <div>
            <label className="fu-leg" htmlFor={`${id}-valor`}>Valor no boleto</label>
            <input id={`${id}-valor`} className="fu-campo" value={p.boleto.valor} placeholder="0,00" inputMode="decimal"
                   onChange={(e) => { const v = e.target.value; p.setBoleto((s) => ({ ...s, valor: v })); }} />
          </div>
        </div>
        <div className="fu-par um">
          <div>
            <label className="fu-leg" htmlFor={`${id}-nn`}>Nosso número</label>
            <input id={`${id}-nn`} className="fu-campo" value={p.boleto.nosso_numero} placeholder="1-3"
                   onChange={(e) => { const v = e.target.value; p.setBoleto((s) => ({ ...s, nosso_numero: v })); }} />
          </div>
        </div>
        <div className="fu-status">Beneficiário lido: {p.boleto.beneficiario || '—'}</div>

        <label className="fu-leg area" htmlFor={`${id}-instrucoes`}>
          Instruções do boleto <span className="fu-leg-nota">· uma por linha</span>
        </label>
        <textarea id={`${id}-instrucoes`} className="fu-campo" rows={4} value={p.boleto.instrucoes.join('\n')}
                  placeholder="A partir 18/08/2026 Juros 0,03%/dia."
                  onChange={(e) => { const v = e.target.value; p.setBoleto((s) => ({ ...s, instrucoes: v.split('\n') })); }} />

        <label className="fu-leg area" htmlFor={`${id}-linha`}>Linha digitável</label>
        <textarea id={`${id}-linha`} className="fu-campo mono" rows={2} value={p.boleto.linha_digitavel}
                  inputMode="numeric" spellCheck={false} placeholder="47 dígitos"
                  onChange={(e) => { const v = e.target.value; p.setBoleto((s) => ({ ...s, linha_digitavel: v })); }} />
        <StatusDaLinha
          digitos={p.boleto.linha_digitavel.replace(/\D/g, '')}
          motivo={pagamento?.barras_motivo ?? null}
          desenhou={linhaConferida} />

        <label className="fu-leg area" htmlFor={`${id}-pix`}>PIX copia e cola</label>
        <textarea id={`${id}-pix`} className="fu-campo mono miudo" rows={3} value={p.boleto.pix_copia_e_cola}
                  spellCheck={false} placeholder="00020101…"
                  onChange={(e) => { const v = e.target.value.replace(/\s+/g, ''); p.setBoleto((s) => ({ ...s, pix_copia_e_cola: v })); }} />
        <Status tom={statusPix.tom} margem="rente">{statusPix.texto}</Status>
      </div>
    </div>
  );
}

/**
 * «PARÂMETROS» — desconto e fator de CO₂, com a linha forte e o fundo da
 * página: são decisão de quem opera, não dado lido. O valor nasce do MODELO
 * cadastrado, e a nota diz de onde — foi essa dúvida que deixou a coluna do
 * cadastro inerte por 25 dias (08/09/2026).
 */
function CartaoDosParametros({ parametros, setParametros, modelo }: {
  parametros: ParametrosDaEmissao; setParametros: Ajustar<ParametrosDaEmissao>; modelo: ModeloDeFatura | null;
}) {
  const id = useId();
  /* [01/10/2026, etapa 6] Com vírgula, e a recusa do ambíguo dita no próprio
     campo — ver `camposParaDecimais` em `dinheiro.ts`. */
  const conv = camposParaDecimais(parametros);
  const erros: Partial<Record<keyof ParametrosDaEmissao, string>> = conv.ok ? {} : conv.erros;
  return (
    <div className="fu-cartao">
      <h2 className="fu-rot">Parâmetros</h2>
      <div className="fu-par2">
        <div>
          <label className="fu-leg" htmlFor={`${id}-desc`}>Desconto (%)</label>
          <input id={`${id}-desc`} className="fu-campo forte" value={parametros.percentual_desconto}
                 inputMode="decimal" aria-invalid={erros.percentual_desconto ? true : undefined}
                 onChange={(e) => { const v = e.target.value; setParametros((s) => ({ ...s, percentual_desconto: v })); }} />
          {erros.percentual_desconto && <div className="fu-campo-erro">{erros.percentual_desconto}</div>}
        </div>
        <div>
          <label className="fu-leg" htmlFor={`${id}-fator`}>Fator CO₂ (kg/kWh)</label>
          <input id={`${id}-fator`} className="fu-campo forte" value={parametros.fator_emissao}
                 inputMode="decimal" aria-invalid={erros.fator_emissao ? true : undefined}
                 onChange={(e) => { const v = e.target.value; setParametros((s) => ({ ...s, fator_emissao: v })); }} />
          {erros.fator_emissao && <div className="fu-campo-erro">{erros.fator_emissao}</div>}
        </div>
      </div>
      <p className="fu-nota">Fator médio da margem de operação do SIN — MCTI/SIRENE.</p>
      <p className="fu-nota">
        {modelo
          ? `Padrão do modelo «${modelo.nome}»: ${percentualEmBr(modelo.percentual_desconto_padrao)} de desconto. `
          : 'Ainda sem modelo de folha — os valores acima são os de partida do sistema. '}
        Alterar aqui vale só para esta conta.
      </p>
    </div>
  );
}

/**
 * «FATURAS REGISTRADAS NESTA UC» — a série da unidade que está na conferência:
 * mês, total e «excluir», e «Registrar este mês» embaixo, junto do que já foi
 * gravado (registrar escreve e muda o que a folha do mês que vem afirma).
 *
 * A CONTA QUE JÁ VIROU COBRANÇA diz isso no lugar do «excluir»: o servidor
 * recusa apagar a fonte da 2ª via de uma cobrança que existe
 * (`RegistroJaFaturado`), e oferecer o ato para recusá-lo é prometer o que não
 * acontece. Espera a digitação parar — a UC é um campo editável.
 */
function RegistradasDaUnidade({ uc, versao, registrar, registrando, status, excluir }: {
  uc: string; versao: number; registrar: () => void; registrando: boolean;
  status: string | null; excluir: (r: RegistroDeFatura) => void;
}) {
  const alvo = uc.trim();
  const [lista, setLista] = useState<RegistroDeFatura[]>([]);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  useEffect(() => {
    if (!alvo) { setLista([]); return; }
    let vivo = true;
    const t = setTimeout(() => {
      api.get<RegistroDeFatura[]>(`/faturas/unificada/registros?unidade_consumidora=${encodeURIComponent(alvo)}`)
        .then((r) => { if (vivo) setLista(r); })
        .catch(() => { if (vivo) setLista([]); });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [alvo, versao]);

  /* Do mais antigo ao mais novo, como a referência (`mes_key` crescente). */
  const ordenada = [...lista].sort((a, b) => a.competencia.localeCompare(b.competencia));
  const mesDe = (r: RegistroDeFatura) => {
    const [aaaa, mm] = mesDoRegistro(r).split('-');
    return `${mm}/${aaaa}`;
  };
  return (
    <div className="fu-cartao">
      <h2 className="fu-rot m12">Faturas registradas nesta UC</h2>
      {ordenada.length === 0 && <div className="fu-vazio">Nenhuma fatura registrada ainda.</div>}
      {ordenada.map((r) => (
        <Fragment key={r.id}>
          <div className="fu-registro">
            <span>{mesDe(r)}</span>
            <span className="fu-registro-dir">
              <span className="fu-registro-val">{emReais(r.total_centavos)}</span>
              {r.fatura_id
                ? <span className="fu-registro-val">cobrança gerada</span>
                : (
                  <button type="button" className="fu-excluir" aria-label={`Excluir o registro de ${mesDe(r)}`}
                          aria-expanded={excluindo === r.id} onClick={() => setExcluindo(r.id)}>excluir</button>
                )}
            </span>
          </div>
          {excluindo === r.id && (
            <PerguntaNaTela forma="linha" tom="perigo" rotulo={`Confirmar: excluir o registro de ${mesDe(r)}`}
                            manter="Manter" confirmar="Excluir o registro"
                            aoManter={() => setExcluindo(null)}
                            aoConfirmar={() => { setExcluindo(null); excluir(r); }}>
              Excluir o registro de {mesDe(r)} desta unidade? A economia acumulada da folha 2 deixa de contar
              este mês.
            </PerguntaNaTela>
          )}
        </Fragment>
      ))}
      <button type="button" className="fu-contorno largo" onClick={registrar} disabled={registrando}>
        {registrando ? 'Registrando…' : 'Registrar este mês'}
      </button>
      {status && <div className="fu-status m8" role="status">{status}</div>}
    </div>
  );
}

/* ========================================= a coluna da direita */

/** Um campo da conferência: a legenda miúda da referência sobre o campo — e
 *  ligada a ele (`htmlFor`): tocar na legenda põe o cursor no campo. */
function CampoDaConta({ rotulo, valor, ao, dica }: {
  rotulo: string; valor: string; ao: (v: string) => void; dica?: string;
}) {
  const id = useId();
  return (
    <div>
      <label className="fu-leg" htmlFor={id}>{rotulo}</label>
      <input id={id} className="fu-campo" value={valor} placeholder={dica ?? ''}
             onChange={(e) => ao(e.target.value)} />
    </div>
  );
}

/**
 * «CONFERÊNCIA DOS DADOS» — «A extração preenche, você confere». As quatro
 * seções da referência em três colunas, o histórico em fichas, os campos que o
 * tenant inventou e os dois atos: «Ver a fatura do cliente» e «Nova fatura».
 */
function ConferenciaDosDados(p: {
  campos: CamposDaFatura;
  mudar: (k: keyof CamposDaFatura) => (v: string) => void;
  setCampos: Ajustar<CamposDaFatura>;
  composicao: ComposicaoUnificada | null;
  erroDaComposicao: string | null;
  personalizados: Record<string, string>;
  setPersonalizados: Ajustar<Record<string, string>>;
  verFatura: () => void;
  novaFatura: ReactNode;
}) {
  /* As seções e os campos são os da referência, na ordem dela. «Outros encargos
     (R$)» é nosso, e fica por último: o servidor o usa para conferir se as
     parcelas fecham com o total da Equatorial (`residuo_discorda`). */
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
      ['Energia compensada (kWh)', 'energia_compensada_kwh', 'ex.: 156,08'],
      ['Tarifa cheia (R$/kWh)', 'tarifa_kwh', 'ex.: 1,185396'],
    ] },
    { titulo: 'Repasses Equatorial', campos: [
      ['Consumo não compensado (kWh)', 'consumo_nao_compensado_kwh', 'ex.: 42,50'],
      ['Consumo não compensado (R$)', 'consumo_nao_compensado_valor'],
      ['Iluminação pública (R$)', 'iluminacao_publica'],
      ['Bandeira tarifária', 'bandeira_tarifaria'],
      ['Bandeira (R$)', 'bandeira_valor'],
      ['Total Equatorial (R$)', 'valor_total_equatorial'],
      ['Outros encargos (R$)', 'outros_encargos'],
    ] },
  ];
  const hist = p.campos.historico_consumo;
  /* O MOTIVO VEM DE QUEM DECIDE: a folha 2 esconde o gráfico quando a série não
     parece consumo real (`histPlausivel` da referência), e o servidor diz por quê. */
  const statusHist = hist.length === 0
    ? 'Sem histórico lido — o gráfico de consumo ficará oculto.'
    : p.composicao?.folha2.historico_motivo ?? `${hist.length} meses lidos do PDF.`;

  return (
    <div className="fu-cartao largo" id="fu-conferencia">
      <div className="fu-cabeca">
        <h2 className="fu-titulo" id="fu-conferencia-titulo" tabIndex={-1}>Conferência dos dados</h2>
        <div className="fu-cabeca-sub">A extração preenche, você confere</div>
      </div>
      {p.erroDaComposicao && (
        <div className="fu-alerta grande" role="alert">Não foi possível compor a fatura: {p.erroDaComposicao}</div>
      )}

      {secoes.map((s) => (
        <div key={s.titulo} className="fu-secao">
          <h3 className="fu-secao-tit">{s.titulo}</h3>
          <div className="fu-campos3">
            {s.campos.map(([rotulo, chave, dica]) => (
              <CampoDaConta key={chave} rotulo={rotulo} dica={dica}
                            valor={String(p.campos[chave] ?? '')} ao={p.mudar(chave)} />
            ))}
          </div>
        </div>
      ))}

      {/* O MOTIVO VEM DE QUEM TOMOU A DECISAO: os cartões da folha 1 somem sem
          tarifa, e o servidor diz por quê (a referência: «Esta fatura não tem
          consumo não compensado — informe a tarifa manualmente.»). */}
      {/* Só com a energia compensada digitada, como na referência (`avisoTarifa`):
          com a conta vazia o motivo é óbvio e o aviso seria ruído. */}
      {p.campos.energia_compensada_kwh.trim() && p.composicao?.folha1.cartoes_motivo && (
        <div className="fu-alerta grande">{p.composicao.folha1.cartoes_motivo}</div>
      )}

      <div className="fu-hist">
        <h3 className="fu-secao-tit">Histórico de consumo lido no PDF</h3>
        {hist.length > 0 && (
          <div className="fu-hist-edit">
            {hist.map((h, i) => (
              <div key={`${h.mes}-${i}`} className="fu-hist-item">
                <span className="fu-hist-mes">{h.mes}</span>
                <input className="fu-hist-kwh" value={h.kwh} aria-label={`Consumo de ${h.mes} em kWh`}
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
        )}
        <div className="fu-status">{statusHist}</div>
      </div>

      {/* SO OS CAMPOS DE ORIGEM `variavel`: os `fixo` vivem no cadastro e saem
          iguais em toda folha. */}
      <CamposDoTenant valores={p.personalizados} ao={p.setPersonalizados} />

      <div className="fu-acoes-pe">
        <button type="button" className="fu-laranja" onClick={p.verFatura}>Ver a fatura do cliente</button>
        {p.novaFatura}
      </div>
    </div>
  );
}

/* ======================================================== as registradas */

/**
 * ============================================================================
 * AS CONTAS REGISTRADAS — o que busca e grava. O desenho e `TabelaDasRegistradas`.
 *
 * A HISTORIA DESTA LISTA, curta. Ela nasceu em 14/08 como o cartao «Faturas
 * registradas nesta UC» da referencia (mes, total, excluir), ganhou em 08/09 o
 * modo do MES (`GET` sem `unidade_consumidora` devolve as mais recentes do
 * tenant) e em 21/08 os dois atos que fazem a conta virar cobranca: «conferir
 * antes» (`/ensaio`, que nao escreve) e «gerar cobrança» (`/faturar`).
 *
 * EM 30/09 ELA VIROU TABELA PROPRIA, e as razoes estao em
 * `registradas-regras.ts`. O que mora aqui e o que tem efeito: buscar, ensaiar,
 * gerar em serie e excluir.
 *
 * AS COBRANCAS SAEM UMA A UMA, NA ORDEM, e nunca em paralelo: cada uma sao
 * duas escritas na mesma transacao do servidor (criar a fatura e apontar a
 * linha para ela), e duas em voo disputariam a trava que impede o mesmo mes de
 * ser cobrado duas vezes. A tela mostra a situacao de cada linha enquanto a
 * rodada anda — «Gerando…», «Cobrança gerada» ou «Recusada» com a frase do
 * servidor.
 *
 * O SERVIDOR RECUSA NOMEANDO, e e por isso que a tela nao confere nada antes:
 * quem sabe se falta contrato, geracao ou vencimento e a triagem, e duplicar a
 * decisao aqui daria duas respostas para a mesma pergunta.
 */
function ContasRegistradas({ cadastro, versao, principal, unidade, aoMudarUnidade, segundaVia, emEdicao, aoMudar, mesDoTrabalho }: {
  /** O MÊS DE TRABALHO, da casca (etapa 8) — `null` enquanto ele é procurado.
   *  Até aqui a lista tinha o próprio filtro de mês e abria no mês mais recente
   *  com conta por gerar (`mesPadrao`); hoje ela mostra o mês escolhido no
   *  menu, o mesmo do Mês e de Cobranças, e o critério daquela abertura virou
   *  parte da procura do trabalho (`procurarMesComTrabalho`). */
  mesDoTrabalho: string | null;
  cadastro: ReadonlyMap<string, string>;
  versao: number;
  principal: boolean;
  unidade: string | null;
  aoMudarUnidade: (uc: string | null) => void;
  segundaVia: (r: RegistroDeFatura) => Promise<void>;
  emEdicao: string | null;
  aoMudar: () => void;
}) {
  const [confirmandoSegundaVia, setConfirmandoSegundaVia] = useState<string | null>(null);
  const [lista, setLista] = useState<RegistroDeFatura[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [soSemCobranca, setSoSemCobranca] = useState(false);
  const [desmarcadas, setDesmarcadas] = useState<ReadonlySet<string>>(new Set());
  const [revisando, setRevisando] = useState(false);
  const [rodada, setRodada] = useState<Record<string, EstadoDaGeracao>>({});
  const [rodadaIds, setRodadaIds] = useState<string[]>([]);
  const [rodando, setRodando] = useState(false);
  /* O resultado do ensaio por registro. Fica na tela ate a proxima rodada:
   * quem conferiu dez linhas precisa ver as dez respostas ao mesmo tempo. */
  const [ensaio, setEnsaio] = useState<Record<string, { vira: boolean; frase: string }>>({});
  const [ensaiando, setEnsaiando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const alvo = unidade?.trim() ?? '';

  /*
   * DOIS PEDIDOS, e a pergunta e da pessoa, nao do formulario. Com o chip de
   * unidade, a SERIE dela (que atravessa meses e pode ser mais velha que as 500
   * mais recentes); sem ele, as mais recentes do tenant. Ate 30/09 o segundo
   * pedido trocava pelo primeiro sozinho quando o formulario tinha unidade.
   */
  useEffect(() => {
    let vivo = true;
    const caminho = alvo
      ? `/faturas/unificada/registros?unidade_consumidora=${encodeURIComponent(alvo)}`
      : `/faturas/unificada/registros?limite=${LIMITE_DA_LISTA}`;
    api.get<RegistroDeFatura[]>(caminho)
      .then((r) => { if (vivo) { setLista(r); setErro(null); } })
      .catch((e) => { if (vivo) { setLista([]); setErro(naMensagem(e)); } });
    return () => { vivo = false; };
  }, [alvo, versao]);

  /* A SÉRIE DE UMA UNIDADE ATRAVESSA MESES: com o chip, a lista mostra todos os
   * meses dela; sem ele, o mês de trabalho. [etapa 8] O filtro de mês da lista
   * saiu — era o terceiro seletor de mês da tela. */
  const todas = lista ?? [];
  const mes = alvo ? null : mesDoTrabalho;
  const filtro: FiltroDasRegistradas = { mes, soSemCobranca, unidade: alvo || null };
  /* A ORDEM E A DO TRABALHO (`ordemDasRegistradas`), e ela so muda quando a
   * lista RECARREGA — que e no fim da rodada, nunca no meio: uma linha que vira
   * cobranca nao desce para o grupo de baixo embaixo do dedo de quem acompanha. */
  const ordenada = useMemo(() => ordemDasRegistradas(lista ?? []), [lista]);
  const visiveis = filtrarRegistradas(ordenada, filtro);
  const marcadas = selecaoParaGerar(visiveis, desmarcadas);

  async function ensaiar(r: RegistroDeFatura) {
    setEnsaiando(r.id);
    try {
      const e = await api.get<{ faturar: boolean; motivo?: string; numero_uc: string }>(
        `/faturas/unificada/registros/${r.id}/ensaio`);
      setEnsaio((s) => ({ ...s, [r.id]: e.faturar
        ? { vira: true, frase: 'Vira cobrança — nada foi gravado ainda.' }
        /* A EXPLICACAO VEM DO DOMINIO, e nao de uma tabela escrita aqui: e a
         * MESMA que o servidor usa para recusar de verdade
         * (`FaturaDoRegistroRecusada`). Uma copia nesta tela diria uma coisa e a
         * recusa real diria outra no dia em que um motivo mudasse. */
        : { vira: false, frase: `Não vira cobrança: ${EXPLICACAO_DO_REGISTRO[
            e.motivo as keyof typeof EXPLICACAO_DO_REGISTRO] ?? e.motivo}.` } }));
    } catch (e) {
      setEnsaio((s) => ({ ...s, [r.id]: { vira: false, frase: `Não consegui conferir: ${naMensagem(e)}` } }));
    } finally { setEnsaiando(null); }
  }

  /** «Conferir antes as N» — o ensaio de cada marcada, em serie. Nao escreve. */
  async function ensaiarTodas() {
    for (const r of marcadas) await ensaiar(r);
  }

  async function gerar() {
    const ids = marcadas.map((r) => r.id);
    if (ids.length === 0) return;
    setRodadaIds(ids);
    setRodada(Object.fromEntries(ids.map((id) => [id, { estado: 'na_vez' } as EstadoDaGeracao])));
    setRodando(true);
    const recusadas: string[] = [];
    try {
      for (const id of ids) {
        setRodada((s) => ({ ...s, [id]: { estado: 'gerando' } }));
        try {
          await api.post(`/faturas/unificada/registros/${id}/faturar`, {});
          setRodada((s) => ({ ...s, [id]: { estado: 'gerada' } }));
        } catch (e) {
          recusadas.push(id);
          setRodada((s) => ({ ...s, [id]: { estado: 'recusada', motivo: naMensagem(e) } }));
        }
      }
    } finally {
      setRodando(false);
      /* A RECUSADA SAI DA SELECAO: continuar marcada faria o botao prometer
       * «Gerar 1 cobrança» para a mesma conta que o servidor acabou de recusar.
       * Remarca-se depois de resolver o motivo. */
      if (recusadas.length > 0) setDesmarcadas((s) => new Set([...s, ...recusadas]));
      aoMudar();
    }
  }

  function fecharRevisao() {
    setRevisando(false);
    /* O PLACAR SAI, AS RECUSAS FICAM: o motivo de cada recusada continua na
     * linha dela ate a proxima rodada — e ele que diz o que resolver. */
    setRodadaIds([]);
    setRodada((s) => Object.fromEntries(Object.entries(s).filter(([, g]) => g.estado === 'recusada')));
  }

  async function excluir(r: RegistroDeFatura) {
    try {
      await api.del(`/faturas/unificada/registros/${r.id}`);
      setExcluindo(null);
      aoMudar();
      /* A linha some; o foco vai para o titulo da lista, e nao para o nada. */
      requestAnimationFrame(() => document.getElementById('fu-registradas-titulo')?.focus());
    } catch (e) { setErro(naMensagem(e)); }
  }

  function pedirExclusao(id: string | null) {
    const antes = excluindo;
    setExcluindo(id);
    /* «MANTER» DEVOLVE O FOCO ao icone que abriu a confirmacao. */
    if (id === null && antes) {
      const r = todas.find((x) => x.id === antes);
      if (r) {
        const rotulo = `Excluir o registro de ${mesCurto(mesDoRegistro(r))} da unidade ${numeroDaUcNaTela(r.numero_uc, cadastro)}`;
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`button[aria-label="${rotulo}"]`)?.focus());
      }
    }
  }

  return (
    <TabelaDasRegistradas
      cadastro={cadastro}
      /* Sem o mês de trabalho ainda (a procura anda), a lista espera: mostrar
         todos os meses por um instante seria mostrar o recorte errado. */
      lista={!alvo && !mesDoTrabalho ? null : lista} visiveis={visiveis} erro={erro} filtro={filtro}
      parcial={!alvo && listaParcial(todas)}
      aoFiltrar={(f) => setSoSemCobranca(f.soSemCobranca)}
      desmarcadas={desmarcadas}
      aoMarcar={(id, marcada) => setDesmarcadas((s) => {
        const n = new Set(s);
        if (marcada) n.delete(id); else n.add(id);
        return n;
      })}
      aoMarcarTodas={(marcar) => setDesmarcadas((s) => {
        const n = new Set(s);
        for (const r of visiveis.filter(podeGerar)) { if (marcar) n.delete(r.id); else n.add(r.id); }
        return n;
      })}
      principal={principal}
      revisando={revisando}
      aoRevisar={(abrir) => (abrir ? setRevisando(true) : fecharRevisao())}
      rodada={rodada} rodadaIds={rodadaIds} rodando={rodando}
      aoGerar={() => void gerar()}
      ensaio={ensaio} ensaiando={ensaiando}
      aoEnsaiar={(r) => void ensaiar(r)} aoEnsaiarTodas={() => void ensaiarTodas()}
      aoSegundaVia={(r) => {
        segundaVia(r).catch((e) => setErro(`Não foi possível abrir a 2ª via: ${naMensagem(e)}`));
      }}
      emEdicao={emEdicao} confirmandoSegundaVia={confirmandoSegundaVia}
      aoPedirSegundaVia={(id) => {
        const antes = confirmandoSegundaVia;
        setConfirmandoSegundaVia(id);
        /* «Manter a edição» devolve o foco ao «2ª via» que abriu a pergunta. */
        if (id === null && antes) {
          const r = todas.find((x) => x.id === antes);
          if (r) {
            const rotulo = `2ª via de ${mesCurto(mesDoRegistro(r))} da unidade ${numeroDaUcNaTela(r.numero_uc, cadastro)}`;
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`button[aria-label="${rotulo}"]`)?.focus());
          }
        }
      }}
      excluindo={excluindo} aoPedirExclusao={pedirExclusao} aoExcluir={(r) => void excluir(r)}
      aoVerUnidade={aoMudarUnidade}
    />
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
      <h3 className="fu-secao-tit">Campos desta folha</h3>
      <div className="fu-campos3">
        {campos.map((c) => (
          <CampoDaConta key={c.chave} rotulo={c.rotulo} valor={valores[c.chave] ?? ''}
                        ao={(v) => ao((s) => ({ ...s, [c.chave]: v }))} />
        ))}
      </div>
      <p className="fu-nota">
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

/** As frases da referência para a linha digitável. Quem decide se ela confere
 *  é o servidor (os quatro dígitos verificadores, `barras_motivo`). */
function StatusDaLinha({ digitos, motivo, desenhou }: {
  digitos: string; motivo: string | null; desenhou: boolean;
}) {
  if (desenhou) {
    return <Status tom="ok" margem="rente">Linha válida · dígitos verificadores conferidos · código de barras gerado.</Status>;
  }
  if (digitos.length === 0) {
    return <Status margem="rente">Cole a linha digitável de 47 dígitos gerada no banco.</Status>;
  }
  if (digitos.length !== 47) {
    return (
      <Status tom="alerta" margem="rente">
        {digitos.length} de 47 dígitos — o código de barras não será impresso. O campo é editável: corrija
        manualmente a partir do boleto.
      </Status>
    );
  }
  return (
    <Status tom="alerta" margem="rente">
      A linha digitável lida parece incorreta{motivo ? ` (${semPontoFinal(motivo)})` : ''}. Confira o boleto e
      corrija o campo.
    </Status>
  );
}

/* ================================================= aba 2: a folha do cliente */

/**
 * «2 · EMISSÃO» — A FOLHA QUE O CLIENTE RECEBE, da conta em edição, para
 * conferir e imprimir. A barra é a da referência: «Fatura <nº> · <mês>» à
 * esquerda, «Voltar ao painel» e «Imprimir fatura» à direita, na largura da folha.
 *
 * O NOME VOLTOU EM 14/10/2026 (de 30/09 a 14/10 a aba foi «Folha do cliente»):
 * a colisão era com a tela «Emissão e cobrança», que hoje se chama «Cobranças».
 *
 * SEM CONTA, A BARRA FICA E A FOLHA NÃO: a referência desenha uma folha de
 * «Nome do cliente» e travessões, e uma folha assim impressa por engano é papel
 * que parece fatura. É o único desvio desta aba, e é de propósito.
 */
function AbaDaFolha({ composicao, logoUrl, temConta, erro, mes, voltar }: {
  composicao: ComposicaoUnificada | null; logoUrl: string | null;
  temConta: boolean;
  erro: string | null;
  /** O mês de referência da conta, como digitado («09/2026»). */
  mes: string;
  voltar: () => void;
}) {
  const barra = (
    <div className="fu-barra naoimprime">
      <span className="fu-barra-txt">Fatura {composicao?.numero_da_fatura ?? '—'} · {mes || '—'}</span>
      <div className="fu-barra-acoes">
        <button type="button" className="fu-leve voltar" onClick={voltar}>Voltar ao painel</button>
        <button type="button" className="fu-imprimir" onClick={() => window.print()}
                disabled={!composicao || !temConta}>Imprimir fatura</button>
      </div>
    </div>
  );
  if (!composicao || !temConta) {
    return (
      <div className="naoimprime">
        {barra}
        <div className="fu-barra-aviso">
          {erro && <Aviso tipo="erro">Não foi possível compor a fatura: {erro}</Aviso>}
          <Aviso tipo="alerta">
            Nenhuma conta carregada. Em <strong>Leitura e cálculo</strong>, envie a conta da
            Equatorial (ou abra uma da fila em «Conferir», ou a «2ª via» de um mês já registrado).
          </Aviso>
        </div>
      </div>
    );
  }
  const { folha1, folha2 } = composicao;

  return (
    <>
      {barra}
      {erro && <div className="naoimprime fu-barra-aviso"><Aviso tipo="erro">Não foi possível compor a fatura: {erro}</Aviso></div>}

      {/* A REGRA `@page`, INJETADA — `size` nao aceita `var()` e por isso ela nao
          mora no `estilo.ts`. SEM ELA A FOLHA SAI EM DUAS PAGINAS: medido em
          14/08, o PDF das duas folhas veio com QUATRO paginas, porque o navegador
          usa a margem padrao do sistema e a folha tem 297 mm cravados — sobra 1 mm
          e ele quebra. `margin: 0` e o que faz os 297 mm caberem nos 297 mm. */}
      <style>{regraDaPagina('A4', 'retrato')}</style>

      <div id="documento">
        {/* ------------------------------------------------------- folha 1 */}
        <Palco>
          <Folha chave={composicao}>
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
                  <div key={m.rotulo} className={larguraDoCampoDaFolha(m.rotulo, m.valor)}>
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
          </Folha>
        </Palco>

        {/* ------------------------------------------------------- folha 2 */}
        <Palco>
          <Folha chave={composicao} segunda>
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
          </Folha>
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

/**
 * A FOLHA QUE SE MEDE — conserto de 30/09/2026.
 *
 * A folha tem 297 mm cravados (`.g3` no `estilo.ts`). Depois de pintar, ela mede
 * se o conteudo passou do pe e, se passou, sobe um degrau de aperto e mede de
 * novo — as regras e os degraus estao em `layout-regras.ts`, onde o runner
 * alcanca. E `useLayoutEffect` de proposito: a subida acontece ANTES de o
 * navegador pintar, entao a tela nunca mostra a folha estourada nem pisca.
 *
 * A PREVIA E A IMPRESSAO SAO O MESMO DOM, e a medida da tela vale para o papel:
 * a folha e milimetro fixo nos dois, e na tela ela ainda tem 1 px de borda de
 * cada lado que o papel nao tem — a tela mede com MENOS espaco, entao o que cabe
 * nela cabe no papel. `document.fonts` refaz a conta quando a fonte chega,
 * porque a mesma frase muda de largura (e de numero de linhas) com a fonte.
 *
 * `data-aperto` fica no DOM para quem confere a folha poder ler o degrau.
 */
function Folha({ chave, segunda = false, children }: {
  chave: unknown; segunda?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nivel, setNivel] = useState(0);
  const [rodada, setRodada] = useState(0);
  const visto = useRef({ chave, rodada });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* COMPOSICAO NOVA OU FONTE NOVA: a conta recomeca do zero, e nao do degrau
       em que a folha anterior parou — uma fatura curta depois de uma longa tem
       de sair sem aperto nenhum. */
    if (visto.current.chave !== chave || visto.current.rodada !== rodada) {
      visto.current = { chave, rodada };
      if (nivel !== 0) { setNivel(0); return; }
    }
    const proximo = proximoNivelDoAperto(nivel, el.scrollHeight, el.clientHeight);
    if (proximo !== nivel) setNivel(proximo);
  });

  useEffect(() => {
    const fontes = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fontes) return;
    let vivo = true;
    const refazer = () => { if (vivo) setRodada((r) => r + 1); };
    void fontes.ready.then(refazer);
    fontes.addEventListener('loadingdone', refazer);
    return () => { vivo = false; fontes.removeEventListener('loadingdone', refazer); };
  }, []);

  const classes = ['g3', segunda ? 'g3-segunda' : '', classesDoAperto(nivel)].filter(Boolean).join(' ');
  return <div ref={ref} className={classes} data-aperto={nivel}>{children}</div>;
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
  const soPix = Boolean(p.qr) && !p.barras && !p.linha_formatada;
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
          inteira em vez de dividir com uma coluna vazia — e sem boleto, desde
          01/10, e o Pix que a ocupa: a via do boleto fica so na tela, com o
          motivo, e o papel nao imprime «Pague com boleto —». */}
      <div className="faixa-pgto-vias"
           style={{ gridTemplateColumns: p.qr && !soPix ? '0.8fr 1.2fr' : '1fr' }}>
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
            {/* O CUSTO DO ESTATICO E DE QUEM OPERA, nao do cliente: so na tela. */}
            {p.pix_nota && <div className="g3-pendente naoimprime">{p.pix_nota}</div>}
          </div>
        )}

        <div className={soPix ? 'faixa-pgto-via naoimprime' : 'faixa-pgto-via'}>
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

      {/* O PIX ESTATICO E O BOLETO SAO DUAS COBRANCAS SOLTAS: pagar um nao
          baixa o outro, como faria o Pix do proprio boleto. A frase vai no
          papel porque e o cliente quem pagaria duas vezes. */}
      {p.pix_origem === 'estatico' && p.barras && (
        <div className="faixa-pgto-nota" style={{ textAlign: 'center' }}>
          Pague por uma das formas — Pix ou boleto —, não pelas duas.
        </div>
      )}

      <div className="faixa-pgto-rodape">
        {p.rodape_legal.map((t) => <div key={t}>{t}</div>)}
      </div>
    </div>
  );
}
