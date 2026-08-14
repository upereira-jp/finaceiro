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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  api, CAMPOS_DA_FATURA_VAZIOS, PARAMETROS_PADRAO, BOLETO_LIDO_VAZIO,
  type CamposDaFatura, type ParametrosDaEmissao, type BoletoLido,
  type ComposicaoUnificada, type LinhaDetalhada,
} from '../api.ts';
import { Aviso, Campo, Icone } from '../ui.tsx';
import { escalaDaPrevia, regraDaPagina, PX_POR_MM } from '../layout-regras.ts';
import { useLargura } from '../medir-largura.ts';

/** `setState` sem depender do namespace `React` — o transform novo nao o poe em escopo. */
type Ajustar<T> = (f: (anterior: T) => T) => void;

/* ------------------------------------------------------------------ ajudas */

/** O arquivo em base64, sem o prefixo `data:`. A rota o remove de novo, e os dois
 *  fazem certo — mandar o prefixo custaria uma ida ao servidor para descobrir. */
function lerBase64(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => erro(new Error('não foi possível ler o arquivo'));
    r.readAsDataURL(f);
  });
}

/** O mime do arquivo, com o fallback pelo nome — o navegador as vezes nao o da. */
const mimeDo = (f: File): string =>
  f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/jpeg');

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

const naMensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ------------------------------------------------------------------- a tela */

type Aba = 'leitura' | 'emissao';

/**
 * `cadastro` e `emissaoExtra` sao pedacos que a ABA HOSPEDA, e nao esta tela.
 *
 * A referencia e de um tenant so e por isso tem logo, emissor e chave Pix no
 * codigo. Aqui isso e cadastro por tenant, e ele mora em `documento.tsx` com o
 * estado e as rotas que ja o salvam. Passar como `children` em vez de reimplantar
 * evita a segunda copia dos quatro cartoes - o mesmo motivo de a caixa de
 * pagamento reusar `.faixa-pgto`.
 */
export function FaturaUnificada({ logoUrl, cadastro, emissaoExtra }: {
  logoUrl: string | null;
  cadastro?: ReactNode;
  emissaoExtra?: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>('leitura');
  const [campos, setCampos] = useState<CamposDaFatura>(CAMPOS_DA_FATURA_VAZIOS);
  const [parametros, setParametros] = useState<ParametrosDaEmissao>(PARAMETROS_PADRAO);
  const [boleto, setBoleto] = useState<BoletoLido>(BOLETO_LIDO_VAZIO);

  const [composicao, setComposicao] = useState<ComposicaoUnificada | null>(null);
  const [erroDaComposicao, setErroDaComposicao] = useState<string | null>(null);

  const [statusFatura, setStatusFatura] = useState('Nenhum arquivo enviado.');
  const [statusBoleto, setStatusBoleto] = useState('Nenhum boleto enviado.');
  const [lendoFatura, setLendoFatura] = useState(false);
  const [lendoBoleto, setLendoBoleto] = useState(false);

  /* A composicao pedida ao servidor. `pedido` cresce a cada chamada e a resposta
   * so e aceita se for a do ULTIMO pedido: sem isso, uma resposta lenta de uma
   * edicao antiga sobrescreve a nova, e a tela mostra o valor de duas teclas
   * atras. E o modo de falha classico de composicao remota por digitacao. */
  const pedido = useRef(0);
  const compor = useCallback(async (
    c: CamposDaFatura, p: ParametrosDaEmissao, b: BoletoLido,
  ) => {
    const meu = ++pedido.current;
    try {
      const r = await api.post<ComposicaoUnificada>('/faturas/unificada/compor', {
        campos: c, parametros: p,
        boleto: {
          linha_digitavel: b.linha_digitavel, pix_copia_e_cola: b.pix_copia_e_cola,
          nosso_numero: b.nosso_numero, instrucoes: b.instrucoes,
        },
      });
      if (meu !== pedido.current) return;
      setComposicao(r); setErroDaComposicao(null);
    } catch (e) {
      if (meu !== pedido.current) return;
      setErroDaComposicao(naMensagem(e));
    }
  }, []);

  const comporComAtraso = useAtraso(compor, 400);
  useEffect(() => { comporComAtraso(campos, parametros, boleto); },
            [campos, parametros, boleto, comporComAtraso]);

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

  function novaFatura() {
    if (!window.confirm('Começar uma nova fatura? Os dados em edição serão apagados.')) return;
    setCampos(CAMPOS_DA_FATURA_VAZIOS);
    setBoleto(BOLETO_LIDO_VAZIO);
    setParametros(PARAMETROS_PADRAO);
    setComposicao(null);
    setStatusFatura('Nenhum arquivo enviado.');
    setStatusBoleto('Nenhum boleto enviado.');
    setAba('leitura');
    window.scrollTo(0, 0);
  }

  return (
    <>
      <div className="fu-abas naoimprime">
        <button className={aba === 'leitura' ? 'fu-aba ativa' : 'fu-aba'}
                onClick={() => setAba('leitura')}>1 · Leitura e cálculo</button>
        <span className="fu-aba-traco" />
        <button className={aba === 'emissao' ? 'fu-aba ativa' : 'fu-aba'}
                onClick={() => { setAba('emissao'); window.scrollTo(0, 0); }}>2 · Emissão</button>
        <span style={{ flex: 1 }} />
        <button className="fu-aba" onClick={novaFatura}>Nova fatura</button>
      </div>

      {erroDaComposicao && (
        <div className="naoimprime"><Aviso tipo="erro">
          Não foi possível compor a fatura: {erroDaComposicao}
        </Aviso></div>
      )}

      {aba === 'leitura'
        ? (
          <>
            <AbaDeLeitura
              campos={campos} mudar={mudar} setCampos={setCampos}
              parametros={parametros} setParametros={setParametros}
              boleto={boleto} setBoleto={setBoleto}
              composicao={composicao}
              statusFatura={statusFatura} statusBoleto={statusBoleto}
              lendoFatura={lendoFatura} lendoBoleto={lendoBoleto}
              enviarFatura={enviarFatura} enviarBoleto={enviarBoleto}
              irParaEmissao={() => { setAba('emissao'); window.scrollTo(0, 0); }}
            />
            {cadastro}
          </>
        )
        : (
          <>
            <AbaDeEmissao composicao={composicao} logoUrl={logoUrl} />
            {emissaoExtra}
          </>
        )}
    </>
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
  composicao: ComposicaoUnificada | null;
  statusFatura: string; statusBoleto: string;
  lendoFatura: boolean; lendoBoleto: boolean;
  enviarFatura: (f: File) => void; enviarBoleto: (f: File) => void;
  irParaEmissao: () => void;
};

function AbaDeLeitura(p: PropsDeLeitura) {
  const c = p.composicao?.conta;

  /*
   * A CONFERENCIA DO BOLETO CONTRA A FATURA. Sao as mesmas tres perguntas que a
   * referencia faz — vencimento, valor e beneficiario —, e a comparacao de VALOR
   * usa o total que o SERVIDOR compos, nao um total recalculado aqui.
   */
  const alertas = useMemo(() => {
    const a: string[] = [];
    const vb = p.boleto.vencimento.trim(), vf = p.campos.vencimento.trim();
    if (vb && vf && vb !== vf) {
      a.push(`Vencimento divergente: o boleto vence em ${vb}, a fatura em ${vf}.`);
    }
    if (p.boleto.valor.trim() && c) {
      const doBoleto = Math.round(Number(p.boleto.valor.replace(',', '.')) * 100);
      if (Number.isFinite(doBoleto) && Math.abs(doBoleto - c.total_centavos) > 1) {
        a.push(`Valor divergente: o boleto é de R$ ${p.boleto.valor} e o cálculo desta fatura `
             + `dá ${(c.total_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
      }
    }
    const ben = p.boleto.beneficiario.trim();
    if (ben && !/g3/i.test(ben)) {
      a.push(`Beneficiário lido não menciona a G3: "${ben}". Confira se o boleto é o correto.`);
    }
    if (c?.residuo_discorda) {
      a.push('O "outros encargos" lido no PDF não bate com o resíduo da conta — '
           + 'alguma das parcelas da Equatorial pode ter sido lida errado.');
    }
    return a;
  }, [p.boleto, p.campos.vencimento, c]);

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

  const semTarifa = Boolean(p.campos.energia_compensada_kwh.trim())
                 && !p.campos.tarifa_kwh.trim();

  return (
    <div className="fu-grade naoimprime">
      <div className="fu-coluna">
        {/* --------------------------------------------- o PDF da Equatorial */}
        <div className="cartao">
          <div className="fu-rotulo">Fatura da Equatorial Goiás</div>
          <label className="fu-solta">
            <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                   disabled={p.lendoFatura}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) p.enviarFatura(f); }} />
            <div className="fu-solta-titulo">Enviar fatura da distribuidora</div>
            <div className="fu-solta-sub">PDF ou foto/scan — os dados são extraídos e preenchidos ao lado</div>
          </label>
          <div className="fu-status">{p.statusFatura}</div>
        </div>

        {/* ------------------------------------------ o boleto a gerar */}
        <div className="fu-painel">
          <div className="fu-painel-rot">Boleto a gerar no banco</div>
          <div className="fu-painel-total">
            {p.composicao?.folha1.total.valor ?? 'R$ 0,00'}
          </div>
          <div className="fu-painel-sub">
            Vencimento {p.campos.vencimento || '—'} · UC {p.campos.unidade_consumidora || '—'}
          </div>
          <div className="fu-painel-par">
            <div>
              <div className="fu-painel-cap">Energia G3 (com desconto)</div>
              <div className="fu-painel-val">{brl(c?.energia_g3_centavos)}</div>
            </div>
            <div>
              <div className="fu-painel-cap">Repasses Equatorial</div>
              <div className="fu-painel-val">{brl(c?.total_equatorial_centavos)}</div>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------- o boleto */}
        <div className="cartao">
          <div className="fu-rotulo">Boleto Sicoob</div>
          <label className="fu-solta">
            <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                   disabled={p.lendoBoleto}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) p.enviarBoleto(f); }} />
            <div className="fu-solta-titulo">Enviar boleto do banco</div>
            <div className="fu-solta-sub">PDF ou foto — linha digitável e PIX são lidos do arquivo</div>
          </label>
          <div className="fu-status">{p.statusBoleto}</div>

          <div className="fu-secao">
            <div className="fu-rotulo">Conferência do boleto</div>
            {alertas.map((a) => <div key={a} className="fu-alerta">{a}</div>)}
            {alertas.length === 0 && <div className="fu-status">Nada a apontar.</div>}

            <div className="campos">
              <Campo rotulo="Vencimento no boleto" valor={p.boleto.vencimento}
                     ao={(v) => p.setBoleto((s) => ({ ...s, vencimento: v }))} dica="DD/MM/AAAA" />
              <Campo rotulo="Valor no boleto" valor={p.boleto.valor}
                     ao={(v) => p.setBoleto((s) => ({ ...s, valor: v }))} dica="0,00" />
              <Campo rotulo="Nosso número" valor={p.boleto.nosso_numero}
                     ao={(v) => p.setBoleto((s) => ({ ...s, nosso_numero: v }))} dica="1-3" />
            </div>
            <div className="fu-status">Beneficiário lido: {p.boleto.beneficiario || '—'}</div>

            <div className="fu-rotulo" style={{ marginTop: 14 }}>Instruções do boleto</div>
            <textarea className="fu-area" rows={4} value={p.boleto.instrucoes.join('\n')}
                      placeholder="Uma por linha"
                      onChange={(e) => p.setBoleto((s) => ({
                        ...s, instrucoes: e.target.value.split('\n'),
                      }))} />

            <div className="fu-rotulo" style={{ marginTop: 14 }}>Linha digitável</div>
            <textarea className="fu-area mono" rows={2} value={p.boleto.linha_digitavel}
                      placeholder="47 dígitos"
                      onChange={(e) => p.setBoleto((s) => ({ ...s, linha_digitavel: e.target.value }))} />
            <StatusDaLinha
              digitos={p.boleto.linha_digitavel.replace(/\D/g, '')}
              motivo={p.composicao?.folha2.pagamento.barras_motivo ?? null}
              desenhou={Boolean(p.composicao?.folha2.pagamento.barras)} />

            <div className="fu-rotulo" style={{ marginTop: 14 }}>PIX copia e cola</div>
            <textarea className="fu-area mono" rows={3} value={p.boleto.pix_copia_e_cola}
                      placeholder="00020101…"
                      onChange={(e) => p.setBoleto((s) => ({
                        ...s, pix_copia_e_cola: e.target.value.replace(/\s+/g, ''),
                      }))} />
            <div className="fu-status">
              {p.composicao?.folha2.pagamento.qr
                ? `Payload EMV reconhecido · QR gerado (versão ${p.composicao.folha2.pagamento.qr.versao}).`
                : p.composicao?.folha2.pagamento.qr_motivo
                  ? `O QR não pôde ser desenhado: ${p.composicao.folha2.pagamento.qr_motivo}`
                  : 'Sem PIX — o documento sai apenas com boleto.'}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- parâmetros */}
        <div className="cartao">
          <div className="fu-rotulo">Parâmetros</div>
          <div className="campos">
            <Campo rotulo="Desconto (%)" valor={p.parametros.percentual_desconto}
                   ao={(v) => p.setParametros((s) => ({ ...s, percentual_desconto: v }))} />
            <Campo rotulo="Fator CO₂ (kg/kWh)" valor={p.parametros.fator_emissao}
                   ao={(v) => p.setParametros((s) => ({ ...s, fator_emissao: v }))} />
          </div>
          <p className="sub" style={{ marginBottom: 0 }}>
            Fator médio da margem de operação do SIN — MCTI/SIRENE.
          </p>
        </div>
      </div>

      {/* --------------------------------------------- conferência dos dados */}
      <div className="cartao">
        <div className="fu-cabeca">
          <h2 style={{ margin: 0 }}>Conferência dos dados</h2>
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

        {semTarifa && (
          <div className="fu-alerta" style={{ marginTop: 16 }}>
            Esta fatura não tem consumo não compensado — informe a tarifa manualmente.
            Sem ela, os três cartões e o detalhamento não saem na folha.
          </div>
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

        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button className="primario" onClick={p.irParaEmissao} disabled={!p.composicao}>
            <Icone nome="imprimir" tamanho={15} peso="bold" /> Ver a fatura do cliente
          </button>
        </div>
      </div>
    </div>
  );
}

/** R$ a partir de centavos. SO PARA O PAINEL da aba 1, e so quando o servidor
 *  ainda nao respondeu — o que sai na folha vem dele, ja formatado. */
function brl(centavos: number | undefined): string {
  if (centavos === undefined) return 'R$ 0,00';
  const neg = centavos < 0, a = Math.abs(centavos);
  const s = String(a).padStart(3, '0');
  const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}R$ ${int},${s.slice(-2)}`;
}

function StatusDaLinha({ digitos, motivo, desenhou }: {
  digitos: string; motivo: string | null; desenhou: boolean;
}) {
  if (desenhou) {
    return <div className="fu-status ok">Linha válida · dígitos verificadores conferidos · código de barras gerado.</div>;
  }
  if (digitos.length === 0) {
    return <div className="fu-status">Cole a linha digitável de 47 dígitos gerada no banco.</div>;
  }
  return <div className="fu-status alerta">{motivo ?? 'A linha não confere.'} O campo é editável: corrija a partir do boleto.</div>;
}

/* ============================================================ aba 2: emissão */

function AbaDeEmissao({ composicao, logoUrl }: {
  composicao: ComposicaoUnificada | null; logoUrl: string | null;
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
      <div className="fu-barra naoimprime">
        <span className="fraco">Fatura {numero_da_fatura}</span>
        <button className="primario" onClick={() => window.print()}>
          <Icone nome="imprimir" tamanho={15} peso="bold" /> Imprimir fatura
        </button>
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
                {logoUrl && <img src={logoUrl} alt="" />}
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
              <svg viewBox="0 0 24 24" fill="none" stroke="#14213D" strokeWidth="1.3"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.6L21.4 20H2.6L12 3.6z" />
                <path d="M12 9.6v4.6" /><path d="M12 17.1h.01" />
              </svg>
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
              {logoUrl && <img src={logoUrl} alt="" />}
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
        {logoUrl && <img src={logoUrl} alt="" style={{ height: '10pt' }} />}
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
