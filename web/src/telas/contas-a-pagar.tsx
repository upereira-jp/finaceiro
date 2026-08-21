// CONTAS A PAGAR — a vertente da EMPRESA (PRD §4.4), na fatia que tinha prazo.
//
// POR QUE ESTA TELA EXISTE, e a razão está numa data e não numa preferência. Até
// 03/08/2026 o sistema sabia ao centavo QUANTO devia ao dono da usina e ao
// originador — os relatórios já respondiam isso — e **não tinha onde registrar
// que pagou**. Extrato de apuração, não de quitação, e nada impedia pagar duas
// vezes o mesmo repasse. `Q-PAGAMENTO-01`.
//
// A JANELA fechava na primeira liquidação, enquanto `split_item` tem 0 linhas.
//
// O VAZIO AQUI TEM SIGNIFICADO PRECISO, e não é "erro" — é a mesma distinção que
// a tela de Relatórios faz: as contas de repasse e comissão **nascem do split**,
// e o split só roda quando uma fatura é liquidada (PRD §5.2). Com 0 faturas em
// produção, a lista vazia é o estado CERTO. A tela diz isso.
//
// O QUE ELA NÃO OFERECE, e a ausência é a regra: **não há botão de criar repasse
// ou comissão**. Esses nascem do split e só de lá — um segundo caminho
// provisionaria a mesma despesa duas vezes ao mesmo beneficiário, e as duas se
// somariam sem ninguém notar. O formulário cria `outro`, e só.
//
// E O PAPEL `cobrança` NÃO ENTRA AQUI. A matriz do PRD §3 lhe dá traço na coluna
// Corporativo, e a rota responde 403 — não é defeito, é a coluna funcionando.

import { useState } from 'react';
import { api } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Icone,
  Carregando, AjudaDoMes, CampoData, useOrdenacao, ordenar, contem,
} from '../ui.tsx';
import { emReais, paraCentavos, competenciaISO } from '../dinheiro.ts';
import {
  saldoCentavos, nomeDoBeneficiario, estaAtrasada,
  podePagar, podeCancelar, podeCriar,
  ROTULO_DO_STATUS, ROTULO_DA_FORMA, ROTULO_DO_BENEFICIARIO,
  type ContaAPagar, type FormaDePagamento,
} from '../contas-regras.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo, type Coluna } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';

type ResumoLinha = {
  tipo: string; beneficiario: string; titulos: number;
  devido_centavos: number; pago_centavos: number; saldo_centavos: number; atrasados: number;
};

type ItemSemConta = {
  split_item_id: string; tipo: string; valor_centavos: number; competencia: string;
};

/* Os tres tons da `Marca` sao os da PRONTIDAO (`ok`/`pendente`/`nao_medido`), e
 * as quatro situacoes cabem neles: paga e `ok`, aberta e parcial sao `pendente`
 * (ha trabalho a fazer), cancelada e `nao_medido` - nao e boa nem ma, saiu da
 * conta. O icone e quem separa cancelada de aberta, pela mesma razao que
 * `ICONE_DO_STATUS_DA_FATURA` existe. */
const TOM: Record<ContaAPagar['status'], 'ok' | 'pendente' | 'nao_medido'> = {
  aberta: 'pendente', parcial: 'pendente', paga: 'ok', cancelada: 'nao_medido',
};

export function TelaContasAPagar() {
  const contas = useDados<ContaAPagar[]>(() => api.get('/contas-a-pagar'));
  const resumo = useDados<ResumoLinha[]>(() => api.get('/contas-a-pagar/resumo'));
  const semProvisao = useDados<ItemSemConta[]>(() => api.get('/contas-a-pagar/sem-provisao'));
  const acao = useAcao();

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const { ordem, alternar } = useOrdenacao('vencimento');

  /*
   * `hoje` é calculado UMA vez por render e passado às funções puras, em vez de
   * cada uma chamar `new Date()`. Duas leituras do relógio na mesma tela podem
   * cair em dias diferentes à meia-noite, e a lista mostraria uma conta atrasada
   * na coluna e não-atrasada no total.
   */
  const hoje = new Date();

  const todas = contas.dado ?? [];
  const visiveis = ordenar(
    todas.filter((c) =>
      (contem(c.descricao, busca) || contem(nomeDoBeneficiario(c), busca))
      && (!situacao || c.status === situacao)),
    ordem,
    {
      vencimento: (c) => c.vencimento,
      beneficiario: (c) => nomeDoBeneficiario(c),
      descricao: (c) => c.descricao,
      valor: (c) => c.valor_centavos,
      saldo: (c) => saldoCentavos(c),
      situacao: (c) => c.status,
    },
  );

  const emAberto = todas.filter((c) => c.status === 'aberta' || c.status === 'parcial');
  const totalSaldo = emAberto.reduce((a, c) => a + saldoCentavos(c), 0);
  const atrasadas = emAberto.filter((c) => estaAtrasada(c, hoje));
  const totalAtrasado = atrasadas.reduce((a, c) => a + saldoCentavos(c), 0);

  const COLUNAS: Coluna<ContaAPagar>[] = [
    { titulo: 'Vencimento', de: (c) => String(c.vencimento).slice(0, 10) },
    { titulo: 'Mes de referencia', de: (c) => String(c.competencia).slice(0, 7) },
    { titulo: 'Beneficiario', de: (c) => nomeDoBeneficiario(c) },
    { titulo: 'Tipo', de: (c) => ROTULO_DO_BENEFICIARIO[c.beneficiario_tipo] },
    { titulo: 'Descricao', de: (c) => c.descricao },
    { titulo: 'Valor R$', de: (c) => reaisParaPlanilha(c.valor_centavos) },
    { titulo: 'Pago R$', de: (c) => reaisParaPlanilha(c.valor_pago_centavos) },
    { titulo: 'Saldo R$', de: (c) => reaisParaPlanilha(saldoCentavos(c)) },
    { titulo: 'Situacao', de: (c) => ROTULO_DO_STATUS[c.status] },
    { titulo: 'Origem', de: (c) => (c.origem_split_item_id ? 'automática' : 'manual') },
  ];

  return (
    <Pagina titulo="Contas a pagar"
            sub="O que a empresa deve — a parte do dono da usina, a comissão de quem trouxe o cliente, a concessionária e despesas avulsas. A parte do dono e a comissão nascem sozinhas quando um cliente paga.">

      {/*
        * A CONFERÊNCIA ENTRE APURAÇÃO E QUITAÇÃO, e ela vem ANTES da lista de
        * propósito: um `split_item` sem conta a pagar é dinheiro apurado que
        * ninguém vai pagar, e isso não aparece em nenhuma outra tela. Lista
        * vazia é o estado correto, então o aviso só existe quando há buraco.
        */}
      {(semProvisao.dado?.length ?? 0) > 0 && (
        <Aviso tipo="erro">
          {semProvisao.dado!.length} valor(es) já apurado(s) que não viraram conta a pagar. É
          dinheiro que alguém tem a receber e que ninguém vai pagar sem ajuste — normalmente de
          pagamentos registrados antes de 03/08/2026. Somam:{' '}
          <strong>{emReais(semProvisao.dado!.reduce((a, i) => a + i.valor_centavos, 0))}</strong>.
        </Aviso>
      )}

      {atrasadas.length > 0 && (
        <Aviso tipo="alerta">
          {atrasadas.length} conta(s) vencida(s), somando <strong>{emReais(totalAtrasado)}</strong>.
        </Aviso>
      )}

      {/* ------------------------------------------------ o resumo por quem recebe */}
      <div className="cartao secao">
        <h3 style={{ marginTop: 0 }}>
          <Icone nome="contas_a_pagar" tamanho={17} /> A pagar, por beneficiário
        </h3>
        {resumo.carregando ? <Carregando /> : resumo.erro ? (
          <Aviso tipo="erro">Não foi possível ler o resumo: {resumo.erro}</Aviso>
        ) : (resumo.dado?.length ?? 0) === 0 ? (
          <p className="nota">
            Nada a pagar. A parte do dono da usina e a comissão só nascem quando um cliente paga —
            com nenhuma cobrança paga ainda, este vazio é o esperado, e não um erro.
          </p>
        ) : (
          <Tabela cabecalho={<><th>Beneficiário</th><th>Tipo</th><th className="num">Títulos</th>
                              <th className="num">Devido</th><th className="num">Pago</th>
                              <th className="num">Saldo</th><th className="num">Vencidos</th></>}>
            {resumo.dado!.map((r, i) => (
              <tr key={`${r.tipo}-${r.beneficiario}-${i}`}>
                <td><strong>{r.beneficiario}</strong></td>
                <td>{ROTULO_DO_BENEFICIARIO[r.tipo as ContaAPagar['beneficiario_tipo']] ?? r.tipo}</td>
                <td className="num">{r.titulos}</td>
                <td className="num">{emReais(r.devido_centavos)}</td>
                <td className="num">{emReais(r.pago_centavos)}</td>
                <td className="num"><strong>{emReais(r.saldo_centavos)}</strong></td>
                <td className="num">{r.atrasados > 0
                  ? <Marca tom="pendente" icone="aviso_erro">{r.atrasados}</Marca>
                  : <span className="nota">—</span>}</td>
              </tr>
            ))}
          </Tabela>
        )}
      </div>

      <FormularioDeConta acao={acao} aoCriar={() => { contas.recarregar(); resumo.recarregar(); }} />

      {/* ------------------------------------------------------------ a lista */}
      <Ferramentas contagem={`${visiveis.length} de ${todas.length} · saldo em aberto ${emReais(totalSaldo)}`}>
        <Busca valor={busca} ao={setBusca} dica="beneficiário ou descrição" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Situação" opcoes={[
          { valor: '', texto: 'Todas as situações' },
          { valor: 'aberta', texto: ROTULO_DO_STATUS.aberta },
          { valor: 'parcial', texto: ROTULO_DO_STATUS.parcial },
          { valor: 'paga', texto: ROTULO_DO_STATUS.paga },
          { valor: 'cancelada', texto: ROTULO_DO_STATUS.cancelada },
        ]} />
        <button disabled={visiveis.length === 0}
                onClick={() => baixarCsv(nomeDoArquivo('contas-a-pagar'), paraCsv(COLUNAS, visiveis))}>
          <Icone nome="baixar" tamanho={15} /> CSV
        </button>
      </Ferramentas>

      {contas.carregando ? <Carregando /> : contas.erro ? (
        <Aviso tipo="erro">Não foi possível ler as contas a pagar: {contas.erro}</Aviso>
      ) : (
        <Tabela vazio={todas.length === 0
                  ? 'Nenhuma conta a pagar. As de repasse e comissão aparecem quando a primeira fatura for liquidada.'
                  : 'Nenhuma conta com esses filtros.'}
                cabecalho={<>
                  <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                  <ThOrd chave="beneficiario" ordem={ordem} ao={alternar}>Beneficiário</ThOrd>
                  <ThOrd chave="descricao" ordem={ordem} ao={alternar}>Descrição</ThOrd>
                  <ThOrd chave="valor" ordem={ordem} ao={alternar} num>Valor</ThOrd>
                  <ThOrd chave="saldo" ordem={ordem} ao={alternar} num>Saldo</ThOrd>
                  <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                  <th>Ações</th>
                </>}>
          {visiveis.map((c) => (
            <LinhaDeConta key={c.id} conta={c} hoje={hoje} acao={acao}
                          aoMudar={() => { contas.recarregar(); resumo.recarregar(); }} />
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}

// ---------------------------------------------------------------- a linha

function LinhaDeConta(p: {
  conta: ContaAPagar; hoje: Date;
  acao: ReturnType<typeof useAcao>; aoMudar: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const c = p.conta;
  const atrasada = estaAtrasada(c, p.hoje);
  const cancelar = podeCancelar(c);

  async function confirmarCancelamento() {
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${c.id}/cancelar`, {}));
    if (ok) { p.acao.anunciar('Conta cancelada.'); p.aoMudar(); }
  }

  return (
    <>
      <tr>
        <td>
          {String(c.vencimento).slice(0, 10).split('-').reverse().join('/')}
          {atrasada && <> <Marca tom="pendente" icone="aviso_erro">vencida</Marca></>}
        </td>
        <td>
          <strong>{nomeDoBeneficiario(c)}</strong>
          <div className="nota">{ROTULO_DO_BENEFICIARIO[c.beneficiario_tipo]}</div>
        </td>
        <td>
          {c.descricao}
          {/* De onde a conta veio importa: a que nasceu do split tem valor
              IMUTÁVEL (PRD §4.4), e quem olha precisa saber por que não há
              como editá-la. */}
          <div className="nota">{c.origem_split_item_id ? 'nascida do split' : 'lançada à mão'}</div>
        </td>
        <td className="num">{emReais(c.valor_centavos)}</td>
        <td className="num"><strong>{emReais(saldoCentavos(c))}</strong></td>
        <td><Marca tom={TOM[c.status]}
                     icone={c.status === 'paga' ? 'aviso_ok'
                            : c.status === 'cancelada' ? 'nao' : 'aviso_alerta'}>
          {ROTULO_DO_STATUS[c.status]}
        </Marca></td>
        <td>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={c.status === 'paga' || c.status === 'cancelada'}
                    onClick={() => setAbrindo(!abrindo)}>
              <Icone nome="confirmar" tamanho={15} /> Pagar
            </button>
            <button disabled={!cancelar.pode} title={cancelar.pode ? undefined : cancelar.porque}
                    onClick={confirmarCancelamento}>
              <Icone nome="remover" tamanho={15} />
            </button>
          </div>
        </td>
      </tr>
      {abrindo && (
        <tr>
          <td colSpan={7}>
            <FormularioDePagamento conta={c} acao={p.acao}
                                   aoPagar={() => { setAbrindo(false); p.aoMudar(); }} />
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------ o pagamento

function FormularioDePagamento(p: {
  conta: ContaAPagar; acao: ReturnType<typeof useAcao>; aoPagar: () => void;
}) {
  const saldo = saldoCentavos(p.conta);
  /* O campo já vem com o SALDO, não com o valor da conta: numa conta parcial,
     preencher o valor cheio produziria uma tentativa que o servidor recusa. */
  const [valor, setValor] = useState(String(saldo / 100).replace('.', ','));
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [forma, setForma] = useState<FormaDePagamento>('pix');
  const [ref, setRef] = useState('');
  const [obs, setObs] = useState('');

  let centavos = 0;
  let erroDoValor: string | null = null;
  try { centavos = paraCentavos(valor); } catch (e) { erroDoValor = (e as Error).message; }

  const trava = erroDoValor ? { pode: false as const, porque: erroDoValor } : podePagar(p.conta, centavos);

  async function pagar() {
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${p.conta.id}/pagamentos`, {
      data_pagamento: data, valor_centavos: centavos, forma,
      referencia_externa: ref.trim() || null, observacao: obs.trim() || null,
    }));
    if (ok) { p.acao.anunciar('Pagamento registrado.'); p.aoPagar(); }
  }

  return (
    <div className="cartao" style={{ margin: 0 }}>
      <h4 style={{ marginTop: 0 }}>Registrar pagamento — saldo {emReais(saldo)}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Campo rotulo="Valor (R$)" valor={valor} ao={setValor} dica="0,00" />
        <Campo rotulo="Data do pagamento" valor={data} ao={setData} tipo="date" />
        <Campo rotulo="Forma" valor={forma} ao={(v) => setForma(v as FormaDePagamento)}
               opcoes={Object.entries(ROTULO_DA_FORMA).map(([valor, texto]) => ({ valor, texto }))} />
        <Campo rotulo="Referência (end-to-end, comprovante)" valor={ref} ao={setRef}
               dica="opcional — mas única quando informada" />
        <Campo rotulo="Observação" valor={obs} ao={setObs} dica="opcional" />
      </div>
      {!trava.pode && <p className="nota" style={{ marginBottom: 0 }}>{trava.porque}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="primario" disabled={!trava.pode} onClick={pagar}>
          <Icone nome="confirmar" tamanho={15} /> Registrar pagamento
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------- a conta lançada à mão

function FormularioDeConta(p: { acao: ReturnType<typeof useAcao>; aoCriar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({
    descricao: '', beneficiario_nome: '', valor: '', competencia: '', vencimento: '',
  });
  const campo = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  let centavos = 0;
  try { centavos = paraCentavos(f.valor); } catch { centavos = 0; }

  const trava = podeCriar({
    descricao: f.descricao, beneficiario_nome: f.beneficiario_nome, valorCentavos: centavos,
    competencia: f.competencia, vencimento: f.vencimento,
  });

  async function criar() {
    const ok = await p.acao.executar(() => api.post('/contas-a-pagar', {
      descricao: f.descricao.trim(), beneficiario_nome: f.beneficiario_nome.trim(),
      valor_centavos: centavos,
      competencia: competenciaISO(f.competencia),
      vencimento: f.vencimento,
    }));
    if (ok) {
      setF({ descricao: '', beneficiario_nome: '', valor: '', competencia: '', vencimento: '' });
      p.acao.anunciar('Conta a pagar lançada.');
      p.aoCriar();
    }
  }

  if (!aberto) {
    return (
      <div className="secao">
        <button onClick={() => setAberto(true)}>
          <Icone nome="acrescentar" tamanho={15} /> Lançar uma conta à mão
        </button>
      </div>
    );
  }

  return (
    <div className="cartao secao">
      <h3 style={{ marginTop: 0 }}>Lançar conta a pagar</h3>
      {/* A frase existe porque a ausência do caminho é a regra, e ausência não
          se explica sozinha — quem procurar "lançar um repasse" precisa achar
          por que não há. */}
      <p className="nota">
        Para despesa avulsa — aluguel, serviço, imposto. <strong>Repasse e comissão não se lançam
        aqui:</strong> nascem do split, na baixa da fatura, e um segundo caminho provisionaria a
        mesma despesa duas vezes ao mesmo beneficiário.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Campo rotulo="Descrição" valor={f.descricao} ao={campo('descricao')} dica="Aluguel do escritório" />
        <Campo rotulo="Quem recebe" valor={f.beneficiario_nome} ao={campo('beneficiario_nome')} />
        <Campo rotulo="Valor (R$)" valor={f.valor} ao={campo('valor')} dica="0,00" />
        <div>
          <label>Mês de referência</label>
          <CampoData mes valor={f.competencia} ao={campo('competencia')} rotuloAcessivel="Mês de referência" />
          <AjudaDoMes />
        </div>
        <Campo rotulo="Vencimento" valor={f.vencimento} ao={campo('vencimento')} tipo="date" />
      </div>
      {!trava.pode && <p className="nota" style={{ marginBottom: 0 }}>{trava.porque}</p>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className="primario" disabled={!trava.pode} onClick={criar}>
          <Icone nome="confirmar" tamanho={15} /> Lançar
        </button>
        <button onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </div>
  );
}
