// FATURAS: o caminho que faltava na tela — emitir, pedir o boleto, dar baixa.
//
// POR QUE ESTA TELA EXISTE. O backend tinha o ciclo do dinheiro inteiro e a SPA
// parava em "compor rascunho": as rotas de emitir, de boleto e de baixa existiam
// e nao havia como chegar nelas sem `curl`. Quem opera nao tem `curl`, e o
// resultado pratico era um sistema que compunha faturas e nao cobrava ninguem.
//
// A ORDEM DA TELA E A ORDEM DOS ATOS, e ela e assim no servidor tambem:
//
//   compor (Carteira)  ->  emitir  ->  boleto  ->  baixa
//   rascunho               emitida     registrado   paga
//
// Cada passo tem precondicao de status, e as quatro estao em `cobranca-regras.ts`
// como ESPELHO do repositorio, com a linha citada. A tela nao decide nada: ela
// evita oferecer o botao que o servidor vai recusar. O servidor recusa de
// qualquer forma, e essa e a ordem certa.
//
// DUAS COISAS QUE PARECEM DETALHE E SAO DINHEIRO:
//
//   - o boleto pedido sem conector volta 412 NOMEADO, e sem certificado A1 volta
//     503 NOMEADO. A tela mostra a frase do servidor quando nao a conhece, porque
//     ela foi escrita para quem opera; quando conhece (`emissao-regras.ts`), diz
//     o que falta e leva ate onde se resolve, e a frase crua fica no detalhe;
//   - a baixa manual e o UNICO gatilho de split que funciona hoje (PRD 5.2), e
//     ela exige o valor ao CENtavo. O total esperado e pre-enchido por
//     `totalEsperadoDaBaixa`, soma de inteiros, para que o caminho normal nao
//     seja um erro de servidor. E ela pede confirmacao: reparte dinheiro.
//
// ============================================================================
// O QUE MUDOU EM 30/09/2026 (etapa 2 do redesenho, critica de 30/09 P1 n. 2)
//
// A tela tinha o ciclo inteiro e escondia o passo de hoje. Medido no espelho:
// nenhum botao primario («Emitir as N em rascunho» pesava o mesmo que «Exportar
// CSV»), a confirmacao era um `window.confirm` com `npm run tarifas` no texto, os
// cinco rascunhos — as unicas linhas com «Emitir» — no FIM de uma tabela de
// vinte, a tela aberta no mes corrente enquanto o trabalho estava no mes da
// conta, e «PagadorSemEndereco» cru ao lado de um «Gerar boleto» laranja que o
// servidor ia recusar de novo.
//
//   A ORDEM PADRAO E A DO QUE PRECISA DE ACAO (`emissao-regras.ts`): rascunho,
//   sem boleto ou recusada, vencida, emitida, paga, cancelada. As colunas
//   continuam ordenaveis; a de acao e a padrao e o nome dela esta na tela.
//
//   «EMITIR N COBRANCAS» E O LARANJA quando ha rascunho, e abre uma REVISAO na
//   propria tela — unidade, cliente, vencimento, valor, a soma e a tarifa que
//   falta dita em portugues —, com as chamadas em serie e a situacao por linha.
//   Terminada, o proximo passo aparece como ato: «Pedir os N boletos».
//
//   A RECUSA TEM SAIDA: «Falta o endereco do pagador» com «Completar o
//   endereco», que abre Unidades ja na linha da unidade. O codigo cru fica atras
//   do «ver detalhe tecnico». Vale na linha, no painel dela e na lista do que nao
//   chegou ao banco.
//
//   O MES ABRE ONDE HA TRABALHO, e diz por que abriu ali.
//
//   A LINHA TEM UMA ACAO SO; «Cancelar» foi para o menu da linha e o motivo e
//   pedido na propria linha. O painel da linha tem duas secoes (Boleto · Baixa
//   manual), e «Registrar pagamento» passa por um resumo que se confirma.
//
//   ABAIXO DE 900px CADA LINHA VIRA UM CARTAO, como na Fatura unificada: Total e
//   a acao nunca saem da tela, e o painel aberto nao fica preso numa rolagem
//   lateral. 900 e nao 720 porque esta tabela tem sete colunas e uma delas e de
//   botoes — entre 720 e 900 ela ja nao cabia sem rolar.

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  api, ErroDaApi, type Fatura, type Boleto, type UnidadeConsumidora, type PosicaoDaCarteira,
  type Cliente, type BoletoLido, type ConferenciaDoBoletoImportado,
} from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Marca, rotulo, linha, useOrdenacao, ordenar, ThOrd, Kpi,
  Icone, CampoData, Carregando, AjudaDoMes, DetalheTecnico, Menu } from '../ui.tsx';
import { competenciaISO, emReais, paraCentavos, mesDaQuery, kwhEmBr } from '../dinheiro.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';
import { lerBase64, mimeDo, reenviavel, naMensagem } from '../arquivo.ts';
import {
  podeGerarBoleto, podeBaixarManual, podeImportarBoleto, podeBaixarNoBanco,
  podeLancarTarifaDaDistribuidora,
  motivoDaTravaDaImportacao, podeImportarAgora, DIGITOS_DA_LINHA,
  totalEsperadoDaBaixa, conferirTarifas,
  type MotivoDeTravaDaImportacao,
} from '../cobranca-regras.ts';
import {
  chaveDaOrdemDeAcao, acaoDaLinha, notaDaSituacao, recusaDaLinha, tipoDaRecusa, paraPedirBoleto,
  candidatosDoMes, mesSemTrabalho, fraseDaOrigem, lerMesLembrado, lembrarMes, MESES_A_CONFERIR,
  type EstadoDaVez, type OrigemDoMes, type RecusaLida,
} from '../emissao-regras.ts';
import {
  SituacaoDaCobranca, RecusaNaTela, BotaoDaSaida, RevisaoDaSerie, ConfirmacaoNaLinha, ResumoDaBaixa,
  dataEmBr, type LinhaDaSerie,
} from '../emissao-corpo.tsx';
import { PainelDaEmissao } from '../emissao-travada-corpo.tsx';
import type { EmissaoTravadaNaTela, LinhaNaTela } from '../emissao-travada.ts';
import { FaixaDoPasso } from '../roteiro-corpo.tsx';
import { rotuloDoMes } from '../registradas-regras.ts';

type EscolhaDoMes = { mes: string; origem: OrigemDoMes; certo?: boolean };
type DaSessao = { nome: string | null; texto: string };
type Serie = {
  tipo: 'emitir' | 'boletos';
  /** As linhas COMO ESTAVAM quando a rodada comecou: a tabela recarrega e
   *  reordena no fim, e o placar nao pode perder a linha que mudou de grupo. */
  linhas: LinhaDaSerie[];
  estados: Record<string, EstadoDaVez>;
  rodando: boolean;
};

/** O armazenamento do navegador, ou nada. Acessar `localStorage` levanta em
 *  alguns navegadores com o armazenamento bloqueado. */
function armazem(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** O mes de hoje no RELOGIO LOCAL (`toISOString` e UTC: na noite do ultimo dia
 *  do mes, em Goiania, ja seria o mes seguinte). */
function mesDeHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * EM QUE MES A TELA ABRE — ver a ordem em `emissao-regras.ts` (secao 5).
 *
 * O que ja se sabe sem ler nada (`/emissao/travada`, que a tela busca de
 * qualquer jeito) decide sozinho; o mes que so PODE ter rascunho e lido antes de
 * a tela abrir nele — no maximo `MESES_A_CONFERIR`, em serie. Qualquer leitura
 * que falhe so tira aquele candidato: o pior caso e a tela abrir no mes
 * lembrado ou no de hoje, que e o que ela fazia antes.
 */
async function procurarMes(travadas: readonly LinhaNaTela[]): Promise<EscolhaDoMes> {
  let carteira: PosicaoDaCarteira[] = [];
  try { carteira = await api.get<PosicaoDaCarteira[]>('/carteira'); } catch { /* segue so com a lista do banco */ }
  let lidos = 0;
  for (const c of candidatosDoMes(carteira, travadas)) {
    if (c.certo) return { mes: c.mes, origem: 'trabalho', certo: true };
    if (lidos >= MESES_A_CONFERIR) continue;
    lidos++;
    try {
      const l = await api.get<Fatura[]>(`/faturamento/${competenciaISO(c.mes)}`);
      if (l.some((f) => f.status === 'rascunho')) return { mes: c.mes, origem: 'trabalho', certo: false };
    } catch { /* mes que nao se le nao e aberto por palpite */ }
  }
  return mesSemTrabalho(lerMesLembrado(armazem()), carteira, mesDeHoje());
}

export function TelaFaturas() {
  /* O MES VEM DO ENDERECO QUANDO ALGUEM O PEDIU (`?mes=2026-08`) — e o que faz
   * «Ver na emissao», em Contas a receber, abrir ESTA tela ja no mes da fatura.
   * Sem pedido, ele e PROCURADO (ver `procurarMes`), e ate a resposta a tabela
   * diz que esta procurando em vez de mostrar o mes errado por um instante. */
  const [escolha, setEscolha] = useState<EscolhaDoMes | null>(() => {
    const q = mesDaQuery(location.search);
    return q ? { mes: q, origem: 'endereco' } : null;
  });
  const mes = escolha?.mes ?? null;
  const acao = useAcao();
  /* A ORDEM PADRAO E A DE ACAO, e ela e uma coluna como as outras: clicar em
     «Vencimento» troca, e «Voltar a ordem de acao» (ou o cabecalho «Situacao»)
     volta. */
  const { ordem, alternar } = useOrdenacao('acao');
  const [aberta, setAberta] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [cancelandoOcupado, setCancelandoOcupado] = useState(false);
  const [erroDoCancelamento, setErroDoCancelamento] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<'emitir' | 'boletos' | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  /* A RECUSA QUE ACABOU DE VOLTAR, por fatura. `PagadorSemEndereco` e recusado
   * ANTES de criar a linha do boleto (`repos/boleto.ts`), entao ela nao fica em
   * `ultimo_erro`: sem guardar aqui, a linha voltaria a dizer «Boleto ainda nao
   * pedido» logo depois de o banco dizer por que nao. */
  const [daSessao, setDaSessao] = useState<Record<string, DaSessao>>({});
  const [pedindo, setPedindo] = useState<string | null>(null);

  /*
   * O QUE NAO CHEGOU AO BANCO — e ela NAO depende do mes do seletor, de
   * proposito. A tabela abaixo e o mes; esta lista e a carteira: uma fatura de
   * MAI que nunca virou boleto continua sendo dinheiro parado em SET, e amarra-la
   * ao seletor faria a lista sumir quando alguem trocasse o mes para conferir
   * outra coisa — que e a maneira mais silenciosa de perder justamente o caso
   * antigo. [30/09] Ela tambem e o que diz, sem ler nada a mais, quais meses tem
   * cobranca sem boleto — a primeira pergunta de `procurarMes`.
   */
  const emissao = useDados<EmissaoTravadaNaTela>(() => api.get('/emissao/travada'));

  useEffect(() => {
    if (escolha || emissao.carregando) return;
    let vivo = true;
    void procurarMes(emissao.dado?.linhas ?? []).then((e) => { if (vivo) setEscolha(e); });
    return () => { vivo = false; };
  }, [escolha, emissao.carregando]);

  const faturas = useDados<Fatura[] | null>(
    () => (mes ? api.get(`/faturamento/${competenciaISO(mes)}`) : Promise.resolve(null)), [mes]);

  /*
   * OS QUATRO NUMEROS DO MES — quanto foi faturado, quanto entrou, quanto falta
   * entrar e quanto venceu sem pagar.
   *
   * VIERAM DA ABA «Faturamento» EM 10/09/2026, quando ela foi removida. Eram a
   * unica coisa util daquela tela: o resto era o caminho aposentado de compor em
   * lote. E AQUI ELES SEGUEM O SELETOR: os numeros do topo e a tabela de baixo
   * respondem a mesma pergunta sobre o mesmo mes.
   */
  const carteira = useDados<PosicaoDaCarteira[] | null>(
    () => (mes ? api.get(`/carteira?competencia=${competenciaISO(mes)}`) : Promise.resolve(null)), [mes]);
  const posicaoDoMes = carteira.dado?.[0] ?? null;

  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  /* O NOME DO CLIENTE, que a fatura nao traz. Uma leitura so, como a das
   * unidades — a revisao antes de emitir mostra unidade E cliente, porque numero
   * de unidade nao se reconhece de cabeca. Falhar aqui so tira o nome. */
  const clientes = useDados<Cliente[]>(() => api.get('/clientes?limite=500'));

  // O NUMERO DA UC NAO VEM NA FATURA, e ele e a unica coluna que quem opera
  // reconhece: a fatura carrega `unidade_consumidora_id`, um uuid. O mapa e
  // montado aqui em vez de por uma requisicao por linha - com 39 UCs, 39
  // requisicoes prenderiam 39 conexoes do pool transacional (ver `emLotes`).
  const ucPorId = useMemo(() => new Map((ucs.dado ?? []).map((u) => [u.id, u])), [ucs.dado]);
  const ucPorNumero = useMemo(() => new Map((ucs.dado ?? []).map((u) => [u.numero_uc, u])), [ucs.dado]);
  const nomeDoCliente = useMemo(() => new Map((clientes.dado ?? []).map((c) => [c.id, c.nome])), [clientes.dado]);
  const travadaPorFatura = useMemo(
    () => new Map((emissao.dado?.linhas ?? []).map((l) => [l.fatura_id, l])), [emissao.dado]);

  const numeroDaUc = (id: string): string | undefined => ucPorId.get(id)?.numero_uc;
  const unidadeDe = (f: Fatura): string => numeroDaUc(f.unidade_consumidora_id) ?? f.unidade_consumidora_id.slice(0, 8);
  const clienteDe = (f: Fatura): string | null => {
    const u = ucPorId.get(f.unidade_consumidora_id);
    return (u && nomeDoCliente.get(u.cliente_id)) ?? travadaPorFatura.get(f.id)?.cliente ?? null;
  };
  const recusaDe = (f: Fatura): RecusaLida | null => recusaDaLinha({
    daSessao: daSessao[f.id] ?? null,
    ultimoErro: travadaPorFatura.get(f.id)?.boleto?.ultimo_erro ?? null,
    uc: ucPorId.get(f.unidade_consumidora_id) ?? null,
    mes,
  });
  const recusaDaLista = (l: LinhaNaTela): RecusaLida | null => recusaDaLinha({
    daSessao: daSessao[l.fatura_id] ?? null,
    ultimoErro: l.boleto?.ultimo_erro ?? null,
    uc: ucPorNumero.get(l.unidade) ?? null,
    mes: String(l.competencia).slice(0, 7),
  });

  const lista = ordenar(faturas.dado ?? [], ordem, {
    acao: (f) => chaveDaOrdemDeAcao(f, travadaPorFatura.has(f.id)),
    uc: (f) => numeroDaUc(f.unidade_consumidora_id) ?? null,
    vencimento: (f) => f.vencimento,
    total: (f) => f.valor_total_centavos,
    consumo: (f) => Number(f.consumo_kwh ?? 0),
  });

  const recarregar = () => { faturas.recarregar(); emissao.recarregar(); carteira.recarregar(); };

  function escolherMes(v: string) {
    if (!/^\d{4}-\d{2}$/.test(v)) return;
    setEscolha({ mes: v, origem: 'escolhido' });
    lembrarMes(armazem(), v);
    setAberta(null); setCancelando(null); setRevisando(null); setSerie(null);
    acao.limpar();
  }

  /** Uma so, pela linha. Sem pergunta: o valor esta na propria linha, e emitir
   *  uma de cada vez e o caminho de quem quer olhar uma por uma. */
  async function emitirUma(f: Fatura) {
    const ok = await acao.executar(() => api.post(`/faturas/${f.id}/emitir`));
    if (ok) { acao.anunciar(`Cobrança da unidade ${unidadeDe(f)} emitida.`); recarregar(); }
  }

  /* O MESMO caminho de escrita do painel de uma fatura (`POST .../boleto`), e a
   * repeticao aqui e so o gatilho: `registrar()` reaproveita a linha que existe
   * e conta a tentativa, entao pedir daqui e pedir de la. A recusa volta NOMEADA
   * (`ErroDaApi.nome`) e e guardada para a linha mostrar a saida dela. */
  async function pedirBoleto(faturaId: string) {
    const f = (faturas.dado ?? []).find((x) => x.id === faturaId);
    const unidade = f ? unidadeDe(f) : travadaPorFatura.get(faturaId)?.unidade ?? '';
    setPedindo(faturaId);
    acao.limpar();
    try {
      await api.post(`/faturas/${faturaId}/boleto`);
      setDaSessao((s) => { const x = { ...s }; delete x[faturaId]; return x; });
      acao.anunciar(`Boleto da unidade ${unidade} registrado no banco.`);
    } catch (e) {
      const nome = e instanceof ErroDaApi ? e.nome : null;
      const texto = naMensagem(e);
      setDaSessao((s) => ({ ...s, [faturaId]: { nome, texto } }));
    } finally {
      setPedindo(null);
      recarregar();
    }
  }

  /** «Emitir N» e «Pedir os N boletos», UMA CHAMADA DE CADA VEZ. Ver a secao 4
   *  de `emissao-regras.ts` para o porque da serie. */
  async function rodar(tipo: 'emitir' | 'boletos', ids: string[]) {
    const porId = new Map(lista.map((f) => [f.id, f]));
    const escolhidas = ids.map((id) => porId.get(id)).filter((f): f is Fatura => f !== undefined);
    if (escolhidas.length === 0) return;
    const marcar = (id: string, e: EstadoDaVez) =>
      setSerie((s) => (s ? { ...s, estados: { ...s.estados, [id]: e } } : s));
    setSerie({
      tipo, linhas: escolhidas.map(linhaDaSerie),
      estados: Object.fromEntries(escolhidas.map((f) => [f.id, { estado: 'na_vez' } as EstadoDaVez])),
      rodando: true,
    });
    acao.limpar();
    try {
      for (const f of escolhidas) {
        marcar(f.id, { estado: 'andando' });
        try {
          await api.post(tipo === 'emitir' ? `/faturas/${f.id}/emitir` : `/faturas/${f.id}/boleto`);
          if (tipo === 'boletos') setDaSessao((s) => { const x = { ...s }; delete x[f.id]; return x; });
          marcar(f.id, { estado: 'feita' });
        } catch (e) {
          const nome = e instanceof ErroDaApi ? e.nome : null;
          const texto = naMensagem(e);
          let recusa: RecusaLida | null = null;
          if (tipo === 'boletos') {
            setDaSessao((s) => ({ ...s, [f.id]: { nome, texto } }));
            recusa = recusaDaLinha({ daSessao: { nome, texto }, uc: ucPorId.get(f.unidade_consumidora_id) ?? null, mes });
          }
          marcar(f.id, { estado: 'recusada', motivo: texto, recusa });
        }
      }
    } finally {
      setSerie((s) => (s ? { ...s, rodando: false } : s));
      recarregar();
    }
  }

  function abrirRevisao(tipo: 'emitir' | 'boletos') {
    setSerie(null);
    setRevisando(tipo);
    setAberta(null);
    setCancelando(null);
    acao.limpar();
  }

  function fecharRevisao() {
    setRevisando(null);
    setSerie(null);
    requestAnimationFrame(() => document.getElementById('em-mes-titulo')?.focus());
  }

  function linhaDaSerie(f: Fatura): LinhaDaSerie {
    return {
      id: f.id, unidade: unidadeDe(f), cliente: clienteDe(f),
      vencimento: f.vencimento, valor_centavos: f.valor_total_centavos,
    };
  }

  /*
   * CANCELAR — o botao que faltava, e o sistema mandava usa-lo.
   *
   * A rota existe desde sempre (`POST /faturas/:id/cancelar`) e ate 08/09/2026
   * NENHUM arquivo de `web/src` a chamava. Enquanto isso, TRES lugares da
   * interface mandam cancelar: o aviso da tarifa ("corrigir exige cancelar e
   * refazer"), a pergunta do lote, e a recusa `registro_ja_faturado`, cujo texto
   * diz literalmente *"Para refazer, cancele a fatura primeiro"*.
   *
   * O MOTIVO E OBRIGATORIO na rota (422 sem ele), entao ele e perguntado aqui em
   * vez de descoberto no erro. [30/09] A pergunta saiu do `prompt()` e foi para
   * a propria linha, logo abaixo da cobranca que ela cancela — e o texto dela
   * diz o que o cancelamento FAZ alem de mudar o status: solta a conta lida, que
   * volta a ser faturavel.
   */
  async function cancelar(f: Fatura, motivo: string) {
    setCancelandoOcupado(true);
    setErroDoCancelamento(null);
    try {
      await api.post(`/faturas/${f.id}/cancelar`, { motivo });
      setCancelando(null);
      acao.anunciar(`Cobrança da unidade ${unidadeDe(f)} cancelada. A conta lida voltou a ser faturável.`);
      recarregar();
      requestAnimationFrame(() => document.getElementById('em-mes-titulo')?.focus());
    } catch (e) {
      setErroDoCancelamento(naMensagem(e));
    } finally { setCancelandoOcupado(false); }
  }

  function pedirCancelamento(id: string | null) {
    const antes = cancelando;
    setCancelando(id);
    setErroDoCancelamento(null);
    /* «MANTER» DEVOLVE O FOCO ao menu que abriu a pergunta. */
    if (id === null && antes) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-menu-da-linha="${antes}"] .menu > button`)?.focus());
    }
  }

  const exportar = () => {
    if (!mes) return;
    const csv = paraCsv<Fatura>([
      { titulo: 'Unidade', de: (f) => numeroDaUc(f.unidade_consumidora_id) ?? f.unidade_consumidora_id },
      { titulo: 'Mes de referencia', de: (f) => String(f.competencia).slice(0, 7) },
      { titulo: 'Status', de: (f) => f.status },
      { titulo: 'Vencimento', de: (f) => String(f.vencimento).slice(0, 10) },
      { titulo: 'Geração kWh', de: (f) => f.geracao_kwh_competencia ?? '' },
      { titulo: '% da fatia do cliente', de: (f) => f.percentual_rateio_aplicado ?? '' },
      { titulo: 'Consumo kWh', de: (f) => f.consumo_kwh ?? '' },
      { titulo: 'Tarifa R$/kWh', de: (f) => f.tarifa_reais_por_kwh ?? '' },
      { titulo: 'Consumo R$', de: (f) => reaisParaPlanilha(f.valor_consumo_centavos) },
      { titulo: 'Concessionária R$', de: (f) => reaisParaPlanilha(f.valor_tarifas_concessionaria_centavos) },
      { titulo: 'Juros/multa R$', de: (f) => reaisParaPlanilha(f.valor_juros_multa_centavos) },
      { titulo: 'Total R$', de: (f) => reaisParaPlanilha(f.valor_total_centavos) },
      { titulo: 'Fatura cheia', de: (f) => (f.flag_fatura_cheia ? 'sim' : 'não') },
    ], lista);
    baixarCsv(nomeDoArquivo('faturas', mes), csv);
  };

  // -------------------------------------------------------- o que o mes pede
  const rascunhos = lista.filter((f) => f.status === 'rascunho');
  const { pedir, deFora } = paraPedirBoleto(lista, (id) => travadaPorFatura.get(id), recusaDe);
  const semBoleto = lista.filter((f) => (f.status === 'emitida' || f.status === 'vencida') && travadaPorFatura.has(f.id)).length;
  const vencidas = lista.filter((f) => f.status === 'vencida').length;
  const pagas = lista.filter((f) => f.status === 'paga').length;
  const tarifas = conferirTarifas(lista, (id) => numeroDaUc(id));
  const deOutrosMeses = (emissao.dado?.linhas ?? []).filter((l) => String(l.competencia).slice(0, 7) !== mes).length;
  const rotuloDoPedido = (n: number) => (n === 1 ? 'Pedir 1 boleto' : `Pedir os ${n} boletos`);
  const cobrancas = (n: number) => `${n} ${n === 1 ? 'cobrança' : 'cobranças'}`;
  const mesPorExtenso = mes ? rotuloDoMes(mes) : '';

  const resumo = !faturas.dado ? null : [
    cobrancas(lista.length),
    rascunhos.length > 0 && `${rascunhos.length} em rascunho`,
    semBoleto > 0 && `${semBoleto} sem boleto no banco`,
    vencidas > 0 && `${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}`,
    pagas > 0 && `${pagas} ${pagas === 1 ? 'paga' : 'pagas'}`,
  ].filter(Boolean).join(' · ');

  /*
   * A TARIFA DA CONCESSIONARIA QUE NAO FOI LANCADA — `Q-TARIFA-CONC-01`.
   *
   * Isto conta, e nao decide: um mes pode legitimamente nao levar tarifa da
   * distribuidora, e essa pergunta tem dono e nao e esta tela. O que nao pode
   * continuar e a ausencia ser INVISIVEL — `valor_total_centavos` e coluna
   * gerada, a parcela ausente vale zero, e a fatura sai menor sem erro, sem log
   * e sem recusa. [30/09] Ele aparece TAMBEM dentro da revisao, que e o ultimo
   * lugar antes do ato que obriga a cancelar para desfazer — e la ele e dito em
   * portugues, sem o comando de terminal que ninguem aqui tem.
   */
  const avisoDaTarifa = tarifas.semTarifa > 0 && (
    <Aviso tipo="alerta">
      <strong>{tarifas.semTarifa} de {tarifas.rascunhos} {tarifas.rascunhos === 1 ? 'rascunho' : 'rascunhos'} sem
      a tarifa da distribuidora</strong> — {tarifas.semTarifa === 1 ? 'ela sairia' : 'elas sairiam'} cobrando
      só a energia injetada. Se o mês leva tarifa, lance antes, em «Tarifa», na linha de cada
      unidade: depois de emitida, corrigir é cancelar e refazer. Se o mês não leva, emitir está certo.
      <br />
      <span className="fraco">
        Unidades: {tarifas.ucsSemTarifa.slice(0, 12).join(', ')}
        {tarifas.ucsSemTarifa.length > 12 ? `, +${tarifas.ucsSemTarifa.length - 12}` : ''}
      </span>
      <DetalheTecnico>
        <p style={{ margin: 0 }}>
          A ordem é <strong>compor → <code>npm run tarifas</code> → emitir</strong>: lançar
          tarifa só é possível em rascunho. Se o mês não leva tarifa da distribuidora, é a
          pergunta (a) da <code>Q-TARIFA-CONC-01</code>.
        </p>
      </DetalheTecnico>
    </Aviso>
  );

  const colunas = 7;

  return (
    /* O TITULO E O NOME DA ABA, «Cobranças», desde 30/09/2026 (etapa 3; antes
       «Emissão e cobrança»): os passos 3 e 4 do mes. A rota `/faturas` ficou. */
    <Pagina titulo="Cobranças"
            sub="O mês de referência inteiro, linha por linha. Emitir fecha o valor, o boleto vem depois, e dar baixa é o que dispara a divisão do dinheiro. A folha que o cliente recebe, a Fatura unificada, se monta na tela Contas de luz.">
      {/* ONDE ESTA TELA FICA NO MÊS — 10/09/2026. Quem chega aqui vindo de fora
          do roteiro não sabia que existem dois passos antes deste, nem que há um
          depois. A faixa é derivada do mesmo `MOLDES` que monta o funil na
          tela Mês, então as duas não têm como discordar. */}
      <FaixaDoPasso rota="/faturas" />

      {/* O MÊS PRIMEIRO, e depois os números dele: a faixa diz QUAL mês, e por
          que a tela abriu nele. Até 30/09 os números vinham antes do seletor que
          os governa. */}
      <div className="cartao secao em-mes">
        <div className="em-mes-campo">
          <label>Mês de referência</label>
          {mes
            ? <CampoData mes valor={mes} ao={escolherMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} />
            : <span className="em-mes-procurando">Procurando…</span>}
          <AjudaDoMes />
        </div>
        {escolha && escolha.origem !== 'escolhido' && (
          <p className="em-mes-porque" role="status">
            <Icone nome="calendario" tamanho={15} />
            <span>{fraseDaOrigem(escolha.origem)}</span>
          </p>
        )}
        <button type="button" className="discreto em-mes-csv" onClick={exportar} disabled={!lista.length}>
          <Icone nome="baixar" tamanho={15} /> Exportar CSV
        </button>
      </div>

      {/* SO DESENHA COM LINHA NO BANCO. Um mes sem fatura nenhuma nao tem linha
          na `posicao_da_carteira`, e quatro zeros seriam uma afirmacao sobre um
          mes que ainda nao comecou — a tabela logo abaixo ja diz que ele esta
          vazio, com as palavras certas. */}
      {posicaoDoMes && (
        <div className="kpis">
          <Kpi nome="Faturado" icone="faturado" valor={emReais(posicaoDoMes.faturado_centavos)} />
          <Kpi nome="Recebido" icone="recebido" valor={emReais(posicaoDoMes.recebido_centavos)} />
          <Kpi nome="A receber" icone="a_receber" valor={emReais(posicaoDoMes.a_receber_centavos)} />
          <Kpi nome="Vencidas em aberto" icone="vencidas" valor={posicaoDoMes.vencidas_em_aberto}
               tom={posicaoDoMes.vencidas_em_aberto ? 'erro' : undefined} />
        </div>
      )}

      <section className="em-bloco secao" aria-labelledby="em-mes-titulo">
        <div className="em-bloco-topo">
          <div className="em-bloco-titulo">
            <h2 id="em-mes-titulo" tabIndex={-1}>
              {mes ? `Cobranças de ${mesPorExtenso}` : 'Cobranças do mês'}
            </h2>
            {resumo && <p className="em-bloco-resumo">{resumo}</p>}
          </div>
          {/* O LARANJA SEGUE O PASSO DO MÊS: com rascunho, é «Emitir N»; sem,
              passa para «Pedir os N boletos». Os dois ao mesmo tempo quando há
              os dois trabalhos — o do passo anterior é o laranja. Durante a
              revisão eles somem: a pergunta está aberta logo abaixo. */}
          {!revisando && (rascunhos.length > 0 || pedir.length > 0) && (
            <div className="em-bloco-acoes">
              {pedir.length > 0 && (
                <button type="button" className={rascunhos.length > 0 ? undefined : 'primario'}
                        disabled={acao.ocupado || pedindo !== null} onClick={() => abrirRevisao('boletos')}>
                  <Icone nome="boleto" tamanho={15} /> {rotuloDoPedido(pedir.length)}
                </button>
              )}
              {rascunhos.length > 0 && (
                <button type="button" className="primario" disabled={acao.ocupado}
                        onClick={() => abrirRevisao('emitir')}>
                  <Icone nome="emitir" tamanho={15} peso="bold" /> Emitir {cobrancas(rascunhos.length)}
                </button>
              )}
            </div>
          )}
        </div>

        <p className="em-ordem">
          {ordem.chave === 'acao' && !ordem.desc
            ? 'Na ordem do que precisa de você: rascunho, sem boleto, vencida, emitida e paga.'
            : <>
                Ordem trocada pelo cabeçalho da tabela.{' '}
                <button type="button" className="em-link" onClick={() => alternar('acao')}>
                  Voltar à ordem do que precisa de você
                </button>
              </>}
          {deOutrosMeses > 0 && (
            <>
              {' '}
              <a href="#em-banco" className="em-outros">
                {deOutrosMeses === 1
                  ? 'Há 1 cobrança de outro mês sem boleto no banco'
                  : `Há ${deOutrosMeses} cobranças de outros meses sem boleto no banco`}
              </a>, na lista logo abaixo da tabela.
            </>
          )}
        </p>

        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
        {!revisando && avisoDaTarifa}

        {revisando === 'emitir' && mes && (
          <RevisaoDaSerie key="emitir" tipo="emitir" mes={mesPorExtenso}
                          linhas={serie?.tipo === 'emitir' ? serie.linhas : rascunhos.map(linhaDaSerie)}
                          estados={serie?.tipo === 'emitir' ? serie.estados : {}}
                          emRodada={serie?.tipo === 'emitir'} rodando={serie?.rodando ?? false}
                          alerta={avisoDaTarifa || undefined}
                          aoConfirmar={(ids) => void rodar('emitir', ids)} aoFechar={fecharRevisao}
                          proxima={pedir.length > 0
                            ? { rotulo: rotuloDoPedido(pedir.length), ao: () => abrirRevisao('boletos') }
                            : null} />
        )}
        {revisando === 'boletos' && mes && (
          <RevisaoDaSerie key="boletos" tipo="boletos" mes={mesPorExtenso}
                          linhas={serie?.tipo === 'boletos' ? serie.linhas : pedir.map(linhaDaSerie)}
                          estados={serie?.tipo === 'boletos' ? serie.estados : {}}
                          emRodada={serie?.tipo === 'boletos'} rodando={serie?.rodando ?? false}
                          deFora={deFora.map(({ f, recusa }) => ({ id: f.id, unidade: unidadeDe(f), cliente: clienteDe(f), recusa }))}
                          aoConfirmar={(ids) => void rodar('boletos', ids)} aoFechar={fecharRevisao} />
        )}

        {/*
          OS TRES ESTADOS DO VAZIO, distinguidos. E a licao da tela de Contratos
          (28/07): "nenhuma fatura" durante a carga, ou depois de uma falha de
          leitura, e a mesma mentira que um `catch` vazio conta.
        */}
        {faturas.erro && (
          <Aviso tipo="erro">
            Não foi possível ler as faturas: {faturas.erro} — esta lista não está vazia,
            ela é <strong>desconhecida</strong>.
          </Aviso>
        )}
        {ucs.erro && (
          <Aviso tipo="alerta">
            Falha ao ler as unidades consumidoras: {ucs.erro} — a coluna Unidade abaixo mostra o
            identificador interno em vez do número, e a tela não consegue prever a recusa por endereço.
          </Aviso>
        )}

        <div className="em-tabela">
          <Tabela cabecalho={<>
                    <th className="c-abrir"><span className="so-leitor">Abrir</span></th>
                    <ThOrd chave="uc" ordem={ordem} ao={alternar}>Unidade</ThOrd>
                    <ThOrd chave="acao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                    <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                    <ThOrd chave="consumo" ordem={ordem} ao={alternar} num>Consumo kWh</ThOrd>
                    <ThOrd chave="total" ordem={ordem} ao={alternar} num>Total</ThOrd>
                    <th><span className="so-leitor">Ações</span></th>
                  </>}
                  vazio={!mes || faturas.carregando
                    ? <Carregando texto={mes ? 'Lendo o mês…' : 'Procurando o mês com trabalho…'} />
                    : faturas.erro
                      ? 'Lista desconhecida — o aviso acima diz por quê.'
                      /* O TEXTO MANDAVA PARA O CAMINHO APOSENTADO, e citava um
                         rotulo que a barra nao usa desde 21/08 ("Carteira"). A
                         fatura do caminho oficial nasce na competencia da CONTA
                         — e desde 30/09 a tela ja abre nesse mes quando ha
                         trabalho, entao o vazio aqui e um mes escolhido sem
                         cobranca, e o texto diz onde elas nascem. */
                      : `Nenhuma cobrança em ${mesPorExtenso}. A cobrança nasce no mês da CONTA da `
                        + 'distribuidora — troque o mês acima. Ela é gerada na tela Contas de luz, '
                        + 'em «Gerar N cobranças».'}>
            {lista.map((f) => {
              const t = travadaPorFatura.get(f.id);
              const recusa = recusaDe(f);
              const sessao = daSessao[f.id];
              /* A RECUSA DESCONHECIDA que acabou de voltar tambem e dita na linha,
                 com as palavras do banco: sem traducao, e a unica informacao. */
              const nota = notaDaSituacao(f.status, t, recusa)
                ?? (sessao && !tipoDaRecusa(sessao.nome, sessao.texto)
                  ? { texto: `O banco recusou agora: ${sessao.texto}`, alerta: true } : null);
              return (
                <LinhaDaCobranca key={f.id} f={f} unidade={unidadeDe(f)} cliente={clienteDe(f)}
                                 colunas={colunas}
                                 nota={nota} acaoDaLinha={acaoDaLinha(f.status, t, recusa)}
                                 aberta={aberta === f.id}
                                 abrir={() => { setAberta(aberta === f.id ? null : f.id); setCancelando(null); }}
                                 ocupado={acao.ocupado || Boolean(serie?.rodando)}
                                 pedindo={pedindo === f.id}
                                 emitir={() => void emitirUma(f)}
                                 pedirBoleto={() => void pedirBoleto(f.id)}
                                 cancelando={cancelando === f.id}
                                 temBoletoNoBanco={Boolean(emissao.dado) && !emissao.erro
                                   && (emissao.dado!.total <= emissao.dado!.linhas.length)
                                   && (f.status === 'emitida' || f.status === 'vencida') && !t}
                                 cancelandoOcupado={cancelandoOcupado}
                                 erroDoCancelamento={erroDoCancelamento}
                                 pedirCancelamento={pedirCancelamento}
                                 cancelar={(motivo) => void cancelar(f, motivo)}
                                 painel={
                                   <PainelDaFatura f={f} unidade={unidadeDe(f)}
                                                   uc={ucPorId.get(f.unidade_consumidora_id) ?? null}
                                                   mes={mes} daSessao={sessao ?? null}
                                                   ultimoErroDaLista={t?.boleto?.ultimo_erro ?? null}
                                                   pedirBoleto={() => pedirBoleto(f.id)} pedindo={pedindo === f.id}
                                                   recarregar={recarregar} />
                                 } />
              );
            })}
          </Tabela>
        </div>
      </section>

      {/*
        A LISTA DO QUE NAO CHEGOU AO BANCO DESCEU PARA DEPOIS DA TABELA em
        30/09/2026. Ela vinha antes porque a tabela nao mostrava a ausencia —
        "uma fatura emitida que nunca virou boleto nao aparece em nenhuma coluna
        da tabela". Agora aparece: a ordem de acao poe a sem-boleto logo depois
        do rascunho, com o porque na segunda linha da situacao, e a tela abre no
        mes que tem esse trabalho. O que a lista continua dizendo e o que a
        tabela do mes nao alcanca — os outros meses —, e a linha acima da tabela
        avisa quando ha algum, com o numero.
      */}
      <PainelDaEmissao dados={emissao.dado} erro={emissao.erro}
                       pedirBoleto={(id) => void pedirBoleto(id)} ocupado={acao.ocupado || pedindo !== null}
                       recusaDe={recusaDaLista} />
    </Pagina>
  );
}

// ------------------------------------------------------------- a linha e o painel

function LinhaDaCobranca(p: {
  f: Fatura; unidade: string; cliente: string | null; colunas: number;
  nota: { texto: string; alerta: boolean } | null;
  acaoDaLinha: ReturnType<typeof acaoDaLinha>;
  aberta: boolean; abrir: () => void;
  ocupado: boolean; pedindo: boolean;
  emitir: () => void; pedirBoleto: () => void;
  cancelando: boolean; temBoletoNoBanco: boolean; cancelandoOcupado: boolean;
  erroDoCancelamento: string | null;
  pedirCancelamento: (id: string | null) => void;
  cancelar: (motivo: string) => void;
  painel: ReactNode;
}) {
  const { f } = p;
  const a = p.acaoDaLinha;
  /* CANCELAR SO ONDE A ROTA ACEITA (`rascunho`, `emitida`, `vencida`) —
     oferece-lo numa fatura paga seria oferecer o que o servidor recusa, e numa
     ja cancelada seria oferecer duas vezes o mesmo. */
  const cancelavel = f.status === 'rascunho' || f.status === 'emitida' || f.status === 'vencida';
  const oQueAbre = f.status === 'rascunho' ? 'a tarifa' : 'o boleto e a baixa';

  return (
    <>
      <tr className={p.aberta ? 'em-aberta' : undefined}>
        <td className="c-abrir">
          {/* O TRIANGULO ABRE O PAINEL DA LINHA. Era «Boleto e baixa» escrito em
              vinte botoes com o peso do «Emitir»; o nome continua no leitor de
              tela e, no celular, ao lado do triangulo. */}
          <button type="button" className="em-abrir" onClick={p.abrir} aria-expanded={p.aberta}
                  aria-controls={`em-painel-${f.id}`}
                  aria-label={`${p.aberta ? 'Fechar' : 'Abrir'} ${oQueAbre} da unidade ${p.unidade}`}
                  title={p.aberta ? 'Fechar' : f.status === 'rascunho' ? 'Tarifa' : 'Boleto e baixa'}>
            <Icone nome={p.aberta ? 'abrir_menu' : 'abrir_linha'} tamanho={14} peso="bold" />
            <span className="em-abrir-texto">{f.status === 'rascunho' ? 'Tarifa' : 'Boleto e baixa'}</span>
          </button>
        </td>
        <td className="c-uc">
          <strong>{p.unidade}</strong>
          <span className="em-cliente" title={p.cliente ?? undefined}>{p.cliente || '—'}</span>
        </td>
        <td className="c-sit"><SituacaoDaCobranca status={f.status} nota={p.nota} /></td>
        <td className="c-ven" data-rotulo="Vencimento">{dataEmBr(f.vencimento)}</td>
        <td className="c-kwh num" data-rotulo="Consumo kWh">{kwhEmBr(f.consumo_kwh)}</td>
        <td className="c-tot num" data-rotulo="Total"><strong>{emReais(f.valor_total_centavos)}</strong></td>
        <td className="c-aco">
          <div className="em-acoes">
            {a.tipo === 'emitir' && (
              <button type="button" onClick={p.emitir} disabled={p.ocupado}
                      aria-label={`Emitir a cobrança da unidade ${p.unidade}`}>
                <Icone nome="emitir" tamanho={14} /> Emitir
              </button>
            )}
            {a.tipo === 'pedir_boleto' && (
              <button type="button" onClick={p.pedirBoleto} disabled={p.ocupado || p.pedindo}
                      aria-label={`Pedir o boleto da unidade ${p.unidade}`}>
                <Icone nome={p.pedindo ? 'carregando' : 'boleto'} tamanho={14} />
                {p.pedindo ? 'Pedindo…' : 'Pedir o boleto'}
              </button>
            )}
            {a.tipo === 'resolver' && a.recusa.saida && (
              <BotaoDaSaida saida={a.recusa.saida}
                            rotuloAcessivel={`${a.recusa.saida.rotulo} da unidade ${p.unidade}`} />
            )}
            {cancelavel ? (
              <span data-menu-da-linha={f.id} style={{ display: 'contents' }}>
                <Menu soIcone className="em-menu" rotulo={`Mais ações da unidade ${p.unidade}`}
                      gatilho={<Icone nome="mais_acoes" tamanho={18} peso="bold" />}>
                  <button type="button" role="menuitem" onClick={() => p.pedirCancelamento(f.id)}>
                    <Icone nome="remover" tamanho={16} /> Cancelar esta cobrança…
                  </button>
                </Menu>
              </span>
            ) : <span className="em-menu-vazio" aria-hidden="true" />}
          </div>
        </td>
      </tr>
      {p.cancelando && (
        <tr className="em-linha-confirma">
          <td colSpan={p.colunas}>
            {p.temBoletoNoBanco ? (
              /* A ORDEM DOS DOIS ATOS, dita antes da tentativa errada: desde
                 10/09/2026 o servidor RECUSA cancelar a cobranca enquanto o
                 titulo estiver vivo no banco. A tela ja sabe (a cobranca emitida
                 que nao esta na lista do que nao chegou ao banco TEM boleto la),
                 entao ela diz em vez de colher a recusa. */
              <ConfirmacaoNaLinha rotulo="Cancelar a cobrança" manter="Voltar"
                                  confirmar="Abrir o boleto desta linha"
                                  aoManter={() => p.pedirCancelamento(null)}
                                  aoConfirmar={() => { p.pedirCancelamento(null); if (!p.aberta) p.abrir(); }}>
                A cobrança da unidade <strong>{p.unidade}</strong> tem boleto registrado no banco.
                Enquanto ele valer, o cliente consegue pagar por ele — cancele o boleto primeiro, no
                painel da linha, e depois a cobrança.
              </ConfirmacaoNaLinha>
            ) : (
              <ConfirmacaoNaLinha rotulo="Confirmar o cancelamento" perigo
                                  motivo={{ rotulo: 'Motivo do cancelamento', dica: 'Ex.: conta lida de novo, valor corrigido' }}
                                  manter="Manter a cobrança" confirmar="Cancelar a cobrança"
                                  ocupado={p.cancelandoOcupado} erro={p.erroDoCancelamento}
                                  aoManter={() => p.pedirCancelamento(null)} aoConfirmar={p.cancelar}>
                Cancelar a cobrança da unidade <strong>{p.unidade}</strong> ({emReais(f.valor_total_centavos)})?
                Ela fica registrada como cancelada, com o motivo e a data — não some. A conta lida que
                a originou volta a poder virar cobrança.
              </ConfirmacaoNaLinha>
            )}
          </td>
        </tr>
      )}
      {p.aberta && (
        <tr className="em-linha-painel">
          {/* O painel aberto recua para a terceira superficie da paleta: sem isso
              ele se confunde com a linha seguinte da tabela. `--fundo-suave` era
              um token que NAO EXISTIA - o fallback `transparent` estava em uso
              desde 29/07 sem ninguem notar. O nome certo e `--fundo-recuo`. */}
          <td colSpan={p.colunas} id={`em-painel-${f.id}`}>{p.painel}</td>
        </tr>
      )}
    </>
  );
}

/**
 * O PAINEL DA LINHA — duas secoes, e um laranja por secao.
 *
 * ATE 30/09 ERA UMA MINI-TELA DE ~800px com quatro subtarefas soltas (tarifa,
 * boleto, importar, baixa), o laranja do «Gerar boleto» mesmo depois de uma
 * recusa garantida e o outro laranja no «Registrar pagamento», que nao se
 * desfaz. Agora: «Boleto» (o laranja e o proximo passo dele — pedir, ou a saida
 * da recusa), e «Baixa manual» (sem laranja ate o resumo; o laranja e o «Sim»
 * do resumo). Importar o boleto emitido no site do banco fica dobrado dentro de
 * «Boleto»: e o caminho de quem ja emitiu por fora, nao o de todo dia.
 */
function PainelDaFatura({ f, unidade, uc, mes, daSessao, ultimoErroDaLista, pedirBoleto, pedindo, recarregar }: {
  f: Fatura; unidade: string; uc: UnidadeConsumidora | null; mes: string | null;
  daSessao: DaSessao | null; ultimoErroDaLista: string | null;
  pedirBoleto: () => Promise<void>; pedindo: boolean; recarregar: () => void;
}) {
  const acao = useAcao();
  const ids = useId();
  // O 404 aqui e RESPOSTA - "esta fatura nao tem boleto" -, e o `useDados` poe
  // qualquer outro erro na tela. Mesma distincao da tela de Cobranca.
  const boleto = useDados<Boleto | null>(async () => {
    try { return await api.get<Boleto>(`/faturas/${f.id}/boleto`); }
    catch (e: any) { if (e?.status === 404) return null; throw e; }
  }, [f.id]);

  const [juros, setJuros] = useState('0');
  const [multa, setMulta] = useState('0');
  const [observacao, setObservacao] = useState('');
  const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [data, setData] = useState(hoje);
  const [conferindoBaixa, setConferindoBaixa] = useState(false);
  const [cancelandoBoleto, setCancelandoBoleto] = useState(false);
  const [importando, setImportando] = useState(false);
  /* A TARIFA DA DISTRIBUIDORA, digitada — o campo que nao existia. Nasce com o
     que a fatura ja tem: zero e um valor legitimo («este mes nao levou tarifa»),
     e um campo vazio faria «gravar» sem digitar nada apagar a parcela sem
     dizer. */
  const [tarifaConc, setTarifaConc] = useState(
    () => (f.valor_tarifas_concessionaria_centavos / 100).toFixed(2).replace('.', ','));

  // Centavos, inteiros. `paraCentavos` converte por TEXTO (regra 1) e levanta
  // `ValorInvalido` no que nao for valor - entao o total so e calculado quando os
  // dois campos sao validos, e nao com um `Number()` que devolveria NaN calado.
  let jurosCent = 0, multaCent = 0, valorInvalido: string | null = null;
  try { jurosCent = juros.trim() ? paraCentavos(juros) : 0; } catch (e: any) { valorInvalido = e.message; }
  try { multaCent = multa.trim() ? paraCentavos(multa) : 0; } catch (e: any) { valorInvalido = e.message; }
  if (!valorInvalido && (jurosCent < 0 || multaCent < 0)) valorInvalido = 'Juros e multa não podem ser negativos.';
  const dataInvalida = !/^\d{4}-\d{2}-\d{2}$/.test(data)
    ? 'Escolha a data em que o dinheiro entrou.'
    : data > hoje ? 'A data do pagamento não pode ser depois de hoje.' : null;
  const totalEsperado = totalEsperadoDaBaixa(f, jurosCent, multaCent);

  const statusDoBoleto = boleto.dado?.status ?? null;
  const podePedir = podeGerarBoleto(f.status, statusDoBoleto);
  const ultimoErro = boleto.dado?.ultimo_erro ?? ultimoErroDaLista;
  const recusa = podePedir ? recusaDaLinha({ daSessao, ultimoErro, uc, mes }) : null;
  /* A ULTIMA RECUSA JA RESOLVIDA: o banco recusou por endereco, e o endereco foi
     completado depois. Ela deixa de ser a acao e vira historia, dita uma vez. */
  const superada = podePedir && !recusa && ultimoErro && tipoDaRecusa(null, ultimoErro) === 'endereco';

  const lancarTarifa = async () => {
    let centavos: number;
    try { centavos = paraCentavos(tarifaConc); }
    catch (e: any) { acao.anunciar(`Valor inválido: ${e.message}`); return; }
    const ok = await acao.executar(() =>
      api.put(`/faturas/${f.id}/tarifas-concessionaria`, { valor_centavos: centavos }));
    if (ok) { acao.anunciar('Tarifa da distribuidora lançada.'); recarregar(); }
  };

  const pedir = async () => { await pedirBoleto(); boleto.recarregar(); };

  /*
   * CANCELAR O BOLETO NO BANCO — o botao que faltava, e a falta era dinheiro.
   *
   * A rota existia desde sempre e nenhuma tela a chamava: medido em 10/09/2026,
   * `POST /faturas/:id/boleto/baixar` era alcancavel so por fora do sistema. O
   * efeito pratico: cancelar a fatura por aqui deixava no banco um titulo
   * REGISTRADO, com linha digitavel valida na mao do cliente - e um pagamento
   * que chegasse depois nao teria como virar baixa, porque a fatura cancelada
   * nao aceita liquidacao. Dinheiro no extrato e nada aqui.
   *
   * O MOTIVO E OBRIGATORIO no servidor, e a tela pede em vez de inventar um: e a
   * mesma disciplina do cancelamento da fatura, e a trilha de auditoria responde
   * "o que" com o que a pessoa escreveu. [30/09] Pedido na propria tela, nao
   * mais num `prompt()`.
   */
  const cancelarNoBanco = async (motivo: string) => {
    const ok = await acao.executar(() => api.post(`/faturas/${f.id}/boleto/baixar`, { motivo }));
    if (ok) { setCancelandoBoleto(false); acao.anunciar('Boleto cancelado no banco.'); boleto.recarregar(); recarregar(); }
  };

  const baixar = async () => {
    /*
     * A RESPOSTA E LIDA, e ate 08/09/2026 ela era descartada.
     *
     * `baixar()` devolve `split_bloqueado` exatamente para este caso, e o
     * comentario dele diz por que: *"o dinheiro entrou e o titulo esta pago. E
     * divergencia - gravada, e alguem precisa olhar"*. A tela anunciava «o
     * dinheiro foi dividido» sempre, sem olhar.
     *
     * NAO E HIPOTETICO: `dono_usina_id` esta em 0 de 4 usinas, e a R12 bloqueia
     * o split inteiro quando falta o dono. **A PRIMEIRA baixa deste sistema vai
     * cair nesse ramo** — e ia dizer que dividiu, tendo dividido nada, sem
     * segunda tela que desmentisse.
     *
     * `acao.executar` devolve booleano e joga o corpo fora, entao a resposta e
     * capturada aqui dentro.
     */
    let resposta: { split_bloqueado?: string | null } | null = null;
    const ok = await acao.executar(async () => {
      resposta = await api.post<{ split_bloqueado?: string | null }>(
        `/faturas/${f.id}/baixa-manual`, {
          valor_liquidado_centavos: totalEsperado,
          juros_centavos: jurosCent,
          multa_centavos: multaCent,
          observacao: observacao.trim() || null,
          data_liquidacao: data,
        });
    });
    if (ok) {
      setConferindoBaixa(false);
      const bloqueio = (resposta as { split_bloqueado?: string | null } | null)?.split_bloqueado;
      acao.anunciar(bloqueio
        ? `Pagamento registrado — mas o dinheiro NÃO foi dividido: ${bloqueio}. `
          + 'A cobrança está paga; o repasse e a comissão ficam pendentes até isso ser resolvido.'
        : 'Pagamento registrado e o dinheiro foi dividido.');
      boleto.recarregar(); recarregar();
    }
  };

  return (
    <div className="em-painel">
      {/* ------------------------------------------ tarifa da distribuidora */}
      {podeLancarTarifaDaDistribuidora(f.status) && (
        <section className="em-painel-secao" aria-labelledby={`${ids}-tarifa`}>
          <h3 id={`${ids}-tarifa`}><Icone nome="carteira" tamanho={16} /> Tarifa da distribuidora</h3>
          <p className="em-painel-nota">
            É a parte da conta da distribuidora que entra nesta cobrança. Quando a conta é lida
            na tela Contas de luz, ela vem de lá e não precisa ser digitada. Só entra em
            rascunho: depois de emitida, o valor já foi para o documento e para o boleto.
          </p>
          <div style={{ ...linha, gap: 8 }}>
            <input value={tarifaConc} onChange={(e) => setTarifaConc(e.target.value)}
                   aria-label="Tarifa da distribuidora em reais" inputMode="decimal"
                   placeholder="0,00" style={{ width: 120, textAlign: 'right' }} />
            <button type="button" onClick={() => void lancarTarifa()} disabled={acao.ocupado}>
              <Icone nome="confirmar" tamanho={15} /> Lançar
            </button>
            <span className="fraco">
              Total da cobrança hoje: <strong>{emReais(f.valor_total_centavos)}</strong>
            </span>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- boleto */}
      {f.status !== 'rascunho' && f.status !== 'cancelada' && (
        <section className="em-painel-secao" aria-labelledby={`${ids}-boleto`}>
          <h3 id={`${ids}-boleto`}><Icone nome="boleto" tamanho={16} /> Boleto</h3>
          {boleto.carregando && <Carregando texto="Lendo o boleto…" />}
          {boleto.erro && <Aviso tipo="erro">Falha ao ler o boleto: {boleto.erro}</Aviso>}
          {boleto.dado && (
            <div className="em-boleto">
              <div style={{ ...linha, gap: 10 }}>
                <Marca tom={boleto.dado.status === 'liquidado' ? 'ok' : boleto.dado.status === 'erro' ? 'pendente' : 'nao_medido'}>
                  {rotulo(boleto.dado.status)}
                </Marca>
                {/*
                  A ORIGEM AO LADO DO STATUS, e nao escondida no detalhe: "registrado"
                  sozinho nao diz se o titulo esta na carteira de cobranca do banco
                  por conta nossa ou porque uma pessoa o emitiu no portal. Quem
                  precisa conferir um boleto no internet banking precisa saber qual
                  dos dois - e a baixa pela API nao vale para o importado.
                */}
                {boleto.dado.origem === 'importado' && (
                  <Marca tom="nao_medido" icone="baixar">emitido no banco</Marca>
                )}
                <span className="fraco">nosso número {boleto.dado.nosso_numero ?? '—'}</span>
                <span className="fraco">{emReais(boleto.dado.valor_registrado_centavos)}</span>
                {boleto.dado.tentativas > 0 && (
                  <span className="fraco">
                    {boleto.dado.tentativas} {boleto.dado.tentativas === 1 ? 'tentativa' : 'tentativas'}
                  </span>
                )}
              </div>
              {boleto.dado.linha_digitavel && (
                <CampoCopiavel rotuloTexto="Linha digitável" valor={boleto.dado.linha_digitavel} />
              )}
              {boleto.dado.pix_copia_e_cola && (
                <CampoCopiavel rotuloTexto="Pix copia e cola" valor={boleto.dado.pix_copia_e_cola} />
              )}
            </div>
          )}

          {podePedir && !boleto.carregando && (
            recusa ? (
              /* A RECUSA COM SAIDA E O LARANJA DAQUI. «Pedir o boleto» some: o
                 servidor recusaria de novo pelo mesmo motivo (A FALHA DE REGISTRO
                 COMMITA de proposito em `repos/boleto.ts` — a tentativa fica, e
                 e ela que a tela le aqui). */
              <RecusaNaTela recusa={recusa} primario unidade={unidade} />
            ) : (
              <>
                {superada && (
                  <p className="em-painel-nota">
                    A última recusa do banco foi por falta de endereço, e o endereço já foi
                    completado. Peça o boleto de novo.
                  </p>
                )}
                {!superada && ultimoErro && <RecusaNaTela recusa={null} bruto={ultimoErro} />}
                {!ultimoErro && !boleto.dado && (
                  /*
                    AS RECUSAS, ESCRITAS ANTES DE ACONTECEREM — e ate 08/09/2026 a
                    tela so conhecia duas. O documento do pagador e o endereco sao
                    as que disparam primeiro, e nenhuma delas envia nada ao banco.
                    Dizer antes custa uma linha e evita a pessoa concluir que o
                    sistema quebrou quando ele esta recusando certo.
                  */
                  <p className="em-painel-nota">
                    Esta cobrança ainda não tem boleto. Pedir confere primeiro o cadastro — CPF ou
                    CNPJ do cliente, endereço do pagador, valor acima de zero — e só então chama o banco.
                  </p>
                )}
                <div className="em-acoes em-acoes-esq">
                  <button type="button" className="primario" onClick={() => void pedir()} disabled={pedindo}>
                    <Icone nome={pedindo ? 'carregando' : 'boleto'} tamanho={15} peso="bold" />
                    {statusDoBoleto === 'erro' || statusDoBoleto === 'pendente' ? 'Pedir o boleto de novo' : 'Pedir o boleto'}
                  </button>
                </div>
              </>
            )
          )}
          {!podePedir && !boleto.dado && !boleto.carregando && !boleto.erro && (
            <p className="em-painel-nota">
              Esta cobrança não tem boleto. Só cobrança emitida ganha boleto, e esta está em
              «{rotulo(f.status)}».
            </p>
          )}

          {/* CANCELAR O TITULO NO BANCO. Sem laranja: e o ato que desfaz, como
              o cancelamento da fatura. Aparece so onde o servidor aceita - boleto
              `registrado` que NOS registramos; o importado se baixa no portal onde
              foi emitido, e o proprio servidor recusa por escrito. A ORDEM DOS
              DOIS ATOS e dita antes de alguem tentar a errada: desde 10/09/2026 o
              servidor RECUSA cancelar a fatura enquanto o titulo estiver vivo. */}
          {podeBaixarNoBanco(statusDoBoleto, boleto.dado?.origem ?? null) && (
            cancelandoBoleto ? (
              <ConfirmacaoNaLinha rotulo="Cancelar o boleto no banco" perigo
                                  motivo={{ rotulo: 'Motivo do cancelamento do boleto', dica: 'Ex.: cobrança refeita com outro valor' }}
                                  manter="Manter o boleto" confirmar="Cancelar o boleto no banco"
                                  ocupado={acao.ocupado} erro={acao.erro}
                                  aoManter={() => setCancelandoBoleto(false)}
                                  aoConfirmar={(m) => void cancelarNoBanco(m)}>
                Cancelar este boleto no banco? O cliente deixa de conseguir pagar por esta linha
                digitável. Para cancelar a cobrança, este é o primeiro passo.
              </ConfirmacaoNaLinha>
            ) : (
              <p className="em-painel-nota">
                Para cancelar esta cobrança, cancele o boleto no banco primeiro: enquanto o título
                estiver registrado, o cliente ainda consegue pagar por ele.{' '}
                <button type="button" className="em-link" onClick={() => { acao.limpar(); setCancelandoBoleto(true); }}>
                  Cancelar o boleto no banco
                </button>
              </p>
            )
          )}

          {/* ------------------------------- o boleto emitido no banco (17/08) */}
          {podeImportarBoleto(f.status, statusDoBoleto) && (
            <div className="em-importar">
              <button type="button" className="discreto" aria-expanded={importando}
                      onClick={() => setImportando((v) => !v)}>
                <Icone nome={importando ? 'abrir_menu' : 'abrir_linha'} tamanho={12} peso="bold" />
                Já emitiu este boleto no site do banco? Importar a linha digitável
              </button>
              {importando && (
                <ImportarBoleto fatura={f} aoImportar={() => { setImportando(false); boleto.recarregar(); recarregar(); }} />
              )}
            </div>
          )}
        </section>
      )}

      {/* -------------------------------------------------------- baixa manual */}
      {podeBaixarManual(f.status) && (
        <section className="em-painel-secao" aria-labelledby={`${ids}-baixa`}>
          <h3 id={`${ids}-baixa`}><Icone nome="recebido" tamanho={16} /> Baixa manual</h3>
          <p className="em-painel-nota">
            Para o dinheiro que entrou sem passar pelo boleto — Pix direto, transferência,
            conciliação na mão. O valor tem de bater <strong>ao centavo</strong>: energia, tarifa da
            distribuidora, juros e multa.
          </p>
          {conferindoBaixa ? (
            <ResumoDaBaixa unidade={unidade}
                           consumo_centavos={f.valor_consumo_centavos}
                           tarifas_centavos={f.valor_tarifas_concessionaria_centavos}
                           juros_centavos={jurosCent} multa_centavos={multaCent}
                           total_centavos={totalEsperado} data={data} observacao={observacao}
                           ocupado={acao.ocupado} erro={acao.erro}
                           aoVoltar={() => { setConferindoBaixa(false); acao.limpar(); }}
                           aoConfirmar={() => void baixar()} />
          ) : (
            <>
              <div className="em-baixa-campos">
                <div>
                  <label htmlFor={`${ids}-data`}>Recebido em</label>
                  <input id={`${ids}-data`} type="date" value={data} max={hoje}
                         onChange={(e) => setData(e.target.value)} />
                </div>
                <div>
                  <label htmlFor={`${ids}-juros`}>Juros (R$)</label>
                  <input id={`${ids}-juros`} value={juros} inputMode="decimal"
                         onChange={(e) => setJuros(e.target.value)} />
                </div>
                <div>
                  <label htmlFor={`${ids}-multa`}>Multa (R$)</label>
                  <input id={`${ids}-multa`} value={multa} inputMode="decimal"
                         onChange={(e) => setMulta(e.target.value)} />
                </div>
                <div className="em-baixa-obs">
                  <label htmlFor={`${ids}-obs`}>Observação</label>
                  <input id={`${ids}-obs`} value={observacao} onChange={(e) => setObservacao(e.target.value)}
                         placeholder="quem pagou, por qual meio" />
                </div>
              </div>
              <div className="em-baixa-pe">
                <span>Total a registrar: <strong>{valorInvalido ? '—' : emReais(totalEsperado)}</strong></span>
                {/* "Registrar pagamento" e nao "Baixar": na mesma tela ha
                    "Exportar CSV", e "baixar" ali quer dizer TRANSFERIR ARQUIVO.
                    [30/09] SEM LARANJA: o botao abre o resumo, e o laranja e o
                    «Sim» de la, depois de ver o valor aberto e a data. */}
                <button type="button" disabled={acao.ocupado || valorInvalido !== null || dataInvalida !== null}
                        onClick={() => { acao.limpar(); setConferindoBaixa(true); }}>
                  <Icone nome="confirmar" tamanho={15} /> Registrar pagamento
                </button>
              </div>
              {(valorInvalido || dataInvalida) && <Aviso tipo="erro">{valorInvalido ?? dataInvalida}</Aviso>}
            </>
          )}
        </section>
      )}

      {!conferindoBaixa && !cancelandoBoleto && acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
    </div>
  );
}

// -------------------------------------------- IMPORTAR O BOLETO DO BANCO (17/08)
//
// POR QUE ESTE BLOCO EXISTE, e por que ele fica AQUI e não na aba Documento.
//
// "Pedir o boleto" logo acima chama a Sicoob pela porta de cobrança, e a porta
// depende do certificado A1 — a única pendência do projeto, e compra externa. Sem
// ele a resposta é 503 nomeado, e a operação faz o que já fazia: emite o boleto à
// mão no internet banking da cooperativa e manda o PDF ao cliente. Esse boleto é
// real. O sistema é que não sabia dele — a fatura dizia "sem boleto", o documento
// saía cobrando por Pix estático (que não concilia) e a conferência aritmética
// nunca rodava.
//
// A ABA CERTA É ESTA porque é a única onde um boleto pertence a UMA fatura. A aba
// Documento também lê boleto por imagem, e é outro ato: lá o boleto entra numa
// FOLHA que se compõe e se imprime, sem tocar a carteira — o registro de lá é
// `registro_de_fatura_unificada`, não `boleto`. Aqui o boleto vira estado da
// fatura: aparece no painel, entra no documento composto e é o que a baixa cobra.
//
// A CONFERÊNCIA É DO SERVIDOR, e a tela nunca a refaz. Os quatro dígitos
// verificadores, a remontagem dos 44 e a leitura do valor e do vencimento de
// dentro deles moram em `src/dominio/`. A tela conta dígitos — só isso — e mostra
// o que `POST /faturas/:id/boleto/conferir` respondeu.
//
// [30/09] ELE NASCE DOBRADO, atrás de «Já emitiu este boleto no site do banco?»:
// é o caminho de quem já emitiu por fora, e aberto em toda linha ele era a maior
// parte do painel.

const EXPLICACAO_DA_TRAVA: Record<MotivoDeTravaDaImportacao, string> = {
  ocupado: 'Trabalhando…',
  sem_linha: 'Cole a linha digitável do boleto, ou envie o PDF acima.',
  digitos_de_menos: '',   // a tela monta a frase com a contagem
  nao_conferida: 'Conferindo com o servidor…',
  recusada: 'O boleto não passou na conferência — o aviso acima diz por quê.',
};

function ImportarBoleto({ fatura, aoImportar }: { fatura: Fatura; aoImportar: () => void }) {
  const acao = useAcao();
  const [linhaDigitavel, setLinhaDigitavel] = useState('');
  const [nossoNumero, setNossoNumero] = useState('');
  const [pix, setPix] = useState('');
  const [lendo, setLendo] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [conferencia, setConferencia] = useState<ConferenciaDoBoletoImportado | null>(null);
  const [conferindo, setConferindo] = useState(false);

  const digitos = linhaDigitavel.replace(/\D/g, '');
  /*
   * A CONFERÊNCIA VALE PARA A LINHA QUE A PRODUZIU, e não para a que está no
   * campo agora. Sem esta comparação, corrigir um dígito depois de uma
   * conferência boa deixaria o botão aceso sobre um resultado velho — que é
   * exatamente o modo de falha que `nao_conferida` existe para fechar.
   */
  const conferida = conferencia && conferencia.digitos === digitos ? conferencia.aceita : null;
  const estado = { linha: linhaDigitavel, ocupado: acao.ocupado || lendo || conferindo, conferida };
  const motivo = motivoDaTravaDaImportacao(estado);

  /** O PDF do boleto, lido pelo mesmo extrator da aba Documento. É chamada PAGA
   *  ao modelo de visão, e por isso é opt-in: quem tem a linha à mão digita. */
  async function enviarPdf(f: File) {
    setLendo(true);
    setStatus(`Lendo ${f.name}…`);
    try {
      const lido = await api.post<BoletoLido>('/faturas/ler-boleto', {
        conteudo_base64: await lerBase64(f), tipo: mimeDo(f),
      });
      setLinhaDigitavel(lido.linha_digitavel);
      setNossoNumero(lido.nosso_numero);
      setPix(lido.pix_copia_e_cola);
      setConferencia(null);
      const n = lido.linha_digitavel.replace(/\D/g, '').length;
      setStatus(n === DIGITOS_DA_LINHA
        ? 'Boleto lido. Confira abaixo antes de importar.'
        : `Boleto lido, mas a linha saiu com ${n} dígitos — corrija abaixo.`);
    } catch (e) {
      setStatus(`Não foi possível ler: ${naMensagem(e)} Digite a linha à mão.`);
    } finally { setLendo(false); }
  }

  /** Pergunta ao servidor, sem gravar nada. É o caminho de relatório. */
  async function conferir() {
    setConferindo(true);
    try {
      setConferencia(await api.post<ConferenciaDoBoletoImportado>(
        `/faturas/${fatura.id}/boleto/conferir`,
        { linha_digitavel: linhaDigitavel, nosso_numero: nossoNumero, pix_copia_e_cola: pix },
      ));
    } catch (e) {
      setStatus(`Não foi possível conferir: ${naMensagem(e)}`);
      setConferencia(null);
    } finally { setConferindo(false); }
  }

  async function importar() {
    const ok = await acao.executar(() => api.post(`/faturas/${fatura.id}/boleto/importar`, {
      linha_digitavel: linhaDigitavel, nosso_numero: nossoNumero, pix_copia_e_cola: pix,
    }));
    if (ok) {
      acao.anunciar('Boleto importado. Ele é o que o documento desta fatura vai imprimir.');
      setLinhaDigitavel(''); setNossoNumero(''); setPix('');
      setConferencia(null); setStatus(null);
      aoImportar();
    }
  }

  return (
    <div className="em-importar-corpo">
      <h4>Importar o boleto emitido no site do banco</h4>
      <p className="em-painel-nota">
        Para o boleto que <strong>já existe</strong> — emitido à mão no portal da cooperativa
        enquanto o certificado A1 não chega. Nada aqui fala com a Sicoob: o título já está
        registrado lá, e o que entra é a transcrição dele. Depois de importado ele aparece no
        painel acima e é o que o documento desta fatura imprime, no lugar do Pix estático.
      </p>

      {/* O `input[type=file]` NU, e não um `<label>` disfarçado de botão: o
          `estilo.ts` já desenha o `::file-selector-button` do sistema, e um
          segundo desenho para o mesmo controle é a divergência que aparece
          quando o tema muda e só um dos dois acompanha. */}
      <div style={{ ...linha, gap: 12, marginBottom: 10 }}>
        <input type="file" accept="application/pdf,image/*" disabled={lendo}
               aria-label={`Enviar o PDF do boleto da fatura ${fatura.id.slice(0, 8)}`}
               onChange={(e) => reenviavel(e, (f) => void enviarPdf(f))} />
        <span className="fraco" style={{ fontSize: 13 }}>
          {lendo
            ? 'Lendo o arquivo…'
            : 'Opcional — a leitura por imagem é uma chamada paga. Com a linha à mão, digite.'}
        </span>
      </div>
      {status && <p className="em-painel-nota">{status}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <label htmlFor={`linha-${fatura.id}`}>Linha digitável</label>
          <input id={`linha-${fatura.id}`} className="mono" value={linhaDigitavel}
                 onChange={(e) => setLinhaDigitavel(e.target.value)}
                 onBlur={() => { if (digitos.length === DIGITOS_DA_LINHA) void conferir(); }}
                 placeholder="75691.50043 01727.686907 00000.130013 1 15410000059669" />
          <span className="fraco" style={{ fontSize: 13 }}>
            {digitos.length === 0
              ? `${DIGITOS_DA_LINHA} dígitos — os pontos e espaços não contam.`
              : `${digitos.length} de ${DIGITOS_DA_LINHA} dígitos.`}
            {' '}O código de barras, o valor e o vencimento são <strong>derivados</strong> dela.
          </span>
        </div>
        <div style={{ ...linha, gap: 12 }}>
          <div style={{ flex: '0 0 180px' }}>
            <label htmlFor={`nn-${fatura.id}`}>Nosso número</label>
            <input id={`nn-${fatura.id}`} value={nossoNumero}
                   onChange={(e) => setNossoNumero(e.target.value)} placeholder="1-3" />
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label htmlFor={`pix-${fatura.id}`}>Pix copia e cola do boleto</label>
            <input id={`pix-${fatura.id}`} className="mono" value={pix}
                   onChange={(e) => setPix(e.target.value)}
                   onBlur={() => { if (digitos.length === DIGITOS_DA_LINHA) void conferir(); }}
                   placeholder="00020101021126… — opcional" />
          </div>
        </div>
      </div>

      {/* ---------------------------------------- o que o servidor respondeu */}
      {conferencia && conferencia.digitos === digitos && (
        conferencia.aceita ? (
          <Aviso tipo="ok">
            Confere. O boleto cobra <strong>{emReais(conferencia.valor_centavos)}</strong>
            {conferencia.vencimento && <> e vence em{' '}
              <strong>{conferencia.vencimento.split('-').reverse().join('/')}</strong></>}
            {' '}— os dois lidos de dentro do código de barras, e os dois batem com esta fatura.
          </Aviso>
        ) : (
          <Aviso tipo="erro">
            {conferencia.frases.map((f, i) => <div key={i}>{f}</div>)}
          </Aviso>
        )
      )}

      {/* SEM LARANJA desde 30/09: dentro do painel da linha o laranja e o do
          proximo passo do boleto, e importar e o caminho alternativo. */}
      <div className="em-acoes em-acoes-esq" style={{ marginTop: 10 }}>
        <button type="button" onClick={() => void importar()} disabled={!podeImportarAgora(estado)}>
          <Icone nome={acao.ocupado ? 'carregando' : 'confirmar'} tamanho={15} peso="bold" />
          Importar boleto
        </button>
        {motivo && (
          <span className="fraco" style={{ fontSize: 13 }}>
            {motivo === 'digitos_de_menos'
              ? `Faltam ${DIGITOS_DA_LINHA - digitos.length} dígito(s) para a linha ficar completa.`
              : EXPLICACAO_DA_TRAVA[motivo]}
          </span>
        )}
        {motivo === 'nao_conferida' && !conferindo && (
          <button type="button" onClick={() => void conferir()}>
            <Icone nome="buscar" tamanho={14} /> Conferir
          </button>
        )}
      </div>

      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
    </div>
  );
}

/** Linha digitável e Pix existem para serem COPIADOS. Um `<code>` que a pessoa
 *  seleciona à mão erra um dígito e o pagamento vai para outro lugar. */
function CampoCopiavel({ rotuloTexto, valor }: { rotuloTexto: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="em-copiavel">
      <span className="fraco">{rotuloTexto}</span>
      <code>{valor}</code>
      <button type="button" onClick={() => {
        void navigator.clipboard?.writeText(valor);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}>
        {/* O icone TROCA ao copiar, e nao so o texto: e a confirmacao que se ve
            sem ler, e ela importa aqui porque o que foi copiado e uma linha
            digitavel — quem cola sem ter certeza paga o valor errado. */}
        <Icone nome={copiado ? 'ok' : 'copiar'} tamanho={14} peso="bold" />
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
