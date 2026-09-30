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
// 30/09/2026 — A ABA 1 GANHA A TELA DO LOTE (etapa 1 do redesenho)
//
// A aba 1 era o porte de uma ferramenta de fatura AVULSA: o formulario de vinte
// campos na coluna larga e o lote do mes espremido numa coluna de 380px. Agora o
// trabalho do mes ocupa a largura toda — envio, fila, contas registradas — e a
// conta aberta em «Conferir» vai para uma GAVETA por cima, com o painel navy do
// boleto e os parametros dentro dela. Sem conta aberta nao ha formulario vazio
// nem «R$ 0,00» ocupando a tela. O que a tela DESENHA do lote mora em
// `fatura-lote-corpo.tsx`; o que ela BUSCA e GRAVA continua aqui, pelas mesmas
// rotas de sempre.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  api, CAMPOS_DA_FATURA_VAZIOS, PARAMETROS_PADRAO, BOLETO_LIDO_VAZIO,
  type CamposDaFatura, type ParametrosDaEmissao, type BoletoLido,
  type ComposicaoUnificada, type LinhaDetalhada, type CampoPersonalizado,
  type RegistroDeFatura, type UnidadeConsumidora, type ModeloDeFatura,
} from '../api.ts';
import { Aviso, Campo, Icone } from '../ui.tsx';
import { TrianguloDeAviso } from '../icones.tsx';
import { escalaDaPrevia, regraDaPagina, PX_POR_MM } from '../layout-regras.ts';
import { emReais } from '../dinheiro.ts';
import { useLargura } from '../medir-largura.ts';
import {
  ROTULO_DA_ABA, ABAS, abaDoFragmento, fragmentoDaAba, type AbaDaFatura,
} from '../abas-da-fatura.ts';
import { LOGO_G3_DATA_URI } from '../logo-g3.ts';
import { lerBase64, mimeDo, reenviavel, naMensagem } from '../arquivo.ts';
import { EXPLICACAO_DO_REGISTRO } from '../../../src/dominio/fatura-do-registro.ts';
import { lerCompetencia } from '../../../src/dominio/competencia.ts';
import {
  recusaDoArquivo, normalizarUc, chaveDoItem, resumoDoLote, corrigirItem, vizinhosNaFila,
  LEITURAS_SIMULTANEAS, type ItemDoLote,
} from '../lote-de-contas.ts';
import {
  LIMITE_DA_LISTA, mesesDaLista, mesPadrao, listaParcial, filtrarRegistradas, selecaoParaGerar,
  ordemDasRegistradas,
  podeGerar, mesDoRegistro, mesCurto, economiaAcumulada,
  type EstadoDaGeracao, type FiltroDasRegistradas,
} from '../registradas-regras.ts';
import { TabelaDaFila, TabelaDasRegistradas, GavetaDaConta } from '../fatura-lote-corpo.tsx';

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
 * O CADASTRO VIROU A TERCEIRA ABA EM 14/08, e nao e so mudanca de lugar: ele e
 * o que a folha IMPRIME - emissor, logo, chave Pix, os textos do documento e os
 * campos personalizados -, e "Cadastro de Fatura" e uma funcionalidade nomeada
 * pelo dono, nao um apendice. Desde 30/09 ela fica na barra (ver
 * `abas-da-fatura.ts`).
 */
export function FaturaUnificada({ logoUrl, tenantId, cadastro }: {
  logoUrl: string | null;
  /** Do `useSessao`. E a chave do rascunho — ver `RASCUNHO`. */
  tenantId: string | null;
  cadastro?: ReactNode;
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
  const abaAgora = useRef(aba);
  abaAgora.current = aba;

  const rascunho = lerRascunho(tenantId);
  const [campos, setCampos] = useState<CamposDaFatura>(rascunho?.campos ?? CAMPOS_DA_FATURA_VAZIOS);
  const [parametros, setParametros] = useState<ParametrosDaEmissao>(rascunho?.parametros ?? PARAMETROS_PADRAO);
  /* `true` assim que a tela passa a ter opiniao propria sobre os parametros:
   * rascunho recuperado, segunda via carregada, ou alguem digitando no campo.
   * Enquanto for `false`, o padrao CADASTRADO manda — ver o bloco em `compor`. */
  const parametrosTocados = useRef(rascunho?.parametros != null);
  const [boleto, setBoleto] = useState<BoletoLido>(rascunho?.boleto ?? BOLETO_LIDO_VAZIO);
  const [personalizados, setPersonalizados] = useState<Record<string, string>>(
    rascunho?.campos_personalizados ?? {});

  const [composicao, setComposicao] = useState<ComposicaoUnificada | null>(null);
  const [erroDaComposicao, setErroDaComposicao] = useState<string | null>(null);

  const [statusFatura, setStatusFatura] = useState(
    rascunho ? 'Rascunho recuperado — os campos abaixo são os que estavam em edição.' : 'Nenhum arquivo enviado.');
  const [statusBoleto, setStatusBoleto] = useState('Nenhum boleto enviado.');
  const [lendoBoleto, setLendoBoleto] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [statusRegistro, setStatusRegistro] = useState<string | null>(null);
  /* SOBE A CADA ESCRITA em `fatura_unificada_registrada` — registro novo,
   * exclusao ou cobranca gerada. E o que manda as listas de registro relerem sem
   * que esta tela guarde uma copia delas para manter em dia. */
  const [registrosVersao, setRegistrosVersao] = useState(0);

  /*
   * ==========================================================================
   * A GAVETA — 30/09/2026
   *
   * `gaveta` diz se ela esta aberta; `abertoId`, QUAL linha da fila ela mostra
   * (ou `null`: conta digitada, segunda via, rascunho recuperado). Os campos
   * continuam sendo os do rascunho — a gaveta nao tem estado proprio, ela e a
   * janela do rascunho. Fechar nao perde nada, e por isso nao pergunta.
   */
  const [gaveta, setGaveta] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  /** Quem abriu a gaveta, para o foco voltar a ele. */
  const gatilho = useRef<HTMLElement | null>(null);
  /** O chip de unidade da lista de registradas. Ver `FiltroDasRegistradas`. */
  const [unidadeDaLista, setUnidadeDaLista] = useState<string | null>(null);

  /*
   * ==========================================================================
   * O LOTE DO MES — `Q-CONTA-LOTE-01`, decidida em 08/09/2026
   *
   * A carteira tem 29 UCs e a conta da distribuidora chega todo mes. Ate aqui a
   * tela subia UM arquivo por vez, e a camada `conta_lida_da_competencia` da
   * prontidao marcava 0 de 29 — nao por falta de servidor, que esta inteiro,
   * mas porque o unico jeito de exercita-lo era 29 idas ao seletor de arquivo.
   *
   * O QUE ESTE ESTADO NAO E: um segundo caminho de composicao. A fila LE e
   * REGISTRA pelas MESMAS duas rotas que o painel de uma conta ja usa
   * (`/faturas/ler-fatura` e `/faturas/unificada/registros`). Quem confere campo
   * a campo continua conferindo no painel — «Conferir» abre a linha na gaveta.
   *
   * As regras de "esta linha pode registrar?" moram em `lote-de-contas.ts`, sem
   * JSX, porque o runner do `web/` nao le `.tsx` e o que nao pode ser verificado
   * nao e regra (regra 8).
   */
  const [lote, setLote] = useState<ItemDoLote[]>(rascunho?.lote ?? []);
  const [registrandoLote, setRegistrandoLote] = useState(false);
  /** As UCs do cadastro, so para AVISAR que a conta e de uma unidade que nao
   *  existe aqui. Nao bloqueia — o servidor aceita `unidade_consumidora_id` nulo. */
  const [ucsDoCadastro, setUcsDoCadastro] = useState<ReadonlySet<string>>(new Set());

  /* Os `File` NAO entram no estado do React: eles nao sao serializaveis, nao vao
   * para o rascunho e manter um PDF de 3 MB por linha em `useState` seguraria a
   * memoria da aba inteira depois que a leitura ja acabou. O estado guarda o que
   * a tela mostra; o arquivo vive aqui e some assim que e lido. */
  const arquivosDoLote = useRef(new Map<string, File>());
  const proximoIdDoLote = useRef(0);
  const loteAgora = useRef<ItemDoLote[]>([]);
  useEffect(() => { loteAgora.current = lote; }, [lote]);

  useEffect(() => {
    let vivo = true;
    api.get<UnidadeConsumidora[]>('/unidades-consumidoras')
      .then((l) => { if (vivo) setUcsDoCadastro(new Set(l.map((u) => normalizarUc(u.numero_uc)))); })
      /* A LISTA E CONVENIENCIA, e falhar em busca-la nao pode travar o lote: sem
       * ela `avisoDoItem` simplesmente nao acusa UC desconhecida (verificacao
       * `L3i`), que e o certo — acusar sem saber seria acusar o proprio
       * desconhecimento. */
      .catch(() => { if (vivo) setUcsDoCadastro(new Set()); });
    return () => { vivo = false; };
  }, [tenantId]);

  const ajustarItem = useCallback((id: string, mudar: (i: ItemDoLote) => ItemDoLote) => {
    setLote((s) => s.map((i) => (i.id === id ? mudar(i) : i)));
  }, []);

  /* O que a gaveta corrige volta para a linha aberta — ver `corrigirItem`. Sem
   * isto, digitar na gaveta a unidade que a conta nao trouxe resolvia o painel e
   * deixava a linha da fila dizendo «Corrigir» para sempre. Devolve o MESMO
   * array quando nada mudou: abrir a gaveta copia os campos da linha, e isso nao
   * pode regravar o rascunho nem redesenhar a fila. */
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

  const lerItemDoLote = useCallback(async (id: string) => {
    const f = arquivosDoLote.current.get(id);
    if (!f) return;
    ajustarItem(id, (i) => ({ ...i, estado: 'lendo', erro: null }));
    try {
      const lido = await api.post<CamposDaFatura>('/faturas/ler-fatura', {
        conteudo_base64: await lerBase64(f), tipo: mimeDo(f),
      });
      const campos = { ...CAMPOS_DA_FATURA_VAZIOS, ...lido };
      ajustarItem(id, (i) => ({ ...i, estado: 'lido', erro: null, campos }));
      /* UM ARQUIVO SO ABRE SOZINHO — e o fluxo que a tela tinha antes do lote,
       * preservado. Quem sobe uma conta continua vendo os campos aparecerem sem
       * clicar em nada, agora na gaveta; quem sobe 29 nao quer que a vigesima
       * nona sobrescreva a conferencia da primeira. */
      if (loteAgora.current.length === 1) {
        setCampos(campos);
        setBoleto(BOLETO_LIDO_VAZIO);
        setStatusFatura(`Dados extraídos de «${f.name}». Confira campo a campo.`);
        setStatusRegistro(null);
        setAbertoId(id);
        if (abaAgora.current === 'leitura') {
          gatilho.current = null;
          setGaveta(true);
        }
      }
    } catch (e) {
      /* A LINHA QUE FALHOU NAO SOME e continua com o nome do arquivo: e por ele
       * que a pessoa sabe qual PDF reenviar. Some seria pior que falhar. */
      ajustarItem(id, (i) => ({ ...i, estado: 'falhou', erro: naMensagem(e) }));
    } finally {
      arquivosDoLote.current.delete(id);
    }
  }, [ajustarItem]);

  /*
   * A BOMBA DA FILA: no maximo `LEITURAS_SIMULTANEAS` leituras ao mesmo tempo.
   *
   * Reage a `lote` porque toda leitura que termina muda o estado — entao a
   * proxima parte sozinha, sem `setInterval` e sem uma fila paralela ao React
   * que pudesse discordar do que a tela mostra.
   */
  useEffect(() => {
    const lendo = lote.filter((i) => i.estado === 'lendo').length;
    if (lendo >= LEITURAS_SIMULTANEAS) return;
    const proximo = lote.find((i) => i.estado === 'na_fila' && arquivosDoLote.current.has(i.id));
    if (proximo) void lerItemDoLote(proximo.id);
  }, [lote, lerItemDoLote]);

  function adicionarAoLote(escolhidos: FileList | null) {
    const arquivos = Array.from(escolhidos ?? []);
    if (arquivos.length === 0) return;
    const novos: ItemDoLote[] = arquivos.map((f) => {
      const id = `a${proximoIdDoLote.current++}`;
      const recusa = recusaDoArquivo({ nome: f.name, tamanho: f.size, tipo: mimeDo(f) });
      /* A RECUSA VIRA LINHA, e nao um alerta que some. Num lote de 29, dizer "um
       * arquivo foi ignorado" e nao dizer QUAL e o mesmo que nao dizer nada. */
      if (recusa) return { id, nome: f.name, tamanho: f.size, estado: 'falhou' as const, campos: null, erro: recusa };
      arquivosDoLote.current.set(id, f);
      return { id, nome: f.name, tamanho: f.size, estado: 'na_fila' as const, campos: null, erro: null };
    });
    setLote((s) => [...s, ...novos]);
  }

  /**
   * REGISTRA AS LINHAS, UMA DE CADA VEZ.
   *
   * SEQUENCIAL e nao em paralelo: sao escritas na mesma tabela, cada uma abre
   * transacao no servidor, e um lote de 29 gravacoes simultaneas disputaria os
   * mesmos slots que a emissao. Em serie a barra de progresso tambem significa
   * alguma coisa — e quem olha ve onde parou.
   *
   * NAO MANDA `parametros`: sem eles a rota aplica o `modeloVigente()`, que e o
   * percentual de desconto CADASTRADO. Mandar os do painel faria o lote gravar
   * 29 faturas com o padrao da tela (20%) mesmo quando o cadastro diz outro
   * numero — e o desconto e o que decide o valor cobrado.
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

  /**
   * «CONFERIR»: a linha da fila abre na gaveta — o mesmo painel de sempre, com
   * os campos dela. Chamado tambem por «Anterior» e «Proxima» de dentro da
   * gaveta, e ai o gatilho nao muda: o foco volta ao «Conferir» da linha que
   * estiver aberta quando a gaveta fechar.
   */
  function abrirConta(item: ItemDoLote) {
    if (!item.campos) return;
    if (!gaveta) gatilho.current = document.activeElement as HTMLElement | null;
    setCampos(item.campos);
    setBoleto(BOLETO_LIDO_VAZIO);
    setStatusFatura(`Conferindo «${item.nome}». O que você corrigir aqui vale também para a linha da fila.`);
    setStatusRegistro(null);
    setAbertoId(item.id);
    setGaveta(true);
  }

  /** Uma conta SEM arquivo: limpa o painel e deixa a pessoa digitar. E o caminho
   *  das UCs cuja conta ninguem tem em PDF — 11 delas em 08/09/2026. */
  function digitarConta() {
    gatilho.current = document.activeElement as HTMLElement | null;
    setCampos(CAMPOS_DA_FATURA_VAZIOS);
    setBoleto(BOLETO_LIDO_VAZIO);
    setStatusFatura('Conta sem arquivo — preencha os campos e registre.');
    setStatusRegistro(null);
    setAbertoId(null);
    setGaveta(true);
  }

  function continuarConferencia() {
    gatilho.current = document.activeElement as HTMLElement | null;
    setGaveta(true);
  }

  /** Fecha e devolve o foco: ao «Conferir» da linha aberta, senao a quem abriu,
   *  senao ao «Continuar a conferencia» que reaparece. Depois do desenho — o
   *  botao de volta so existe quando a gaveta ja saiu. */
  function fecharGaveta() {
    setGaveta(false);
    const id = abertoId;
    const quem = gatilho.current;
    requestAnimationFrame(() => {
      const alvo = (id ? document.querySelector<HTMLElement>(`[data-conferir="${id}"]`) : null)
        ?? (quem?.isConnected ? quem : null)
        ?? document.querySelector<HTMLElement>('[data-continuar]');
      alvo?.focus();
    });
  }

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
    gravarRascunho(tenantId, {
      campos, parametros, boleto, campos_personalizados: personalizados, lote,
    });
  }, [tenantId, campos, parametros, boleto, personalizados, lote]);

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

      /*
       * ======================================================================
       * O DESCONTO PASSA A SAIR DO CADASTRO, e ate 08/09/2026 nao saia.
       *
       * A rota `compor` monta os parametros assim:
       *
       *     { do modelo vigente, ...(o que a tela mandou) }
       *
       * e o comentario dela diz *"o que a tela manda so sobrepoe quando ela
       * manda de fato"*. So que a tela mandava SEMPRE: `parametros` nascia em
       * `PARAMETROS_PADRAO` (20%) e ia junto em toda composicao e em todo
       * registro. O resultado e que `modelo_de_fatura.percentual_desconto_padrao`
       * — a coluna que a migration 28 criou exatamente para isso — era INERTE:
       * cadastrar 15% no modelo nao mudava uma fatura sequer, e ninguem via,
       * porque 20 e um numero plausivel em todo lugar onde ele aparecia.
       *
       * O desconto decide o valor cobrado do cliente. Um padrao errado nao sai
       * como erro: sai como fatura de valor errado, comissao errada e repasse
       * errado, exatamente como a nota de abertura de `fatura-concessionaria.ts`
       * descreve para o total da distribuidora.
       *
       * ADOTA UMA VEZ E SO SE NINGUEM TOCOU. Quem digita 25 no campo continua com
       * 25 — `parametrosTocados` e o que separa "a tela nunca opinou" de "a
       * pessoa decidiu". Uma segunda via tambem conta como decisao: ela restaura
       * os parametros COM QUE AQUELA FATURA FOI GRAVADA, e sobrescreve-los pelo
       * padrao de hoje faria a segunda via mentir sobre o que foi cobrado.
       */
      if (!parametrosTocados.current && r.modelo) {
        parametrosTocados.current = true;
        setParametros({
          percentual_desconto: r.modelo.percentual_desconto_padrao,
          fator_emissao: r.modelo.fator_emissao_padrao,
        });
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

  /* `enviarFatura` MORREU EM 08/09/2026, e a remocao e o ponto. Ela subia UM
   * arquivo direto para o painel; a fila do lote faz o mesmo por
   * `lerItemDoLote`, e com um arquivo so o resultado abre sozinho aqui. Manter as
   * duas seria dois caminhos para o mesmo ato, divergindo no dia em que um
   * deles mudasse — foi exatamente assim que a competencia da Equatorial passou
   * a ser aceita num caminho e recusada no outro. */

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
      setStatusRegistro(`Registrada: unidade ${campos.unidade_consumidora}, `
                      + `${campos.mes_referencia}. O desconto entra na economia acumulada.`);
      setRegistrosVersao((v) => v + 1);
      /* A LINHA DO LOTE FECHA JUNTO. Registrar pela gaveta uma conta que veio da
       * fila e o caminho normal. A identidade e a linha ABERTA e, para as outras,
       * a CHAVE (UC, competencia) — a mesma do `upsert` do servidor: sem isto a
       * fila continuaria oferecendo «Registrar» para uma conta ja gravada, e o
       * segundo clique sobrescreveria o que a pessoa acabou de conferir. */
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

  /**
   * A SEGUNDA VIA: recarrega na tela um mês já registrado.
   *
   * A folha de sete faixas só existia enquanto os campos estivessem aqui —
   * fechar a aba perdia o documento, e reabrir exigia subir o PDF da
   * distribuidora outra vez. O servidor devolve os campos como foram gravados,
   * com os parâmetros congelados daquele mês, e a composição segue pelo caminho
   * de sempre. Não há segunda montagem da folha.
   *
   * Sobrescreve o que está em edição, então pergunta antes — pelo mesmo motivo
   * que `novaFatura` pergunta.
   */
  async function carregarSegundaVia(r: RegistroDeFatura) {
    const mes = mesCurto(mesDoRegistro(r));
    if (!window.confirm(
      `Abrir a 2ª via de ${mes} da unidade ${r.numero_uc}?\n\n`
      + 'O que estiver em edição agora será substituído.')) return;
    /* A FALHA SOBE PARA QUEM PEDIU: o pedido nasce na lista de registradas, com
     * a gaveta fechada, e e la que a frase tem de aparecer. */
    {
      const v = await api.get<{
        campos: CamposDaFatura; parametros: ParametrosDaEmissao; boleto: BoletoLido;
      }>(`/faturas/unificada/registros/${r.id}/segunda-via`);
      setCampos({ ...CAMPOS_DA_FATURA_VAZIOS, ...v.campos });
      /* A segunda via restaura os parametros COM QUE AQUELA FATURA FOI GRAVADA.
       * E decisao registrada, e nao padrao a adotar: sobrescreve-la pelo padrao
       * de hoje faria a segunda via mentir sobre o que foi cobrado. */
      parametrosTocados.current = true;
      setParametros(v.parametros);
      setBoleto({ ...BOLETO_LIDO_VAZIO, ...v.boleto });
      setPersonalizados({});
      /* A 2a via nao e linha da fila: a gaveta que abrir depois dela nao pode
       * escrever na linha que estava aberta antes. */
      setAbertoId(null);
      setStatusFatura(`2ª via de ${mes} carregada do que foi gravado.`);
      setStatusBoleto(v.boleto?.linha_digitavel ? 'Faixa de pagamento da 1ª via.' : 'Nenhum boleto enviado.');
      setStatusRegistro(null);
      irPara('emissao');
    }
  }

  /**
   * NOVA FATURA. Apaga o RASCUNHO e preserva os REGISTROS — é o que a referência
   * faz desde `36e964e`, e o motivo é que as duas coisas têm vidas diferentes: o
   * rascunho é o que está em edição agora; os registros são a série que produz a
   * economia acumulada. A fila do lote também fica: ela é o trabalho do mês, e
   * não a conta em edição.
   *
   * UM SÓ DESDE 30/09. Havia dois «Nova fatura», um na barra das abas e outro no
   * pé do formulário, com o mesmo efeito. Ficou o da barra, que vale para as duas
   * abas que mostram a conta em edição.
   */
  function novaFatura() {
    if (!window.confirm('Começar uma nova fatura? Os dados em edição serão apagados. '
                      + 'As faturas já registradas ficam.')) return;
    setCampos(CAMPOS_DA_FATURA_VAZIOS);
    setBoleto(BOLETO_LIDO_VAZIO);
    /* Fatura nova volta a NAO TER OPINIAO: a proxima composicao readota o padrao
     * do cadastro. Sem isto, quem editasse o desconto uma vez o levaria para
     * todas as contas da sessao. */
    parametrosTocados.current = false;
    setParametros(PARAMETROS_PADRAO);
    setPersonalizados({});
    setComposicao(null);
    setAbertoId(null);
    setStatusFatura('Nenhum arquivo enviado.');
    setStatusBoleto('Nenhum boleto enviado.');
    setStatusRegistro(null);
    apagarRascunho(tenantId);
    irPara('leitura');
  }

  /* O ENDERECO ACOMPANHA A ABA (`fragmentoDaAba`). `replaceState`, e nao
   * `pushState`: trocar de aba nao e navegar, e o «voltar» do navegador tiraria
   * a pessoa da tela aba por aba. */
  function irPara(a: Aba) {
    setAba(a);
    const frag = fragmentoDaAba(a);
    if (window.location.hash !== frag) {
      history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${frag}`);
    }
    window.scrollTo(0, 0);
  }

  /** A lista das registradas abre na serie de uma unidade. Pedido de dentro da
   *  gaveta («Ver a série na lista»): fecha a gaveta e leva a lista a vista. */
  function verUnidadeNaLista(uc: string | null) {
    setUnidadeDaLista(uc?.trim() || null);
    if (gaveta) {
      setGaveta(false);
      requestAnimationFrame(() => {
        const alvo = document.getElementById('fu-registradas');
        alvo?.scrollIntoView({ block: 'start' });
        document.getElementById('fu-registradas-titulo')?.focus();
      });
    }
  }

  const resumo = useMemo(() => resumoDoLote(lote, ucsDoCadastro), [lote, ucsDoCadastro]);
  const vizinhos = vizinhosNaFila(lote, ucsDoCadastro, abertoId);
  const itemAberto = abertoId ? lote.find((i) => i.id === abertoId) ?? null : null;
  const irParaVizinho = (id: string | null) => {
    const i = id ? lote.find((x) => x.id === id) : undefined;
    if (i) abrirConta(i);
  };

  return (
    <>
      <Abas atual={aba} ao={irPara}
            acao={aba === 'cadastro' ? null : { texto: 'Nova fatura', ao: novaFatura }} />

      <div id={`fu-painel-${aba}`} role="tabpanel" aria-labelledby={`fu-aba-${aba}`}>
        {aba === 'leitura' && (
          <AbaDeLeitura
            campos={campos} composicao={composicao} gaveta={gaveta}
            irParaCadastro={() => irPara('cadastro')}
            continuar={continuarConferencia}
            digitarConta={digitarConta}
            adicionarAoLote={adicionarAoLote}
            fila={
              <TabelaDaFila
                itens={lote} ucs={ucsDoCadastro} registrando={registrandoLote}
                principal={resumo.prontos > 0} abertaId={gaveta ? abertoId : null}
                registrar={(ids) => void registrarDoLote(ids)}
                conferir={abrirConta}
                remover={(id) => setLote((s) => s.filter((i) => i.id !== id))}
                limpar={() => { arquivosDoLote.current.clear(); setLote([]); setAbertoId(null); }}
              />
            }
            registradas={
              <ContasRegistradas
                versao={registrosVersao}
                /* O LARANJA PASSA PARA «Gerar N cobranças» quando a fila nao tem
                   nada a registrar — o passo seguinte do mes. */
                principal={resumo.prontos === 0}
                unidade={unidadeDaLista} aoMudarUnidade={verUnidadeNaLista}
                segundaVia={carregarSegundaVia}
                aoMudar={() => {
                  setRegistrosVersao((v) => v + 1);
                  /* A folha 2 imprime a economia acumulada: apagar um registro a
                   * muda, e sem recompor a tela seguiria mostrando a soma antiga. */
                  void compor(campos, parametros, boleto, personalizados);
                }}
              />
            }
          />
        )}
        {/* A PREVIA EM LOTE SAIU DA TELA INTEIRA em 14/08 (tarde), e nao so desta
            aba — ver o bloco no pe de `documento.tsx`. Enquanto ela existiu, o
            lugar dela foi decidido por um defeito medido que vale registrar,
            porque a causa continua viva: `AbaDaFolha` monta `<div
            id="documento">`, o CSS de impressao e seletor de `id`, e seletor de
            `id` casa TODOS os elementos com aquele id. Duas folhas com o mesmo id
            na arvore imprimem juntas. Hoje so existe uma — e e por isso que
            qualquer coisa que volte a montar `id="documento"` tem de vir com o
            teste `W-imprime-uma-folha-so` junto. */}
        {aba === 'emissao' && (
          <AbaDaFolha composicao={composicao} logoUrl={logoUrl} erro={erroDaComposicao}
                      temConta={Boolean(campos.unidade_consumidora.trim() || campos.cliente.trim())}
                      voltar={() => { irPara('leitura'); continuarConferencia(); }} />
        )}
        {aba === 'cadastro' && cadastro}
      </div>

      {aba === 'leitura' && gaveta && (
        <GavetaDaConta
          titulo="Conferência da conta"
          sub={statusFatura}
          aoFechar={fecharGaveta}
          navegacao={vizinhos.total > 0 ? (
            <>
              <span className="fu-gaveta-pos">
                {vizinhos.posicao
                  ? `${vizinhos.posicao} de ${vizinhos.total} a registrar`
                  : `${vizinhos.total} a registrar na fila`}
              </span>
              <button type="button" disabled={!vizinhos.anterior}
                      onClick={() => irParaVizinho(vizinhos.anterior)}>Anterior</button>
              <button type="button" disabled={!vizinhos.proxima}
                      onClick={() => irParaVizinho(vizinhos.proxima)}>Próxima</button>
            </>
          ) : undefined}
          rodape={
            <PainelDoBoleto
              composicao={composicao} campos={campos}
              registrar={() => void registrar()} registrando={registrando}
              statusRegistro={statusRegistro}
              verFolha={() => { setGaveta(false); irPara('emissao'); }}
              /* REGISTRADA A LINHA DA FILA, o laranja passa a ser a proxima: o
                 trabalho seguinte e a conta seguinte, e nao registrar de novo. */
              proxima={itemAberto?.estado === 'registrado' && vizinhos.proxima
                ? () => irParaVizinho(vizinhos.proxima) : null}
            />
          }
        >
          <ConferenciaDaConta
            campos={campos} mudar={mudar} setCampos={setCampos}
            parametros={parametros}
            setParametros={(f) => { parametrosTocados.current = true; setParametros(f); }}
            boleto={boleto} setBoleto={setBoleto}
            personalizados={personalizados} setPersonalizados={setPersonalizados}
            composicao={composicao} modelo={composicao?.modelo ?? null}
            erroDaComposicao={erroDaComposicao}
            statusBoleto={statusBoleto} lendoBoleto={lendoBoleto} enviarBoleto={enviarBoleto}
            registrosVersao={registrosVersao}
            verNaLista={() => verUnidadeNaLista(campos.unidade_consumidora)}
          />
        </GavetaDaConta>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- as abas
   QUAIS SAO e COMO SE CHEGA DIRETO NO CADASTRO moram em `abas-da-fatura.ts`, e
   o motivo esta escrito la: nada dentro de um `.tsx` e verificavel — o runner do
   `web/` nao le JSX. Aqui ficou o que a barra MOSTRA. */

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
function Abas({ atual, ao, acao }: {
  atual: Aba;
  ao: (a: Aba) => void; acao: { texto: string; ao: () => void } | null;
}) {
  /* Setas andam, Home e End vao aos extremos — o padrao WAI-ARIA de `tablist`. */
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
    /* O FOCO ACOMPANHA A SELECAO: sem isto a seta trocava o painel e deixava o
       foco na aba anterior, que ja nao esta no caminho do Tab. */
    requestAnimationFrame(() => document.getElementById(`fu-aba-${ABAS[destino]!}`)?.focus());
  };

  return (
    <div className="fu-abas naoimprime">
      <div className="fu-abas-lista" role="tablist" aria-label="Etapas da fatura" onKeyDown={teclado}>
        {ABAS.map((a, i) => (
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
      </div>
      {/* BOTAO COMUM E NAO `fu-aba`: ele nao seleciona painel nenhum. Fica FORA
          do `tablist` desde 30/09 — dentro dele, a seta do teclado o pularia e o
          leitor de tela o contaria como quarta aba. */}
      {acao && <button type="button" onClick={acao.ao}>{acao.texto}</button>}
    </div>
  );
}

/* ============================================================ aba 1: leitura */

/**
 * A ABA 1 SEM CONTA ABERTA — o trabalho do mes, em largura total.
 *
 * DE CIMA PARA BAIXO, na ordem do mes: o aviso do emissor (quando falta), o
 * envio, a conta em edicao (quando ha uma e a gaveta esta fechada), a fila e as
 * contas registradas. O formulario de UMA conta nao mora mais aqui: ele e a
 * gaveta, e so existe quando alguem abre uma conta.
 */
function AbaDeLeitura(p: {
  campos: CamposDaFatura;
  composicao: ComposicaoUnificada | null;
  gaveta: boolean;
  irParaCadastro: () => void;
  continuar: () => void;
  digitarConta: () => void;
  adicionarAoLote: (f: FileList | null) => void;
  fila: ReactNode;
  registradas: ReactNode;
}) {
  const emEdicao = !p.gaveta && Boolean(p.campos.unidade_consumidora.trim() || p.campos.cliente.trim());
  return (
    <div className="fu-leitura naoimprime">
      {/*
        O EMISSOR VAZIO ACUSA AQUI, e ate 08/09/2026 nao acusava em lugar nenhum
        que a operacao visse.

        `linhaDoEmissor` devolve `null` quando razao social e CNPJ estao vazios —
        e eles estao VAZIOS em producao. Nada recusa por isso: a folha compoe,
        imprime e sai **sem o cabecalho, sem o campo Beneficiario da faixa de
        pagamento e sem a linha «confira sempre se o beneficiario e...»**, que
        amarra no nome e some junto com ele.

        O BOTAO ABRE A ABA 3 DIRETO desde 30/09, sem passar pelo fragmento: com
        `#cadastro` ja no endereco, escrever o mesmo fragmento nao disparava
        nada.
      */}
      {p.composicao && !p.composicao.folha1.cabecalho.emissor && (
        <Aviso tipo="alerta">
          <strong>A folha vai sair sem dizer quem está cobrando.</strong> Razão social e CNPJ do
          emissor estão em branco, e nada recusa por isso: o cabeçalho, o campo «Beneficiário» da
          faixa de pagamento e o aviso contra boleto falso somem — é o nome que os sustenta.
          {' '}
          <button type="button" onClick={p.irParaCadastro}>Cadastrar quem emite a fatura</button>
        </Aviso>
      )}

      {/*
        UM CAMPO SO, COM `multiple`, E NAO DOIS. Ate 08/09/2026 esta area aceitava
        um arquivo por vez, e a carteira tem 29 contas por mes. Com `multiple`,
        escolher um arquivo continua fazendo exatamente o que fazia: ele abre
        sozinho na gaveta.

        A AREA E UMA FAIXA desde 30/09, e nao um cartao de 380px de largura: o
        envio e o primeiro ato do mes, mas nao o mais demorado — a fila e que e.
      */}
      <div className="fu-envio">
        <label className="fu-solta">
          <input type="file" accept="application/pdf,image/*" multiple
                 onChange={(e) => { p.adicionarAoLote(e.target.files); e.target.value = ''; }} />
          <span className="fu-solta-titulo">
            <Icone nome="enviar" tamanho={18} /> Enviar as contas da distribuidora
          </span>
          <span className="fu-solta-sub">
            PDF ou foto — pode escolher várias de uma vez. Cada uma vira uma linha da fila, lida na ordem.
          </span>
        </label>
        <div className="fu-envio-lado">
          <span className="fraco">Sem o arquivo da conta?</span>
          <button type="button" onClick={p.digitarConta}>Digitar uma conta sem arquivo</button>
        </div>
      </div>

      {/* A CONTA EM EDICAO, quando a gaveta esta fechada. E o rascunho — o que a
          aba «2 · Folha do cliente» mostra —, e sem esta linha ele seria
          invisivel depois de um F5: gravado, mas sem porta. */}
      {emEdicao && (
        <div className="fu-emedicao">
          <span>
            <strong>Em edição:</strong>{' '}
            {p.campos.cliente.trim() || 'conta sem cliente lido'}
            {' · '}unidade {p.campos.unidade_consumidora.trim() || '—'}
            {' · '}{p.campos.mes_referencia.trim() || 'mês não lido'}
          </span>
          <button type="button" data-continuar="" onClick={p.continuar}>Continuar a conferência</button>
        </div>
      )}

      {p.fila}
      {p.registradas}
    </div>
  );
}

/* ================================================= a gaveta: uma conta aberta */

type PropsDaConferencia = {
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
  /** O cadastro de fatura vigente, so para a tela DIZER de onde vem o padrao. */
  modelo: ModeloDeFatura | null;
  erroDaComposicao: string | null;
  statusBoleto: string;
  lendoBoleto: boolean;
  enviarBoleto: (f: File) => void;
  registrosVersao: number;
  verNaLista: () => void;
};

/**
 * O CORPO DA GAVETA: os campos lidos, o historico, os campos do tenant, os
 * parametros e o boleto — o que era o cartao «Conferência dos dados» mais a
 * coluna da esquerda, agora numa coluna so.
 *
 * UMA COLUNA E NAO DUAS: a gaveta tem 880px, e a grade de 380px + resto que
 * servia a pagina inteira deixaria os campos em colunas de 150px. O que era a
 * coluna da esquerda desceu: os parametros depois dos campos que eles afetam, o
 * boleto por ultimo e DOBRADO — ele e opcional (sem ele a folha sai com o Pix),
 * e aberto eram 700px de textarea para quem nao tem boleto nenhum.
 *
 * E O PAINEL NAVY FOI PARA O PE (`PainelDoBoleto`), fixo: o valor a gerar no
 * banco fica a vista enquanto se corrige qualquer campo, e muda na hora — que
 * e o sinal de que a correcao pegou.
 */
function ConferenciaDaConta(p: PropsDaConferencia) {
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
  const temBoleto = Boolean(p.boleto.linha_digitavel.trim() || p.boleto.valor.trim()
                            || p.boleto.pix_copia_e_cola.trim());
  const linhaConferida = Boolean(p.composicao?.folha2.pagamento.barras);
  const competencia = lerCompetencia(p.campos.mes_referencia);
  const mesDaConta = competencia ? `${competencia.ano}-${competencia.mes}` : null;

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
    <>
      {p.erroDaComposicao && (
        <Aviso tipo="erro">Não foi possível compor a fatura: {p.erroDaComposicao}</Aviso>
      )}

      <SerieDaUnidade uc={p.campos.unidade_consumidora} mes={mesDaConta}
                      versao={p.registrosVersao} verNaLista={p.verNaLista} />

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

      {/* ------------------------------------------------- parâmetros
          OS DOIS CAMPOS TEM A BORDA FORTE E O FUNDO CREME, e sao os unicos da
          referencia assim. Nao e enfeite: os campos de cima sao dado LIDO da
          fatura e se conferem; estes dois sao DECISAO de quem opera, e saem
          desenhados como controle, nao como valor. */}
      <div className="fu-secao">
        <div className="fu-secao-tit">Parâmetros desta conta</div>
        <div className="campos parametros">
          <Campo rotulo="Desconto (%)" valor={p.parametros.percentual_desconto}
                 ao={(v) => p.setParametros((s) => ({ ...s, percentual_desconto: v }))} />
          <Campo rotulo="Fator CO₂ (kg/kWh)" valor={p.parametros.fator_emissao}
                 ao={(v) => p.setParametros((s) => ({ ...s, fator_emissao: v }))} />
        </div>
        {/* DE ONDE O NUMERO VEIO, escrito na tela. Os dois campos sao editaveis
            e o valor deles nasce do cadastro da fatura — sem esta linha, quem ve
            "20" nao tem como saber se e o padrao da empresa ou um default de
            codigo, e foi justamente essa duvida que deixou a coluna do cadastro
            inerte por 25 dias. */}
        <p className="fu-nota">
          {p.modelo
            ? `Padrão do cadastro «${p.modelo.nome}»: ${p.modelo.percentual_desconto_padrao}% de desconto. `
            : 'Ainda sem cadastro de fatura — os valores acima são os de partida do sistema. '}
          Alterar aqui vale só para esta conta. O fator de CO₂ é o médio da margem de operação do
          SIN (MCTI/SIRENE).
        </p>
      </div>

      {/* --------------------------------------------------- o boleto
          DOBRADO E NAO ESCONDIDO: o resumo diz o estado — nenhum boleto, a linha
          conferida, ou a primeira divergencia —, e abre sozinho quando ha
          boleto, que e quando a conferencia dele importa. `<details>` nativo: o
          teclado ja chega nele e o leitor de tela anuncia aberto/fechado. */}
      <details className="fu-detalhe" open={temBoleto || undefined}>
        <summary>
          <Icone nome="descer" tamanho={13} peso="bold" />
          <span className="fu-secao-tit">Boleto do banco</span>
          <span className="fu-detalhe-estado">
            {linhaConferida ? 'Linha conferida · código de barras gerado.'
              : alertas[0] ?? (temBoleto ? 'Nada a apontar.' : 'Nenhum boleto enviado — a folha sai só com o Pix.')}
          </span>
        </summary>

        {/* `curta`: o envio da conta e o primeiro ato da tela e e maior de
            proposito; este e secundario. */}
        <label className="fu-solta curta">
          <input type="file" accept="application/pdf,image/*"
                 disabled={p.lendoBoleto}
                 onChange={(e) => reenviavel(e, p.enviarBoleto)} />
          <span className="fu-solta-titulo">Enviar boleto do banco</span>
          <span className="fu-solta-sub">PDF ou foto — linha digitável e PIX são lidos do arquivo</span>
        </label>
        <div className="fu-status">{p.statusBoleto}</div>

        <div className="fu-secao com-regua">
          <div className="fu-rotulo">Conferência do boleto</div>
          {/* `Aviso` E NAO UMA CLASSE PROPRIA: duas gramaticas para "atencao a
              isto" numa tela so e o tipo de divergencia que este porte existe
              para tirar. */}
          {alertas.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
          {alertas.length === 0 && <div className="fu-status">Nada a apontar.</div>}

          {/* DUAS GRADES E NAO UMA: vencimento e valor lado a lado (`1fr 1fr`)
              e o nosso numero sozinho na linha de baixo (`1fr`). */}
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

          <div className="fu-legenda">
            Instruções do boleto <span className="fraco">· uma por linha</span>
          </div>
          <textarea className="fu-area" rows={4} value={p.boleto.instrucoes.join('\n')}
                    aria-label="Instruções do boleto, uma por linha"
                    placeholder="A partir 18/08/2026 Juros 0,03%/dia."
                    onChange={(e) => p.setBoleto((s) => ({
                      ...s, instrucoes: e.target.value.split('\n'),
                    }))} />

          <div className="fu-legenda">Linha digitável</div>
          <textarea className="fu-area mono" rows={2} value={p.boleto.linha_digitavel}
                    aria-label="Linha digitável" placeholder="47 dígitos"
                    onChange={(e) => p.setBoleto((s) => ({ ...s, linha_digitavel: e.target.value }))} />
          <StatusDaLinha
            digitos={p.boleto.linha_digitavel.replace(/\D/g, '')}
            motivo={p.composicao?.folha2.pagamento.barras_motivo ?? null}
            desenhou={linhaConferida} />

          <div className="fu-legenda">PIX copia e cola</div>
          {/* `miudo`: 12px contra os 13px da linha digitavel — o payload EMV tem
              tres vezes mais caracteres e a um ponto a mais nao cabe. */}
          <textarea className="fu-area mono miudo" rows={3} value={p.boleto.pix_copia_e_cola}
                    aria-label="PIX copia e cola" placeholder="00020101…"
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
      </details>
    </>
  );
}

/**
 * O PE DA GAVETA — o painel navy do boleto a gerar, e os dois atos da conta.
 *
 * O UNICO BLOCO DE FUNDO CHEIO DA TELA, e agora ele so existe com uma conta
 * aberta. Na coluna de 380px ele era o maior peso visual da aba 1 com qualquer
 * estado — inclusive sem conta nenhuma, dizendo «R$ —» para uma fila de sete.
 *
 * «REGISTRAR ESTE MES» E O LARANJA DAQUI, e «Ver a fatura do cliente» e o
 * comum: registrar ESCREVE e muda o que a folha do mes que vem afirma; ver a
 * folha e conferencia e nao escreve nada. Ate 30/09 o laranja estava na previa.
 */
function PainelDoBoleto(p: {
  composicao: ComposicaoUnificada | null;
  campos: CamposDaFatura;
  registrar: () => void;
  registrando: boolean;
  statusRegistro: string | null;
  verFolha: () => void;
  /** Depois de registrar, o atalho para a proxima da fila. */
  proxima: (() => void) | null;
}) {
  const c = p.composicao?.conta;
  const uc = p.campos.unidade_consumidora.trim();
  const falhou = p.statusRegistro?.startsWith('Não') ?? false;
  return (
    <div className="fu-painel">
      <div className="fu-painel-cifra">
        <div className="fu-painel-rot">Boleto a gerar no banco</div>
        <div className="fu-painel-total">{p.composicao?.folha1.total.valor ?? '—'}</div>
        <div className="fu-painel-sub">
          Vencimento {p.campos.vencimento || '—'} · unidade {uc || '—'}
        </div>
      </div>
      <dl className="fu-painel-par">
        <div>
          <dt className="fu-painel-cap">Energia G3 (com desconto)</dt>
          <dd className="fu-painel-val">{emReais(c?.energia_g3_centavos ?? null)}</dd>
        </div>
        <div>
          <dt className="fu-painel-cap">Repasses Equatorial</dt>
          <dd className="fu-painel-val">{emReais(c?.total_equatorial_centavos ?? null)}</dd>
        </div>
      </dl>
      <div className="fu-painel-acoes">
        {p.statusRegistro && (
          <p className={`fu-painel-status${falhou ? ' falhou' : ''}`} role="status">
            <Icone nome={falhou ? 'aviso_erro' : 'aviso_ok'} tamanho={15} peso="bold" />
            <span>{p.statusRegistro}</span>
          </p>
        )}
        <div className="fu-acoes">
          <button type="button" onClick={p.verFolha} disabled={!p.composicao}>
            Ver a fatura do cliente
          </button>
          {p.proxima
            ? <button type="button" className="primario" onClick={p.proxima}>Abrir a próxima</button>
            : (
              /* O ICONE SO EXISTE ENQUANTO ESCREVE: durante a gravacao o giro e a
                 unica coisa que diz que o clique foi recebido — desabilitado
                 tambem e o estado de "faltou a unidade". */
              <button type="button" className="primario" onClick={p.registrar}
                      disabled={p.registrando || !uc}
                      title={uc ? undefined : 'Preencha a unidade consumidora para registrar'}>
                {p.registrando && <Icone nome="carregando" tamanho={15} />}
                {p.registrando ? 'Registrando…' : 'Registrar este mês'}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * A SERIE DESTA UNIDADE, no alto da gaveta — o que restou do cartao «Faturas
 * registradas nesta unidade», que morava na coluna da esquerda.
 *
 * ELE RESPONDE DUAS PERGUNTAS ANTES DE REGISTRAR: esta conta ja foi gravada?
 * (registrar de novo e CORRIGIR, pelo `upsert` do servidor) e qual e a economia
 * acumulada que a folha 2 vai imprimir. A lista completa da unidade fica na
 * tabela de registradas, com o chip — «Ver a série na lista» leva la.
 *
 * ESPERA A DIGITACAO PARAR: o numero da unidade e um campo editavel, e buscar a
 * serie a cada tecla seria uma consulta por digito.
 */
function SerieDaUnidade({ uc, mes, versao, verNaLista }: {
  uc: string; mes: string | null; versao: number; verNaLista: () => void;
}) {
  const alvo = uc.trim();
  const [serie, setSerie] = useState<RegistroDeFatura[] | null>(null);
  useEffect(() => {
    if (!alvo) { setSerie(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      api.get<RegistroDeFatura[]>(`/faturas/unificada/registros?unidade_consumidora=${encodeURIComponent(alvo)}`)
        .then((r) => { if (vivo) setSerie(r); })
        .catch(() => { if (vivo) setSerie(null); });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [alvo, versao]);

  if (!alvo || serie == null) return null;
  if (serie.length === 0) {
    return <p className="fu-serie">Nenhuma conta desta unidade registrada ainda — esta será a primeira da série.</p>;
  }
  const jaGravada = mes != null && serie.some((r) => mesDoRegistro(r) === mes);
  const eco = economiaAcumulada(serie);
  const meses = serie.slice(0, 4).map((r) => mesCurto(mesDoRegistro(r))).join(', ');
  return (
    <div className="fu-serie">
      <p>
        {jaGravada && (
          <><strong>Esta conta já está registrada.</strong> «Registrar este mês» grava de novo e corrige o
          registro.{' '}</>
        )}
        Esta unidade tem {serie.length} {serie.length === 1 ? 'conta registrada' : 'contas registradas'}{' '}
        ({meses}{serie.length > 4 ? '…' : ''}) — economia acumulada de <strong>{emReais(eco.centavos)}</strong>,
        o número impresso na folha 2.
      </p>
      <button type="button" className="discreto" onClick={verNaLista}>Ver a série na lista</button>
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
function ContasRegistradas({ versao, principal, unidade, aoMudarUnidade, segundaVia, aoMudar }: {
  versao: number;
  principal: boolean;
  unidade: string | null;
  aoMudarUnidade: (uc: string | null) => void;
  segundaVia: (r: RegistroDeFatura) => Promise<void>;
  aoMudar: () => void;
}) {
  const [lista, setLista] = useState<RegistroDeFatura[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** `undefined`: ninguem escolheu, vale o padrao (`mesPadrao`). `null`: todos. */
  const [mesEscolhido, setMesEscolhido] = useState<string | null | undefined>(undefined);
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

  /* TROCAR DE UNIDADE VOLTA O MES AO PADRAO: a serie de uma unidade abre em
   * «Todos os meses», e tirar o chip volta ao mes que tem trabalho. */
  useEffect(() => { setMesEscolhido(undefined); }, [alvo]);

  const todas = lista ?? [];
  const meses = mesesDaLista(todas);
  const mes = mesEscolhido !== undefined ? mesEscolhido : alvo ? null : mesPadrao(todas);
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
        const rotulo = `Excluir o registro de ${mesCurto(mesDoRegistro(r))} da unidade ${r.numero_uc}`;
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`button[aria-label="${rotulo}"]`)?.focus());
      }
    }
  }

  return (
    <TabelaDasRegistradas
      lista={lista} visiveis={visiveis} erro={erro} filtro={filtro} meses={meses}
      parcial={!alvo && listaParcial(todas)}
      aoFiltrar={(f) => {
        setMesEscolhido(f.mes);
        setSoSemCobranca(f.soSemCobranca);
      }}
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
      <div className="fu-secao-tit">Campos desta fatura</div>
      <div className="campos">
        {campos.map((c) => (
          <Campo key={c.chave} rotulo={c.rotulo} valor={valores[c.chave] ?? ''}
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

/* ================================================= aba 2: a folha do cliente */

/**
 * A FOLHA QUE O CLIENTE RECEBE, da conta em edicao — para conferir e imprimir.
 *
 * O NOME MUDOU EM 30/09: ate ali a aba se chamava «2 · Emissão», e quem estava
 * no passo 1 do mes procurava nela o passo 3, que e a tela «Emissão e
 * cobrança». Aqui nada se emite: a folha e o documento da conta aberta.
 *
 * SEM CONTA ABERTA, ELA DIZ ISSO — e nao desenha uma folha de travessoes. A
 * composicao existe mesmo com o rascunho vazio (o servidor compoe o que
 * receber), e uma folha de «—» impressa por engano e papel que parece fatura.
 */
function AbaDaFolha({ composicao, logoUrl, temConta, erro, voltar }: {
  composicao: ComposicaoUnificada | null; logoUrl: string | null;
  temConta: boolean;
  erro: string | null;
  voltar: () => void;
}) {
  if (!composicao || !temConta) {
    return (
      <div className="naoimprime">
        {erro && <Aviso tipo="erro">Não foi possível compor a fatura: {erro}</Aviso>}
        <Aviso tipo="alerta">
          Nenhuma conta aberta. Na aba <strong>1 · Leitura e cálculo</strong>, abra uma conta da fila
          em «Conferir» — ou a «2ª via» de um mês já registrado, na lista de contas registradas.
        </Aviso>
      </div>
    );
  }
  const { folha1, folha2, numero_da_fatura } = composicao;

  return (
    <>
      {erro && <div className="naoimprime"><Aviso tipo="erro">Não foi possível compor a fatura: {erro}</Aviso></div>}
      {/* A BARRA TEM A LARGURA DA FOLHA e nao a da pagina. «Voltar à
          conferência» reabre a gaveta da conta: a acao natural depois de olhar
          a folha e voltar a corrigir o que se acabou de ver — e desde 30/09 o
          lugar de corrigir e a gaveta, e nao a aba 1 inteira. */}
      <div className="fu-barra naoimprime">
        <span className="fraco">Fatura {numero_da_fatura}</span>
        <div className="fu-acoes">
          <button type="button" onClick={voltar}>Voltar à conferência</button>
          <button type="button" className="fu-imprimir" onClick={() => window.print()}>Imprimir fatura</button>
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
