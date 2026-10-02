// DESPESAS — a aba «Lançamentos» da planilha `G3Solar_Financeiro.xlsx`.
//
// POR QUE ESTA TELA EXISTE: até 02/10/2026 a G3 controlava o que a EMPRESA paga
// (aluguel, contador, software, impostos) numa planilha de 500 linhas, e o
// sistema só sabia dos repasses do rateio. Aqui cada linha da planilha vira um
// título: lança, classifica, dá baixa, repete. A pergunta da tela é «o que eu
// pago hoje» — por isso ela abre no que está A PAGAR, com o vencido primeiro.
//
// O QUE MUDOU EM RELAÇÃO À PLANILHA, e nada disso muda o número:
//   - a série (recorrente ou parcelada) é ligada pelo sistema, e não pelo texto
//     do histórico — «Lançar o próximo» copia o último título num clique;
//   - a baixa pergunta «quanto saiu do banco» e, se diferir do saldo, o que é a
//     diferença (juros/multa, desconto ou só uma parte);
//   - nada se apaga: cancela-se, e a despesa com pagamento não cancela.
//
// As contas (situação, prazo, série) moram em `despesas-regras.ts`, com suíte.

import { useId, useState, type ReactNode } from 'react';
import {
  api, type CadastrosDaEmpresa, type Despesa, type ListaDeDespesas, type RecorrenciaDaDespesa,
  type NaturezaDaDespesa,
} from '../api.ts';
import { useAcao, useDados, type Acao } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, CampoData, Escolha, Marca, Icone, Carregando, Busca, Ferramentas,
  Filtro, Menu, BotaoDeCriar, PainelDeCriar, BotaoDeIcone, Recolhido, linha,
} from '../ui.tsx';
import { PerguntaNaTela } from '../serie.tsx';
import { Ligacao } from '../rota.tsx';
import { emReais, paraCentavos, centavosParaCampo } from '../dinheiro.ts';
import { diaEmBr, mesPorExtenso, mesEmBr } from '../formato.ts';
import { ROTULO_DA_FORMA, type FormaDePagamento } from '../contas-regras.ts';
import {
  situacao, saldo, diasAte, mesDe, dia, textoDaSerie, pagoEmCaixa, ajusteDasBaixas, saidaDoPagamento,
  seriesQueProjetam, decomporBaixa, ROTULO_DA_SITUACAO_DA_DESPESA, ROTULO_DA_RECORRENCIA, ROTULO_DA_NATUREZA,
  INTERVALO_EM_MESES, type SerieQueProjeta, type MotivoDaDiferenca,
} from '../despesas-regras.ts';
import { SELO_DA_DESPESA } from '../tom-do-estado.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo, type Coluna } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';

/** O recorte da lista. «A pagar» é o padrão: é o que pede alguém hoje. */
type Vista = 'a_pagar' | 'vencidas' | 'semana' | 'mes' | 'pagas' | 'todas';

const ROTULO_DA_VISTA: Record<Vista, string> = {
  a_pagar: 'A pagar', vencidas: 'Vencidas', semana: 'Vencem em 7 dias', mes: 'Vencem este mês',
  pagas: 'Pagas', todas: 'Todas',
};

const OPCOES_DE_FORMA = (Object.keys(ROTULO_DA_FORMA) as FormaDePagamento[])
  .map((valor) => ({ valor, texto: ROTULO_DA_FORMA[valor] }));
const OPCOES_DE_NATUREZA = (Object.keys(ROTULO_DA_NATUREZA) as NaturezaDaDespesa[])
  .map((valor) => ({ valor, texto: ROTULO_DA_NATUREZA[valor] }));

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** «há 3 dias», «hoje», «em 5 dias», «paga em 12/10». */
function fraseDoPrazo(d: Despesa, hoje: string): string {
  if (d.status === 'cancelada') return 'cancelada';
  if (d.status === 'paga') {
    const ultimo = d.pagamento[d.pagamento.length - 1];
    return ultimo ? `paga em ${diaEmBr(ultimo.data_pagamento)}` : 'paga';
  }
  const n = diasAte(d.vencimento, hoje);
  if (n === 0) return 'vence hoje';
  return n < 0 ? `há ${plural(-n, 'dia', 'dias')}` : `em ${plural(n, 'dia', 'dias')}`;
}

export function TelaDespesas() {
  const carga = useDados<ListaDeDespesas>(() => api.get('/despesas'));
  const cad = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const acao = useAcao();

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Despesa | null>(null);
  const [vista, setVista] = useState<Vista>('a_pagar');
  const [plano, setPlano] = useState('');
  const [mes, setMes] = useState('');
  const [busca, setBusca] = useState('');

  const dados = carga.dado;
  const hoje = dados?.hoje ?? '';
  const todas = dados?.linhas ?? [];
  const categorias = cad.dado?.categorias ?? [];
  const origens = cad.dado?.origens ?? [];
  const nomeDoPlano = new Map(categorias.map((c) => [c.id, c.nome]));
  const nomeDaOrigem = new Map(origens.map((o) => [o.id, o.nome]));

  /* O molde de cada série: só o ÚLTIMO título dela oferece «Lançar o próximo». */
  const moldes = new Map<string, SerieQueProjeta>();
  for (const s of seriesQueProjetam(todas)) moldes.set(s.molde.id, s);

  const naVista = (d: Despesa): boolean => {
    const sit = situacao(d, hoje);
    switch (vista) {
      case 'a_pagar': return sit === 'vencida' || sit === 'vence_hoje' || sit === 'a_vencer';
      case 'vencidas': return sit === 'vencida';
      case 'semana': { const n = diasAte(d.vencimento, hoje); return sit !== 'paga' && sit !== 'cancelada' && n >= 0 && n <= 7; }
      case 'mes': return sit !== 'cancelada' && mesDe(d.vencimento) === mesDe(hoje);
      case 'pagas': return sit === 'paga';
      case 'todas': return true;
    }
  };
  const termo = busca.trim().toLowerCase();
  const visiveis = todas
    .filter((d) => naVista(d)
      && (!plano || (plano === '-' ? !d.categoria_id : d.categoria_id === plano))
      && (!mes || mesDe(d.vencimento) === mes)
      && (!termo || [d.descricao, d.beneficiario_nome, d.numero_documento].some((t) => t?.toLowerCase().includes(termo))))
    .sort((a, b) => (vista === 'pagas' ? -1 : 1) * dia(a.vencimento).localeCompare(dia(b.vencimento)));

  const contar = (v: Vista) => {
    const ls = todas.filter((d) => filtroDaVista(v, d, hoje));
    return { n: ls.length, centavos: ls.reduce((s, d) => s + saldo(d), 0) };
  };
  const atalhos = dados ? (['vencidas', 'semana', 'mes'] as const).map((v) => ({ v, ...contar(v) })) : [];
  const mesesComTitulo = [...new Set(todas.map((d) => mesDe(d.vencimento)))].sort();

  const recarregar = () => { carga.recarregar(); };

  const COLUNAS: Coluna<Despesa>[] = [
    { titulo: 'Historico', de: (d) => d.descricao },
    { titulo: 'Fornecedor / credor', de: (d) => d.beneficiario_nome ?? '' },
    { titulo: 'Plano de contas', de: (d) => (d.categoria_id ? nomeDoPlano.get(d.categoria_id) ?? '' : '') },
    { titulo: 'Tipo de despesa', de: (d) => (d.natureza ? ROTULO_DA_NATUREZA[d.natureza] : '') },
    { titulo: 'Recorrencia', de: (d) => ROTULO_DA_RECORRENCIA[d.recorrencia ?? 'avulsa'] },
    { titulo: 'Parcela', de: (d) => (d.parcela_numero ? `${d.parcela_numero}/${d.parcela_total}` : '') },
    { titulo: 'Competencia', de: (d) => mesEmBr(d.competencia) },
    { titulo: 'Vencimento', de: (d) => dia(d.vencimento) },
    { titulo: 'Valor original R$', de: (d) => reaisParaPlanilha(d.valor_centavos) },
    { titulo: 'Data de pagamento', de: (d) => (d.pagamento.length ? dia(d.pagamento[d.pagamento.length - 1]!.data_pagamento) : '') },
    { titulo: 'Valor pago R$', de: (d) => (d.pagamento.length ? reaisParaPlanilha(pagoEmCaixa(d)) : '') },
    { titulo: 'Acrescimos/descontos R$', de: (d) => (d.pagamento.length ? reaisParaPlanilha(ajusteDasBaixas(d)) : '') },
    { titulo: 'Situacao', de: (d) => ROTULO_DA_SITUACAO_DA_DESPESA[situacao(d, hoje)] },
    { titulo: 'Forma de pagamento', de: (d) => (d.forma_prevista ? ROTULO_DA_FORMA[d.forma_prevista] : '') },
    { titulo: 'Conta / origem', de: (d) => (d.origem_pagamento_id ? nomeDaOrigem.get(d.origem_pagamento_id) ?? '' : '') },
    { titulo: 'Numero do documento', de: (d) => d.numero_documento ?? '' },
    { titulo: 'Comprovante', de: (d) => d.comprovante_url ?? '' },
    { titulo: 'Observacoes', de: (d) => d.observacao ?? '' },
    { titulo: 'Recorrente ate', de: (d) => (d.recorrente_ate ? mesEmBr(d.recorrente_ate) : '') },
  ];

  return (
    <Pagina titulo="Despesas"
            sub="O que a empresa paga: lance, dê baixa e repita, como na planilha de lançamentos."
            acao={
              <BotaoDeCriar controla="nova-despesa" aberto={criando} ao={() => { setEditando(null); setCriando(!criando); }}>
                Nova despesa
              </BotaoDeCriar>
            }>
      {carga.erro && (
        <Aviso tipo="erro">
          Não foi possível ler as despesas: {carga.erro}. Os números abaixo não estão zerados — estão
          {' '}<strong>desconhecidos</strong>.
        </Aviso>
      )}
      {carga.carregando && <Carregando texto="Lendo as despesas…" />}
      <RetornoDoAto texto={acao.sucesso} />

      {(criando || editando) && (
        <FormularioDeDespesa key={editando?.id ?? 'nova'} despesa={editando} hoje={hoje} cadastros={cad.dado}
                             acao={acao}
                             aoFechar={() => { setCriando(false); setEditando(null); }}
                             aoSalvar={() => { setCriando(false); setEditando(null); recarregar(); }} />
      )}

      {dados && cad.dado && categorias.length === 0 && (
        <Aviso tipo="alerta">
          O plano de contas está vazio, e sem ele o Painel mostra tudo numa linha só.
          {' '}<Ligacao para="/plano-de-contas">Começar com o plano da planilha</Ligacao>.
        </Aviso>
      )}

      {dados && todas.length > 0 && (
        <div className="dp-atalhos" role="group" aria-label="Atalhos da lista">
          {atalhos.map((a) => (
            <button key={a.v} type="button" className={`dp-atalho dp-${a.v}`} aria-pressed={vista === a.v}
                    onClick={() => setVista(vista === a.v ? 'a_pagar' : a.v)}>
              <span className="dp-atalho-nome">{ROTULO_DA_VISTA[a.v]}</span>
              <span className="dp-atalho-valor">{emReais(a.centavos)}</span>
              <span className="dp-atalho-conta">{plural(a.n, 'título', 'títulos')}</span>
            </button>
          ))}
        </div>
      )}

      {dados && (
        <Ferramentas contagem={`${plural(visiveis.length, 'despesa', 'despesas')}${dados.total > todas.length ? ` (mostrando ${todas.length} de ${dados.total})` : ''}`}>
          <Filtro rotulo="Mostrar" valor={vista} ao={(v) => setVista(v as Vista)}
                  opcoes={(Object.keys(ROTULO_DA_VISTA) as Vista[]).map((valor) => ({ valor, texto: ROTULO_DA_VISTA[valor] }))} />
          <Escolha rotuloAcessivel="Mês do vencimento" valor={mes} ao={setMes} primeira="Todos os meses"
                   opcoes={mesesComTitulo.map((m) => ({ valor: m, texto: mesPorExtenso(m) }))} />
          <Escolha rotuloAcessivel="Plano de contas" valor={plano} ao={setPlano} primeira="Todo o plano"
                   opcoes={[...categorias.map((c) => ({ valor: c.id, texto: c.nome })), { valor: '-', texto: 'Sem plano de contas' }]} />
          <Busca valor={busca} ao={setBusca} dica="Buscar histórico, fornecedor ou documento" />
          <button type="button" className="discreto" disabled={!visiveis.length}
                  onClick={() => baixarCsv(nomeDoArquivo('despesas'), paraCsv(COLUNAS, visiveis))}>
            <Icone nome="baixar" tamanho={15} /> Baixar CSV
          </button>
        </Ferramentas>
      )}

      {dados && (
        <Tabela cartoes="larga"
                cabecalho={<>
                  <th>Vencimento</th><th>Despesa</th><th>Plano de contas</th><th>Série</th>
                  <th className="num">Valor</th><th>Situação</th><th><span className="so-leitor">Ações</span></th>
                </>}
                vazio={todas.length === 0
                  ? <>Nenhuma despesa lançada ainda. Use <strong>Nova despesa</strong> — o aluguel da planilha é um bom primeiro.</>
                  : <>Nada em «{ROTULO_DA_VISTA[vista]}» com estes filtros.</>}>
          {visiveis.map((d) => (
            <LinhaDaDespesa key={d.id} d={d} hoje={hoje} plano={d.categoria_id ? nomeDoPlano.get(d.categoria_id) ?? null : null}
                            nomeDaOrigem={nomeDaOrigem} serie={moldes.get(d.id) ?? null} cadastros={cad.dado}
                            acao={acao} aoEditar={() => { setCriando(false); setEditando(d); }} aoMudar={recarregar} />
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}

function filtroDaVista(v: Vista, d: Despesa, hoje: string): boolean {
  const sit = situacao(d, hoje);
  if (v === 'vencidas') return sit === 'vencida';
  if (v === 'semana') { const n = diasAte(d.vencimento, hoje); return sit !== 'paga' && sit !== 'cancelada' && n >= 0 && n <= 7; }
  if (v === 'mes') return sit !== 'paga' && sit !== 'cancelada' && mesDe(d.vencimento) === mesDe(hoje);
  return false;
}

// ------------------------------------------------------ a linha

type Aberto = null | 'detalhe' | 'baixa' | 'proximo' | 'encerrar' | 'cancelar';

function LinhaDaDespesa(p: {
  d: Despesa; hoje: string; plano: string | null; nomeDaOrigem: Map<string, string>;
  serie: SerieQueProjeta | null; cadastros: CadastrosDaEmpresa | null; acao: Acao;
  aoEditar: () => void; aoMudar: () => void;
}) {
  const { d } = p;
  const [aberto, setAberto] = useState<Aberto>(null);
  const sit = situacao(d, p.hoje);
  const resta = saldo(d);
  const viva = sit !== 'cancelada';
  const periodica = viva && !!d.recorrencia && !!INTERVALO_EM_MESES[d.recorrencia];
  const serieTexto = textoDaSerie(d);
  const alternar = (a: Aberto) => setAberto(aberto === a ? null : a);

  async function cancelar() {
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${d.id}/cancelar`, {}));
    if (ok) { p.acao.anunciar(`«${d.descricao}» foi cancelada.`); setAberto(null); p.aoMudar(); }
  }

  const extra = (filho: ReactNode) => (
    <tr className="dp-extra"><td colSpan={7}>{filho}</td></tr>
  );

  return (
    <>
      <tr className={sit === 'cancelada' ? 'dp-cancelada' : undefined}>
        <td>
          {diaEmBr(d.vencimento)}
          <div className={`sub dp-prazo-${sit}`}>{fraseDoPrazo(d, p.hoje)}</div>
        </td>
        <td>
          <button type="button" className="discreto dp-nome" aria-expanded={aberto === 'detalhe'}
                  onClick={() => alternar('detalhe')}>
            {d.descricao}
          </button>
          <div className="sub">{d.beneficiario_nome}</div>
        </td>
        <td>{p.plano ?? <span className="sub">Sem plano</span>}</td>
        <td>{serieTexto ?? <span className="sub">Avulsa</span>}</td>
        <td className="num">
          {emReais(d.valor_centavos)}
          {d.status === 'parcial' && <div className="sub">falta {emReais(resta)}</div>}
        </td>
        <td><Marca selo={SELO_DA_DESPESA[sit]}>{ROTULO_DA_SITUACAO_DA_DESPESA[sit]}</Marca></td>
        <td className="dp-acoes">
          {viva && resta > 0 && (
            <button type="button" className={sit === 'vencida' || sit === 'vence_hoje' ? 'primario' : undefined}
                    aria-expanded={aberto === 'baixa'} onClick={() => alternar('baixa')}>
              Dar baixa
            </button>
          )}
          <Menu soIcone rotulo={`Mais ações de «${d.descricao}»`}
                gatilho={<Icone nome="mais_acoes" tamanho={18} peso="bold" />}>
            <button type="button" role="menuitem" onClick={() => alternar('detalhe')}>
              <Icone nome="abrir_linha" tamanho={16} /> {aberto === 'detalhe' ? 'Fechar o detalhe' : 'Ver o detalhe'}
            </button>
            {viva && (
              <button type="button" role="menuitem" onClick={p.aoEditar}>
                <Icone nome="alterou" tamanho={16} /> Editar…
              </button>
            )}
            {p.serie?.proximo_vencimento && (
              <button type="button" role="menuitem" onClick={() => alternar('proximo')}>
                <Icone nome="acrescentar" tamanho={16} /> Lançar o próximo ({diaEmBr(p.serie.proximo_vencimento)})…
              </button>
            )}
            {periodica && (
              <button type="button" role="menuitem" onClick={() => alternar('encerrar')}>
                <Icone nome="calendario" tamanho={16} /> {d.recorrente_ate ? 'Mudar o fim da recorrência…' : 'Encerrar a recorrência…'}
              </button>
            )}
            {viva && d.valor_pago_centavos === 0 && (
              <button type="button" role="menuitem" onClick={() => alternar('cancelar')}>
                <Icone nome="cancelado" tamanho={16} /> Cancelar…
              </button>
            )}
          </Menu>
        </td>
      </tr>

      {aberto === 'detalhe' && extra(<DetalheDaDespesa d={d} nomeDaOrigem={p.nomeDaOrigem} />)}
      {aberto === 'baixa' && extra(
        <FormularioDeBaixa d={d} hoje={p.hoje} cadastros={p.cadastros} acao={p.acao}
                           aoFechar={() => setAberto(null)} aoPagar={() => { setAberto(null); p.aoMudar(); }} />)}
      {aberto === 'proximo' && p.serie && extra(
        <FormularioDoProximo serie={p.serie} acao={p.acao}
                             aoFechar={() => setAberto(null)} aoLancar={() => { setAberto(null); p.aoMudar(); }} />)}
      {aberto === 'encerrar' && d.serie_id && extra(
        <FormularioDoFim d={d} acao={p.acao}
                         aoFechar={() => setAberto(null)} aoSalvar={() => { setAberto(null); p.aoMudar(); }} />)}
      {aberto === 'cancelar' && extra(
        <PerguntaNaTela rotulo={`Cancelar «${d.descricao}»`} manter="Manter a despesa" confirmar="Cancelar a despesa"
                        tom="perigo" ocupado={p.acao.ocupado} erro={p.acao.erro}
                        aoManter={() => setAberto(null)} aoConfirmar={cancelar}>
          A despesa sai do Painel e da Projeção e fica no histórico como cancelada. Nada é apagado.
          {d.serie_id && ' Os outros meses da série continuam como estão.'}
        </PerguntaNaTela>)}
    </>
  );
}

function DetalheDaDespesa({ d, nomeDaOrigem }: { d: Despesa; nomeDaOrigem: Map<string, string> }) {
  const item = (rotulo: string, valor: ReactNode) => (valor ? <><dt>{rotulo}</dt><dd>{valor}</dd></> : null);
  return (
    <div className="dp-detalhe">
      <dl>
        {item('Competência', mesPorExtenso(d.competencia))}
        {item('Tipo de despesa', d.natureza ? ROTULO_DA_NATUREZA[d.natureza] : null)}
        {item('Forma prevista', d.forma_prevista ? ROTULO_DA_FORMA[d.forma_prevista] : null)}
        {item('Sai de', d.origem_pagamento_id ? nomeDaOrigem.get(d.origem_pagamento_id) ?? null : null)}
        {item('Nº do documento', d.numero_documento)}
        {item('Comprovante', d.comprovante_url
          ? <a href={d.comprovante_url} target="_blank" rel="noreferrer noopener">Abrir o comprovante <Icone nome="abrir_externo" tamanho={13} /></a>
          : null)}
        {item('Recorrente até', d.recorrente_ate ? mesPorExtenso(d.recorrente_ate) : null)}
        {item('Observações', d.observacao)}
      </dl>
      {d.pagamento.length > 0 && (
        <table className="dp-pagamentos">
          <caption>Baixas</caption>
          <thead><tr><th>Data</th><th className="num">Abateu</th><th className="num">Juros/multa</th><th className="num">Desconto</th><th className="num">Saiu do banco</th><th>Forma</th><th>De</th></tr></thead>
          <tbody>
            {d.pagamento.map((x) => (
              <tr key={x.id}>
                <td>{diaEmBr(x.data_pagamento)}</td>
                <td className="num">{emReais(x.valor_centavos)}</td>
                <td className="num">{x.acrescimo_centavos ? emReais(x.acrescimo_centavos) : '—'}</td>
                <td className="num">{x.desconto_centavos ? emReais(x.desconto_centavos) : '—'}</td>
                <td className="num"><strong>{emReais(saidaDoPagamento(x))}</strong></td>
                <td>{ROTULO_DA_FORMA[x.forma] ?? x.forma}</td>
                <td>{x.origem_pagamento_id ? nomeDaOrigem.get(x.origem_pagamento_id) ?? '—' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------------------ a baixa

function FormularioDeBaixa(p: {
  d: Despesa; hoje: string; cadastros: CadastrosDaEmpresa | null; acao: Acao;
  aoFechar: () => void; aoPagar: () => void;
}) {
  const resta = saldo(p.d);
  const [saiu, setSaiu] = useState(centavosParaCampo(resta));
  const [data, setData] = useState(p.hoje);
  const [forma, setForma] = useState<string>(p.d.forma_prevista ?? 'pix');
  const [origem, setOrigem] = useState(p.d.origem_pagamento_id ?? '');
  const [motivo, setMotivo] = useState<MotivoDaDiferenca | ''>('');
  const [referencia, setReferencia] = useState('');

  let centavos: number | null = null;
  try { centavos = paraCentavos(saiu); } catch { centavos = null; }
  const baixa = centavos === null ? 'Escreva o valor como 1.234,56.' : decomporBaixa(resta, centavos, motivo || null);
  const futura = data > p.hoje;
  const origens = (p.cadastros?.origens ?? []).filter((o) => o.ativo || o.id === origem);

  async function pagar() {
    if (typeof baixa === 'string' || futura) return;
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${p.d.id}/pagamentos`, {
      data_pagamento: data, forma, origem_pagamento_id: origem || null,
      referencia_externa: referencia || null, ...baixa,
    }));
    if (ok) {
      p.acao.anunciar(`Baixa de ${emReais(centavos!)} em «${p.d.descricao}».`);
      p.aoPagar();
    }
  }

  return (
    <form className="dp-form" aria-label={`Dar baixa em «${p.d.descricao}»`}
          onSubmit={(e) => { e.preventDefault(); void pagar(); }}>
      <h3>Dar baixa — falta {emReais(resta)}</h3>
      <div className="dp-campos">
        <Campo rotulo="Quanto saiu do banco (R$)" valor={saiu} ao={setSaiu} />
        <Campo rotulo="Data do pagamento" tipo="date" valor={data} ao={setData}
               erro={futura ? 'A data não pode ser depois de hoje.' : null} />
        <Campo rotulo="Forma" valor={forma} ao={setForma} opcoes={OPCOES_DE_FORMA} />
        <Campo rotulo="Saiu de" valor={origem} ao={setOrigem}
               opcoes={origens.map((o) => ({ valor: o.id, texto: o.nome }))} />
        <Campo rotulo="Referência (opcional)" valor={referencia} ao={setReferencia} dica="nº do comprovante, end-to-end do Pix" />
      </div>
      {centavos !== null && centavos > 0 && centavos < resta && (
        <Campo rotulo="Saiu menos que o saldo. A diferença é:" valor={motivo} ao={(v) => setMotivo(v as MotivoDaDiferenca)}
               opcoes={[
                 { valor: 'desconto', texto: `Desconto de ${emReais(resta - centavos)} — a despesa fecha` },
                 { valor: 'parcial', texto: `Pagamento de uma parte — ficam ${emReais(resta - centavos)} em aberto` },
               ]} />
      )}
      {typeof baixa === 'object' && baixa.acrescimo_centavos > 0 && (
        <p className="sub">Os {emReais(baixa.acrescimo_centavos)} a mais ficam registrados como juros/multa.</p>
      )}
      {p.acao.erro && <Aviso tipo="erro">{p.acao.erro}</Aviso>}
      <div style={linha}>
        <button type="submit" className="primario" disabled={p.acao.ocupado || typeof baixa === 'string' || futura}>
          Registrar a baixa
        </button>
        <button type="button" className="discreto" onClick={p.aoFechar}>Fechar</button>
        {typeof baixa === 'string' && centavos !== null && <span className="sub">{baixa}</span>}
      </div>
    </form>
  );
}

/** O mês com o rótulo do `Campo` — a mesma marcação, para o rótulo nomear o campo. */
function CampoDeMes(p: { rotulo: string; valor: string; ao: (v: string) => void; vazio?: string }) {
  const id = useId();
  return (
    <div className="campo">
      <div className="campo-rotulo"><label htmlFor={id}>{p.rotulo}</label></div>
      <CampoData id={id} mes valor={p.valor} ao={p.ao} vazio={p.vazio} />
    </div>
  );
}

// ------------------------------------------------------ a série

function FormularioDoProximo(p: { serie: SerieQueProjeta; acao: Acao; aoFechar: () => void; aoLancar: () => void }) {
  const [valor, setValor] = useState(centavosParaCampo(p.serie.molde.valor_centavos));
  const [vencimento, setVencimento] = useState(p.serie.proximo_vencimento ?? '');

  async function lancar() {
    let centavos: number;
    try { centavos = paraCentavos(valor); } catch { return; }
    const ok = await p.acao.executar(() => api.post(`/despesas/series/${p.serie.serie_id}/proximo`, {
      valor_centavos: centavos, vencimento,
    }));
    if (ok) { p.acao.anunciar(`«${p.serie.molde.descricao}» de ${mesPorExtenso(p.serie.proxima_competencia)} foi lançada.`); p.aoLancar(); }
  }

  return (
    <form className="dp-form" onSubmit={(e) => { e.preventDefault(); void lancar(); }}
          aria-label={`Lançar o próximo de «${p.serie.molde.descricao}»`}>
      <h3>Lançar {mesPorExtenso(p.serie.proxima_competencia)}</h3>
      <p className="sub">Copia o último título da série; ajuste o valor se a conta variou.</p>
      <div className="dp-campos">
        <Campo rotulo="Valor (R$)" valor={valor} ao={setValor} />
        <Campo rotulo="Vencimento" tipo="date" valor={vencimento} ao={setVencimento} />
      </div>
      {p.acao.erro && <Aviso tipo="erro">{p.acao.erro}</Aviso>}
      <div style={linha}>
        <button type="submit" className="primario" disabled={p.acao.ocupado || !vencimento}>Lançar</button>
        <button type="button" className="discreto" onClick={p.aoFechar}>Fechar</button>
      </div>
    </form>
  );
}

function FormularioDoFim(p: { d: Despesa; acao: Acao; aoFechar: () => void; aoSalvar: () => void }) {
  const [ate, setAte] = useState(p.d.recorrente_ate ? mesDe(p.d.recorrente_ate) : mesDe(p.d.competencia));

  async function salvar(valor: string | null) {
    const ok = await p.acao.executar(() => api.post(`/despesas/series/${p.d.serie_id}/encerrar`, {
      ate: valor ? `${valor}-01` : null,
    }));
    if (ok) {
      p.acao.anunciar(valor ? `«${p.d.descricao}» repete até ${mesPorExtenso(valor)}.` : `«${p.d.descricao}» volta a repetir sem fim.`);
      p.aoSalvar();
    }
  }

  return (
    <form className="dp-form" onSubmit={(e) => { e.preventDefault(); void salvar(ate); }}
          aria-label={`Fim da recorrência de «${p.d.descricao}»`}>
      <h3>Até quando «{p.d.descricao}» se repete</h3>
      <p className="sub">O último mês em que a conta existe. A Projeção para de contar depois dele.</p>
      <div className="dp-campos">
        <CampoDeMes rotulo="Último mês" valor={ate} ao={setAte} />
      </div>
      {p.acao.erro && <Aviso tipo="erro">{p.acao.erro}</Aviso>}
      <div style={linha}>
        <button type="submit" className="primario" disabled={p.acao.ocupado || !ate}>Salvar o fim</button>
        {p.d.recorrente_ate && (
          <button type="button" disabled={p.acao.ocupado} onClick={() => void salvar(null)}>Repetir sem fim</button>
        )}
        <button type="button" className="discreto" onClick={p.aoFechar}>Fechar</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------ nova despesa e edição

type Repeticao = RecorrenciaDaDespesa;

function FormularioDeDespesa(p: {
  despesa: Despesa | null; hoje: string; cadastros: CadastrosDaEmpresa | null; acao: Acao;
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const e = p.despesa;
  const [f, setF] = useState({
    descricao: e?.descricao ?? '',
    fornecedor: e?.beneficiario_nome ?? '',
    categoria_id: e?.categoria_id ?? '',
    natureza: e?.natureza ?? '',
    valor: e ? centavosParaCampo(e.valor_centavos) : '',
    vencimento: e ? dia(e.vencimento) : '',
    competencia: e ? mesDe(e.competencia) : '',
    recorrencia: (e?.recorrencia ?? 'avulsa') as Repeticao,
    parcelas: '2',
    recorrente_ate: '',
    forma_prevista: e?.forma_prevista ?? '',
    origem_pagamento_id: e?.origem_pagamento_id ?? '',
    numero_documento: e?.numero_documento ?? '',
    comprovante_url: e?.comprovante_url ?? '',
    observacao: e?.observacao ?? '',
  });
  /* A competência acompanha o vencimento até alguém mexer nela — na planilha as
     duas quase sempre caem no mesmo mês. */
  const [competenciaTocada, setCompetenciaTocada] = useState(!!e);
  const campo = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const categorias = (p.cadastros?.categorias ?? []).filter((c) => c.ativo || c.id === f.categoria_id);
  const origens = (p.cadastros?.origens ?? []).filter((o) => o.ativo || o.id === f.origem_pagamento_id);
  const parcelada = f.recorrencia === 'parcelada';
  const periodica = !!INTERVALO_EM_MESES[f.recorrencia];

  let centavos: number | null = null;
  try { centavos = f.valor ? paraCentavos(f.valor) : null; } catch { centavos = null; }
  const nParcelas = Number(f.parcelas);
  const faltando = [
    !f.descricao.trim() && 'o histórico',
    !f.fornecedor.trim() && 'o fornecedor',
    (centavos === null || centavos <= 0) && 'o valor',
    !f.vencimento && 'o vencimento',
    !f.competencia && 'a competência',
    parcelada && !e && !(Number.isInteger(nParcelas) && nParcelas >= 2 && nParcelas <= 360) && 'o número de parcelas (2 a 360)',
  ].filter(Boolean) as string[];

  const opcoesDeRepeticao = (Object.keys(ROTULO_DA_RECORRENCIA) as Repeticao[])
    .filter((r) => !e || (e.recorrencia === 'parcelada' ? r === 'parcelada' : r !== 'parcelada'))
    .map((valor) => ({ valor, texto: ROTULO_DA_RECORRENCIA[valor] }));

  async function salvar() {
    if (faltando.length) return;
    const corpo = {
      descricao: f.descricao, fornecedor: f.fornecedor, valor_centavos: centavos,
      competencia: `${f.competencia}-01`, vencimento: f.vencimento,
      categoria_id: f.categoria_id || null, natureza: f.natureza || null,
      forma_prevista: f.forma_prevista || null, origem_pagamento_id: f.origem_pagamento_id || null,
      numero_documento: f.numero_documento, comprovante_url: f.comprovante_url, observacao: f.observacao,
      recorrencia: f.recorrencia,
    };
    const ok = await p.acao.executar(() => (e
      ? api.patch(`/despesas/${e.id}`, corpo)
      : api.post('/despesas', {
        ...corpo,
        parcelas: parcelada ? nParcelas : undefined,
        recorrente_ate: periodica && f.recorrente_ate ? `${f.recorrente_ate}-01` : null,
      })));
    if (ok) {
      p.acao.anunciar(e ? `«${f.descricao.trim()}» foi atualizada.`
        : parcelada ? `«${f.descricao.trim()}» entrou em ${nParcelas} parcelas.`
        : `«${f.descricao.trim()}» entrou.`);
      p.aoSalvar();
    }
  }

  return (
    <PainelDeCriar id="nova-despesa" titulo={e ? `Editar «${e.descricao}»` : 'Nova despesa'} aoFechar={p.aoFechar}>
      <form className="dp-nova" onSubmit={(ev) => { ev.preventDefault(); void salvar(); }}>
        <fieldset>
          <legend>O quê</legend>
          <div className="dp-campos">
            <Campo rotulo="Histórico" valor={f.descricao} ao={campo('descricao')} dica="Aluguel da sala comercial" />
            <Campo rotulo="Fornecedor ou credor" valor={f.fornecedor} ao={campo('fornecedor')} dica="A quem se paga" />
            <Campo rotulo="Plano de contas" valor={f.categoria_id} ao={campo('categoria_id')}
                   opcoes={categorias.map((c) => ({ valor: c.id, texto: c.nome }))} />
            <Campo rotulo="Tipo de despesa" valor={f.natureza} ao={campo('natureza')}
                   opcoes={OPCOES_DE_NATUREZA} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Quando e quanto</legend>
          <div className="dp-campos">
            <Campo rotulo={parcelada && !e ? 'Valor de cada parcela (R$)' : 'Valor (R$)'} valor={f.valor} ao={campo('valor')}
                   dica="0,00" />
            <Campo rotulo={parcelada && !e ? 'Vencimento da 1ª parcela' : 'Vencimento'} tipo="date" valor={f.vencimento}
                   ao={(v) => setF((x) => ({ ...x, vencimento: v, competencia: competenciaTocada || !v ? x.competencia : v.slice(0, 7) }))} />
            <CampoDeMes rotulo="Competência" valor={f.competencia}
                        ao={(v) => { setCompetenciaTocada(true); campo('competencia')(v); }} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Repetição</legend>
          <div className="dp-campos">
            <Campo rotulo="Recorrência" valor={f.recorrencia} ao={campo('recorrencia')} opcoes={opcoesDeRepeticao} />
            {parcelada && !e && (
              <Campo rotulo="Número de parcelas" valor={f.parcelas} ao={campo('parcelas')} teclado={{ inputMode: 'numeric' }} />
            )}
            {periodica && !e && (
              <CampoDeMes rotulo="Repete até (opcional)" valor={f.recorrente_ate} ao={campo('recorrente_ate')} vazio="sem fim" />
            )}
          </div>
          <p className="sub">
            {parcelada && !e && centavos && Number.isInteger(nParcelas) && nParcelas >= 2
              ? `Entram ${nParcelas} títulos de ${emReais(centavos)}, um por mês — ${emReais(centavos * nParcelas)} ao todo.`
              : periodica ? 'Entra este mês; os próximos aparecem na Projeção e entram com «Lançar o próximo».'
              : f.recorrencia === 'avulsa' ? 'Um título só.' : ''}
          </p>
        </fieldset>

        <Recolhido lembrar="despesas.mais-detalhes" titulo="Mais detalhes" resumo="Forma, origem, documento e comprovante">
          <div className="dp-campos">
            <Campo rotulo="Forma de pagamento prevista" valor={f.forma_prevista} ao={campo('forma_prevista')}
                   opcoes={OPCOES_DE_FORMA} />
            <Campo rotulo="Sai de" valor={f.origem_pagamento_id} ao={campo('origem_pagamento_id')}
                   opcoes={origens.map((o) => ({ valor: o.id, texto: o.nome }))} />
            <Campo rotulo="Nº do documento (NF, boleto)" valor={f.numero_documento} ao={campo('numero_documento')} />
            <Campo rotulo="Link do comprovante" valor={f.comprovante_url} ao={campo('comprovante_url')} dica="https://…" />
            <Campo rotulo="Observações" valor={f.observacao} ao={campo('observacao')} />
          </div>
        </Recolhido>

        {p.acao.erro && <Aviso tipo="erro">{p.acao.erro}</Aviso>}
        <div style={linha}>
          <button type="submit" className="primario" disabled={p.acao.ocupado || faltando.length > 0}>
            {e ? 'Salvar a despesa' : parcelada ? 'Lançar as parcelas' : 'Lançar a despesa'}
          </button>
          <button type="button" className="discreto" onClick={p.aoFechar}>Cancelar</button>
          {faltando.length > 0 && <span className="sub">Falta {faltando.join(', ')}.</span>}
        </div>
      </form>
    </PainelDeCriar>
  );
}
