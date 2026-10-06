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
// EM 06/10/2026 (etapa 1 do controle total, migration 44) entrou o que a
// auditoria da planilha achou faltando, e o chão dos cartões e das pessoas:
//   - o FORNECEDOR do cadastro (ou só o nome, ou nada, como a planilha), com o
//     plano e o centro de costume preenchidos ao escolher, e «Cadastrar» na hora;
//   - o CENTRO DE CUSTO e o plano em dois níveis (grupo › subcategoria);
//   - o COMPROVANTE COMO ARQUIVO (PDF ou foto), ao lançar ou na linha;
//   - «DESFAZER A BAIXA» — na planilha era apagar a data e o valor pagos; aqui a
//     baixa errada fica marcada, com o motivo, e a despesa volta a aberta;
//   - o PARCELAMENTO JÁ EM ANDAMENTO («estou na 4ª de 10»);
//   - o Nº DO LANÇAMENTO (a coluna A), os FILTROS de todas as colunas da planilha,
//     a busca nas observações e a ORDEM por coluna.
//
// As contas (situação, prazo, série, filtros, ordem, CSV) moram em
// `despesas-regras.ts`, com suíte.

import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  api, type CadastrosDaEmpresa, type Despesa, type ListaDeDespesas, type RecorrenciaDaDespesa,
  type NaturezaDaDespesa, type ResumoDoFornecedor, type Fornecedor, type PagamentoDaDespesa,
} from '../api.ts';
import { useAcao, useDados, type Acao } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, CampoData, Escolha, Marca, Icone, Carregando, Busca, Ferramentas,
  Filtro, Menu, BotaoDeCriar, PainelDeCriar, Recolhido, ThOrd, useOrdenacao, linha, DIRECOES_DA_SITUACAO,
} from '../ui.tsx';
import { PerguntaNaTela } from '../serie.tsx';
import { Ligacao } from '../rota.tsx';
import { emReais, paraCentavos, centavosParaCampo } from '../dinheiro.ts';
import { diaEmBr, mesPorExtenso, momentoEmBr } from '../formato.ts';
import { ROTULO_DA_FORMA, type FormaDePagamento } from '../contas-regras.ts';
import {
  situacao, saldo, diasAte, mesDe, dia, textoDaSerie, saidaDoPagamento, seriesQueProjetam, decomporBaixa,
  devidoAosSocios, ehReembolso, baixasVivas, nomeNoPlano, filtrarDespesas, ordenarDespesas, colunasDoCsvDeDespesas,
  ROTULO_DA_SITUACAO_DA_DESPESA, ROTULO_DA_RECORRENCIA, ROTULO_DA_NATUREZA, ROTULO_DA_VISTA, INTERVALO_EM_MESES,
  type SerieQueProjeta, type MotivoDaDiferenca, type Vista, type FiltroDeDespesas, type OrdemDeDespesas,
} from '../despesas-regras.ts';
import { SELO_DA_DESPESA } from '../tom-do-estado.ts';
import { paraCsv, nomeDoArquivo } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';
import { anexarArquivo, abrirAnexo, tamanhoEmBr, TIPOS_DO_ANEXO } from '../anexo-arquivo.ts';
import { opcoesDoPlano } from './fornecedores.tsx';

const OPCOES_DE_FORMA = (Object.keys(ROTULO_DA_FORMA) as FormaDePagamento[])
  .map((valor) => ({ valor, texto: ROTULO_DA_FORMA[valor] }));
const OPCOES_DE_NATUREZA = (Object.keys(ROTULO_DA_NATUREZA) as NaturezaDaDespesa[])
  .map((valor) => ({ valor, texto: ROTULO_DA_NATUREZA[valor] }));

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** «há 3 dias», «hoje», «em 5 dias», «paga em 12/10». */
function fraseDoPrazo(d: Despesa, hoje: string): string {
  if (d.status === 'cancelada') return 'cancelada';
  if (d.status === 'paga') {
    const ultimo = baixasVivas(d).at(-1);
    return ultimo ? `paga em ${diaEmBr(ultimo.data_pagamento)}` : 'paga';
  }
  if (ehReembolso(d)) return 'pago do bolso do sócio';
  const n = diasAte(d.vencimento, hoje);
  if (n === 0) return 'vence hoje';
  return n < 0 ? `há ${plural(-n, 'dia', 'dias')}` : `em ${plural(n, 'dia', 'dias')}`;
}

/** Os filtros que ficam atrás de «Filtros», com o rótulo de cada um (para o chip «N filtros»). */
const FILTROS_EXTRAS = ['competencia', 'natureza', 'recorrencia', 'forma', 'origem', 'fornecedor', 'centro'] as const;
type FiltroExtra = typeof FILTROS_EXTRAS[number];

export function TelaDespesas() {
  const carga = useDados<ListaDeDespesas>(() => api.get('/despesas'));
  const cad = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const forn = useDados<ResumoDoFornecedor[]>(() => api.get('/fornecedores'));
  const acao = useAcao();

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Despesa | null>(null);
  /* `?vista=socios` é o link do Painel («Reembolsar em Despesas»); `?fornecedor=`
     é o da ficha do fornecedor («Ver todas em Despesas»). */
  const [filtro, setFiltro] = useState<FiltroDeDespesas>(() => {
    const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
    const v = q.get('vista');
    const fornecedor = q.get('fornecedor') ?? '';
    return {
      vista: v && v in ROTULO_DA_VISTA ? (v as Vista) : fornecedor ? 'todas' : 'a_pagar',
      mes: '', plano: '', busca: '', fornecedor,
    };
  });
  const [maisFiltros, setMaisFiltros] = useState(() => !!filtro.fornecedor);
  const { ordem, alternar } = useOrdenacao('vencimento');
  const muda = <K extends keyof FiltroDeDespesas>(k: K) => (v: FiltroDeDespesas[K]) => setFiltro((f) => ({ ...f, [k]: v }));

  const dados = carga.dado;
  const hoje = dados?.hoje ?? '';
  const todas = dados?.linhas ?? [];
  const categorias = cad.dado?.categorias ?? [];
  const origens = cad.dado?.origens ?? [];
  const centros = cad.dado?.centros ?? [];
  const fornecedores = forn.dado ?? [];
  const nomeDaOrigem = new Map(origens.map((o) => [o.id, o.nome]));
  const nomeDoCentro = new Map(centros.map((c) => [c.id, c.nome]));
  const planoDe = (id: string | null) => nomeNoPlano(id, categorias) ?? '';

  /* O molde de cada série: só o ÚLTIMO título dela oferece «Lançar o próximo». */
  const moldes = new Map<string, SerieQueProjeta>();
  for (const s of seriesQueProjetam(todas)) moldes.set(s.molde.id, s);

  /* «Pagas» abre do pagamento mais recente para trás, como abria antes da ordem por coluna. */
  const sentido = (ordem.desc !== (filtro.vista === 'pagas' && ordem.chave === 'vencimento')) ? 'desc' : 'asc';
  const visiveis = ordenarDespesas(filtrarDespesas(todas, filtro, hoje, categorias), ordem.chave as OrdemDeDespesas, sentido, hoje, planoDe);

  const contar = (v: Vista) => {
    const ls = todas.filter((d) => filtroDaVista(v, d, hoje));
    return { n: ls.length, centavos: ls.reduce((s, d) => s + saldo(d), 0) };
  };
  const devido = devidoAosSocios(todas);
  const atalhos = dados
    ? [...(['vencidas', 'semana', 'mes'] as const).map((v) => ({ v: v as Vista, ...contar(v) })),
       ...(devido.total > 0 ? [{ v: 'socios' as Vista, n: devido.socios.reduce((s, x) => s + x.titulos, 0), centavos: devido.total }] : [])]
    : [];
  const mesesDoVencimento = [...new Set(todas.map((d) => mesDe(d.vencimento)))].sort();
  const mesesDaCompetencia = [...new Set(todas.map((d) => mesDe(d.competencia)))].sort();
  const extrasLigados = FILTROS_EXTRAS.filter((k) => !!filtro[k]).length;

  const recarregar = () => { carga.recarregar(); forn.recarregar(); };
  const colunasCsv = colunasDoCsvDeDespesas({
    plano: planoDe,
    origem: (id) => (id ? nomeDaOrigem.get(id) ?? '' : ''),
    centro: (id) => (id ? nomeDoCentro.get(id) ?? '' : ''),
  }, hoje);

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
                             fornecedores={fornecedores} acao={acao}
                             aoFechar={() => { setCriando(false); setEditando(null); }}
                             aoSalvar={() => { setCriando(false); setEditando(null); recarregar(); }}
                             aoCadastrarFornecedor={forn.recarregar} />
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
            <button key={a.v} type="button" className={`dp-atalho dp-${a.v}`} aria-pressed={filtro.vista === a.v}
                    onClick={() => muda('vista')(filtro.vista === a.v ? 'a_pagar' : a.v)}>
              <span className="dp-atalho-nome">{ROTULO_DA_VISTA[a.v]}</span>
              <span className="dp-atalho-valor">{emReais(a.centavos)}</span>
              <span className="dp-atalho-conta">{plural(a.n, 'título', 'títulos')}</span>
            </button>
          ))}
        </div>
      )}

      {dados && (
        <Ferramentas contagem={`${plural(visiveis.length, 'despesa', 'despesas')}${dados.total > todas.length ? ` (mostrando ${todas.length} de ${dados.total})` : ''}`}>
          <Filtro rotulo="Mostrar" valor={filtro.vista} ao={(v) => muda('vista')(v as Vista)}
                  opcoes={(Object.keys(ROTULO_DA_VISTA) as Vista[]).map((valor) => ({ valor, texto: ROTULO_DA_VISTA[valor] }))} />
          <Escolha rotuloAcessivel="Mês do vencimento" valor={filtro.mes ?? ''} ao={muda('mes')} primeira="Todos os meses"
                   opcoes={mesesDoVencimento.map((m) => ({ valor: m, texto: mesPorExtenso(m) }))} />
          <Escolha rotuloAcessivel="Plano de contas" valor={filtro.plano ?? ''} ao={muda('plano')} primeira="Todo o plano"
                   opcoes={[...opcoesDoPlano(cad.dado), { valor: '-', texto: 'Sem plano de contas' }]} />
          <Busca valor={filtro.busca ?? ''} ao={muda('busca')} dica="Buscar histórico, fornecedor, observação ou nº" />
          <button type="button" className="discreto" aria-expanded={maisFiltros} aria-controls="dp-mais-filtros"
                  onClick={() => setMaisFiltros(!maisFiltros)}>
            <Icone nome="abrir_menu" tamanho={13} /> Filtros{extrasLigados ? ` (${extrasLigados})` : ''}
          </button>
          <button type="button" className="discreto" disabled={!visiveis.length}
                  onClick={() => baixarCsv(nomeDoArquivo('despesas'), paraCsv(colunasCsv, visiveis))}>
            <Icone nome="baixar" tamanho={15} /> Baixar CSV
          </button>
        </Ferramentas>
      )}

      {dados && maisFiltros && (
        <div className="dp-filtros" id="dp-mais-filtros" role="group" aria-label="Mais filtros">
          <CampoDeFiltro rotulo="Competência" valor={filtro.competencia} ao={muda('competencia')} primeira="Todas"
                         opcoes={mesesDaCompetencia.map((m) => ({ valor: m, texto: mesPorExtenso(m) }))} />
          <CampoDeFiltro rotulo="Tipo de despesa" valor={filtro.natureza} ao={muda('natureza')} primeira="Todos"
                         opcoes={[...OPCOES_DE_NATUREZA, { valor: '-', texto: 'Sem tipo' }]} />
          <CampoDeFiltro rotulo="Recorrência" valor={filtro.recorrencia} ao={muda('recorrencia')} primeira="Todas"
                         opcoes={(Object.keys(ROTULO_DA_RECORRENCIA) as RecorrenciaDaDespesa[]).map((valor) => ({ valor, texto: ROTULO_DA_RECORRENCIA[valor] }))} />
          <CampoDeFiltro rotulo="Forma prevista" valor={filtro.forma} ao={muda('forma')} primeira="Todas" opcoes={OPCOES_DE_FORMA} />
          <CampoDeFiltro rotulo="Sai de" valor={filtro.origem} ao={muda('origem')} primeira="Todas"
                         opcoes={[...origens.map((o) => ({ valor: o.id, texto: o.nome })), { valor: '-', texto: 'Sem origem' }]} />
          <CampoDeFiltro rotulo="Fornecedor" valor={filtro.fornecedor} ao={muda('fornecedor')} primeira="Todos"
                         opcoes={[...fornecedores.map((f) => ({ valor: f.id, texto: f.nome })), { valor: '-', texto: 'Sem fornecedor do cadastro' }]} />
          <CampoDeFiltro rotulo="Centro de custo" valor={filtro.centro} ao={muda('centro')} primeira="Todos"
                         opcoes={[...centros.map((c) => ({ valor: c.id, texto: c.nome })), { valor: '-', texto: 'Sem centro' }]} />
          {extrasLigados > 0 && (
            <button type="button" className="discreto dp-limpar"
                    onClick={() => setFiltro((f) => ({ ...f, ...Object.fromEntries(FILTROS_EXTRAS.map((k) => [k, ''])) }))}>
              <Icone nome="limpar" tamanho={14} /> Limpar estes filtros
            </button>
          )}
        </div>
      )}

      {dados && (
        <Tabela cartoes="larga"
                cabecalho={<>
                  <ThOrd chave="numero" ordem={ordem} ao={alternar} num>Nº</ThOrd>
                  <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                  <ThOrd chave="descricao" ordem={ordem} ao={alternar}>Despesa</ThOrd>
                  <ThOrd chave="plano" ordem={ordem} ao={alternar}>Plano de contas</ThOrd>
                  <th>Série</th>
                  <ThOrd chave="valor" ordem={ordem} ao={alternar} num>Valor</ThOrd>
                  <ThOrd chave="situacao" ordem={ordem} ao={alternar} direcoes={DIRECOES_DA_SITUACAO}>Situação</ThOrd>
                  <th><span className="so-leitor">Ações</span></th>
                </>}
                vazio={todas.length === 0
                  ? <>Nenhuma despesa lançada ainda. Use <strong>Nova despesa</strong> — o aluguel da planilha é um bom primeiro.</>
                  : <>Nada em «{ROTULO_DA_VISTA[filtro.vista]}» com estes filtros.</>}>
          {visiveis.map((d) => (
            <LinhaDaDespesa key={d.id} d={d} hoje={hoje} categorias={categorias}
                            nomeDaOrigem={nomeDaOrigem} nomeDoCentro={nomeDoCentro} serie={moldes.get(d.id) ?? null}
                            cadastros={cad.dado} acao={acao}
                            aoEditar={() => { setCriando(false); setEditando(d); }} aoMudar={recarregar} />
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}

/** Um filtro com rótulo visível (os de «Filtros» não têm a lista em volta para se explicar). */
function CampoDeFiltro(p: {
  rotulo: string; valor: string | undefined; ao: (v: string) => void; primeira: string;
  opcoes: Array<{ valor: string; texto: string }>;
}) {
  const id = useId();
  return (
    <div className="campo">
      <div className="campo-rotulo"><label htmlFor={id}>{p.rotulo}</label></div>
      <Escolha id={id} valor={p.valor ?? ''} ao={p.ao} primeira={p.primeira} opcoes={p.opcoes} />
    </div>
  );
}

/** Os atalhos contam DESPESA: a dívida com o sócio tem o atalho dela. */
function filtroDaVista(v: Vista, d: Despesa, hoje: string): boolean {
  const sit = situacao(d, hoje);
  if (v === 'vencidas') return sit === 'vencida';
  if (v === 'semana') { const n = diasAte(d.vencimento, hoje); return (sit === 'vence_hoje' || sit === 'a_vencer') && n <= 7; }
  if (v === 'mes') return (sit === 'vencida' || sit === 'vence_hoje' || sit === 'a_vencer') && mesDe(d.vencimento) === mesDe(hoje);
  return false;
}

// ------------------------------------------------------ a linha

type Aberto = null | 'detalhe' | 'baixa' | 'proximo' | 'encerrar' | 'cancelar' | 'desfazer';

function LinhaDaDespesa(p: {
  d: Despesa; hoje: string; categorias: CadastrosDaEmpresa['categorias'];
  nomeDaOrigem: Map<string, string>; nomeDoCentro: Map<string, string>;
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
  const vivas = baixasVivas(d);
  const anexos = d.anexo ?? [];
  const alternar = (a: Aberto) => setAberto(aberto === a ? null : a);
  const cat = p.categorias.find((c) => c.id === d.categoria_id) ?? null;
  const grupo = cat?.pai_id ? p.categorias.find((c) => c.id === cat.pai_id) ?? null : null;

  async function cancelar() {
    const ok = await p.acao.executar(() => api.post(`/contas-a-pagar/${d.id}/cancelar`, {}));
    if (ok) { p.acao.anunciar(`«${d.descricao}» foi cancelada.`); setAberto(null); p.aoMudar(); }
  }

  const extra = (filho: ReactNode) => (
    <tr className="dp-extra"><td colSpan={8}>{filho}</td></tr>
  );

  return (
    <>
      <tr className={sit === 'cancelada' ? 'dp-cancelada' : undefined}>
        <td className="num dp-numero">{d.numero ?? '—'}</td>
        <td>
          {diaEmBr(d.vencimento)}
          <div className={`sub dp-prazo-${sit}`}>{fraseDoPrazo(d, p.hoje)}</div>
        </td>
        <td>
          <button type="button" className="discreto dp-nome" aria-expanded={aberto === 'detalhe'}
                  onClick={() => alternar('detalhe')}>
            {d.descricao}
          </button>
          {(d.beneficiario_nome || anexos.length > 0) && (
            <div className="sub">
              {d.beneficiario_nome}
              {anexos.length > 0 && (
                <span className="dp-clipe" title={`${plural(anexos.length, 'comprovante anexado', 'comprovantes anexados')}`}>
                  <Icone nome="anexo" tamanho={13} /> {anexos.length}
                  <span className="so-leitor"> {plural(anexos.length, 'comprovante', 'comprovantes')}</span>
                </span>
              )}
            </div>
          )}
        </td>
        <td>
          {ehReembolso(d)
            ? <span className="sub">Dívida com sócio</span>
            : cat ? <>{cat.nome}{grupo && <div className="sub">{grupo.nome}</div>}</> : <span className="sub">Sem plano</span>}
        </td>
        <td className="dp-serie">{ehReembolso(d) ? <span className="sub">—</span> : serieTexto ?? <span className="sub">Avulsa</span>}</td>
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
              <Icone nome="abrir_linha" tamanho={16} /> {aberto === 'detalhe' ? 'Fechar o detalhe' : 'Ver o detalhe e os comprovantes'}
            </button>
            {viva && !ehReembolso(d) && (
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
            {vivas.length > 0 && (
              <button type="button" role="menuitem" onClick={() => alternar('desfazer')}>
                <Icone nome="desfazer" tamanho={16} /> Desfazer a última baixa…
              </button>
            )}
            {viva && d.valor_pago_centavos === 0 && (
              <button type="button" role="menuitem" className="perigo" onClick={() => alternar('cancelar')}>
                <Icone nome="cancelado" tamanho={16} /> Cancelar…
              </button>
            )}
          </Menu>
        </td>
      </tr>

      {aberto === 'detalhe' && extra(
        <DetalheDaDespesa d={d} nomeDaOrigem={p.nomeDaOrigem} nomeDoCentro={p.nomeDoCentro} categorias={p.categorias}
                          acao={p.acao} aoMudar={p.aoMudar} />)}
      {aberto === 'baixa' && extra(
        <FormularioDeBaixa d={d} hoje={p.hoje} cadastros={p.cadastros} acao={p.acao}
                           aoFechar={() => setAberto(null)} aoPagar={() => { setAberto(null); p.aoMudar(); }} />)}
      {aberto === 'proximo' && p.serie && extra(
        <FormularioDoProximo serie={p.serie} acao={p.acao}
                             aoFechar={() => setAberto(null)} aoLancar={() => { setAberto(null); p.aoMudar(); }} />)}
      {aberto === 'encerrar' && d.serie_id && extra(
        <FormularioDoFim d={d} acao={p.acao}
                         aoFechar={() => setAberto(null)} aoSalvar={() => { setAberto(null); p.aoMudar(); }} />)}
      {aberto === 'desfazer' && vivas.length > 0 && extra(
        <DesfazerBaixa d={d} baixa={vivas.at(-1)!} acao={p.acao}
                       aoFechar={() => setAberto(null)} aoDesfazer={() => { setAberto(null); p.aoMudar(); }} />)}
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

/**
 * DESFAZER A BAIXA (o estorno, migration 44). A pergunta diz o que acontece com o
 * dinheiro — a despesa volta a aberta, e a dívida com o sócio, se a baixa saiu do
 * bolso dele, some junto — e pede o motivo, que fica no histórico.
 */
function DesfazerBaixa(p: {
  d: Despesa; baixa: PagamentoDaDespesa; acao: Acao; aoFechar: () => void; aoDesfazer: () => void;
}) {
  async function desfazer(motivo: string) {
    let r: { divida_cancelada: boolean } | null = null;
    const ok = await p.acao.executar(async () => {
      r = await api.post<{ divida_cancelada: boolean }>(`/despesas/pagamentos/${p.baixa.id}/estornar`, { motivo });
    });
    if (ok) {
      const x = r as { divida_cancelada: boolean } | null;
      p.acao.anunciar(`A baixa de ${emReais(saidaDoPagamento(p.baixa))} em «${p.d.descricao}» foi desfeita.`
        + (x?.divida_cancelada ? ' A dívida com o sócio, que nascia dela, foi cancelada junto.' : ''));
      p.aoDesfazer();
    }
  }
  return (
    <PerguntaNaTela rotulo={`Desfazer a baixa de «${p.d.descricao}»`} manter="Manter a baixa" confirmar="Desfazer a baixa"
                    tom="aviso" ocupado={p.acao.ocupado} erro={p.acao.erro}
                    campo={{ rotulo: 'Por que desfazer', dica: 'data errada, valor errado, pagou duas vezes…',
                             nota: 'Fica no histórico, com o seu nome e a hora. A baixa não é apagada: fica marcada como desfeita.' }}
                    aoManter={p.aoFechar} aoConfirmar={(m) => void desfazer(m)}>
      A baixa de <strong>{emReais(saidaDoPagamento(p.baixa))}</strong> em {diaEmBr(p.baixa.data_pagamento)} deixa de valer, e a
      despesa volta a ter {emReais(p.baixa.valor_centavos)} em aberto.
      {p.d.reembolso_de_pagamento_id === null && ' Se ela saiu do bolso de um sócio, a dívida com ele é cancelada junto.'}
    </PerguntaNaTela>
  );
}

function DetalheDaDespesa(p: {
  d: Despesa; nomeDaOrigem: Map<string, string>; nomeDoCentro: Map<string, string>;
  categorias: CadastrosDaEmpresa['categorias']; acao: Acao; aoMudar: () => void;
}) {
  const { d } = p;
  const [enviando, setEnviando] = useState(false);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  const [tirando, setTirando] = useState<string | null>(null);
  const item = (rotulo: string, valor: ReactNode) => (valor ? <><dt>{rotulo}</dt><dd>{valor}</dd></> : null);
  const anexos = d.anexo ?? [];
  const credor = d.beneficiario_nome;

  async function anexar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviando(true); setErroDoArquivo(null);
    const erros: string[] = [];
    for (const a of Array.from(arquivos)) {
      const e = await anexarArquivo(d.id, a);
      if (e) erros.push(e);
    }
    setEnviando(false);
    if (erros.length) setErroDoArquivo(erros.join(' '));
    if (erros.length < arquivos.length) { p.acao.anunciar(`Comprovante anexado a «${d.descricao}».`); p.aoMudar(); }
  }

  async function tirar(id: string, nome: string) {
    const ok = await p.acao.executar(() => api.post(`/anexos/${id}/desvincular`, {}));
    if (ok) { p.acao.anunciar(`«${nome}» saiu de «${d.descricao}». O arquivo continua no histórico.`); setTirando(null); p.aoMudar(); }
  }

  return (
    <div className="dp-detalhe">
      <dl>
        {item('Nº do lançamento', d.numero ? String(d.numero) : null)}
        {item('Competência', mesPorExtenso(d.competencia))}
        {item('Plano de contas', nomeNoPlano(d.categoria_id, p.categorias))}
        {item('Centro de custo', d.centro_custo_id ? p.nomeDoCentro.get(d.centro_custo_id) ?? null : null)}
        {item('Fornecedor', d.fornecedor_id
          ? <Ligacao para="/fornecedores">{credor ?? 'ver no cadastro'}</Ligacao>
          : credor ? <>{credor} <span className="sub">(sem cadastro)</span></> : null)}
        {item('Tipo de despesa', d.natureza ? ROTULO_DA_NATUREZA[d.natureza] : null)}
        {item('Forma prevista', d.forma_prevista ? ROTULO_DA_FORMA[d.forma_prevista] : null)}
        {item('Sai de', d.origem_pagamento_id ? p.nomeDaOrigem.get(d.origem_pagamento_id) ?? null : null)}
        {item('Nº do documento', d.numero_documento)}
        {item('Link do comprovante', d.comprovante_url
          ? <a href={d.comprovante_url} target="_blank" rel="noreferrer noopener">Abrir o link <Icone nome="abrir_externo" tamanho={13} /></a>
          : null)}
        {item('Recorrente até', d.recorrente_ate ? mesPorExtenso(d.recorrente_ate) : null)}
        {item('Observações', d.observacao)}
      </dl>

      <div className="dp-anexos" aria-label="Comprovantes">
        <h4>Comprovantes</h4>
        {anexos.length === 0 && <p className="sub">Nenhum arquivo anexado.</p>}
        {anexos.length > 0 && (
          <ul>
            {anexos.map((a) => (
              <li key={a.id}>
                <Icone nome="anexo" tamanho={14} />
                <button type="button" className="discreto dp-nome" onClick={async () => {
                  const e = await abrirAnexo(a.id);
                  if (e) setErroDoArquivo(e);
                }}>{a.nome_arquivo}</button>
                <span className="sub">{tamanhoEmBr(a.anexo_conteudo.tamanho_bytes)} · {momentoEmBr(a.enviado_em)}</span>
                {tirando === a.id ? (
                  <PerguntaNaTela forma="linha" rotulo={`Tirar «${a.nome_arquivo}»`} manter="Manter" confirmar="Tirar da despesa"
                                  tom="aviso" ocupado={p.acao.ocupado} erro={p.acao.erro}
                                  aoManter={() => setTirando(null)} aoConfirmar={() => void tirar(a.id, a.nome_arquivo)}>
                    O arquivo sai desta despesa e continua no histórico.
                  </PerguntaNaTela>
                ) : (
                  <button type="button" className="discreto" onClick={() => setTirando(a.id)}>Tirar</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <label className={`dp-enviar${enviando ? ' ocupado' : ''}`}>
          <Icone nome={enviando ? 'carregando' : 'anexo'} tamanho={15} />
          {enviando ? 'Enviando…' : 'Anexar comprovante (PDF ou foto)'}
          <input type="file" accept={TIPOS_DO_ANEXO} multiple disabled={enviando}
                 onChange={(e) => { void anexar(e.target.files); e.target.value = ''; }} />
        </label>
        {erroDoArquivo && <Aviso tipo="erro">{erroDoArquivo}</Aviso>}
      </div>

      {d.pagamento.length > 0 && (
        <table className="dp-pagamentos">
          <caption>Baixas</caption>
          <thead><tr><th>Data</th><th className="num">Abateu</th><th className="num">Juros/multa</th><th className="num">Desconto</th><th className="num">Saiu do banco</th><th>Forma</th><th>De</th></tr></thead>
          <tbody>
            {d.pagamento.map((x) => (
              <tr key={x.id} className={x.estornado_em ? 'dp-desfeita' : undefined}>
                <td>
                  {diaEmBr(x.data_pagamento)}
                  {x.estornado_em && <div className="sub">desfeita em {diaEmBr(x.estornado_em)}{x.motivo_estorno ? `: ${x.motivo_estorno}` : ''}</div>}
                </td>
                <td className="num">{emReais(x.valor_centavos)}</td>
                <td className="num">{x.acrescimo_centavos ? emReais(x.acrescimo_centavos) : '—'}</td>
                <td className="num">{x.desconto_centavos ? emReais(x.desconto_centavos) : '—'}</td>
                <td className="num"><strong>{emReais(saidaDoPagamento(x))}</strong></td>
                <td>{ROTULO_DA_FORMA[x.forma] ?? x.forma}</td>
                <td>{x.origem_pagamento_id ? p.nomeDaOrigem.get(x.origem_pagamento_id) ?? '—' : '—'}</td>
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
  const [origem, setOrigem] = useState(
    p.d.origem_pagamento_id
    ?? (ehReembolso(p.d) ? (p.cadastros?.origens ?? []).find((o) => o.ativo && o.tipo === 'conta_bancaria')?.id ?? '' : ''));
  const [motivo, setMotivo] = useState<MotivoDaDiferenca | ''>('');
  const [referencia, setReferencia] = useState('');

  let centavos: number | null = null;
  try { centavos = paraCentavos(saiu); } catch { centavos = null; }
  const baixa = centavos === null ? 'Escreva o valor como 1.234,56.' : decomporBaixa(resta, centavos, motivo || null);
  const futura = data > p.hoje;
  const reembolso = ehReembolso(p.d);
  /* O reembolso ao sócio sai da conta da empresa — nunca do bolso de um sócio. */
  const origens = (p.cadastros?.origens ?? [])
    .filter((o) => (o.ativo || o.id === origem) && !(reembolso && o.tipo === 'socio'));
  const socio = (p.cadastros?.origens ?? []).find((o) => o.id === origem && o.tipo === 'socio') ?? null;

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
               opcoes={origens.map((o) => ({ valor: o.id, texto: o.tipo === 'socio' ? `${o.nome} (sócio, do bolso)` : o.nome }))} />
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
      {socio && typeof baixa === 'object' && (
        <p className="sub dp-aviso-socio">
          Saiu do bolso de {socio.nome}: a empresa passa a dever a ele{' '}
          <strong>{emReais(baixa.valor_centavos + baixa.acrescimo_centavos - baixa.desconto_centavos)}</strong>,
          {' '}em «Devido aos sócios».
        </p>
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
      <p className="sub">Copia o último título da série — com o fornecedor, o plano e o centro; ajuste o valor se a conta variou.</p>
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
  const [ate, setAte] = useState(p.d.recorrente_ate ? mesDe(p.d.recorrente_ate) : mesDe(p.d.vencimento));

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
      <p className="sub">O último MÊS DE VENCIMENTO da conta, como na planilha. A Projeção para de contar depois dele.</p>
      <div className="dp-campos">
        <CampoDeMes rotulo="Último mês de vencimento" valor={ate} ao={setAte} />
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

// ------------------------------------------------------ o fornecedor no formulário

/**
 * O CAMPO FORNECEDOR: escreve-se o nome, e a lista do cadastro sugere. Escolhido um
 * do cadastro, a despesa liga nele (e o plano e o centro de costume vêm junto, se
 * estiverem vazios); um nome que não está no cadastro fica como texto — como na
 * planilha —, com «Cadastrar» ao lado para quem quiser. Vazio também vale.
 */
function CampoDoFornecedor(p: {
  texto: string; fornecedorId: string; fornecedores: readonly ResumoDoFornecedor[]; acao: Acao;
  ao: (texto: string, f: Fornecedor | null) => void; aoCadastrar: () => void;
}) {
  const id = useId();
  const lista = `${id}-lista`;
  const ativos = p.fornecedores.filter((f) => f.ativo || f.id === p.fornecedorId);
  const doCadastro = ativos.find((f) => f.id === p.fornecedorId) ?? null;
  const [criando, setCriando] = useState(false);

  function escrever(t: string) {
    const igual = ativos.find((f) => f.nome.trim().toLowerCase() === t.trim().toLowerCase()) ?? null;
    p.ao(t, igual);
  }

  async function cadastrar() {
    setCriando(true);
    let novo: Fornecedor | null = null;
    const ok = await p.acao.executar(async () => { novo = await api.post<Fornecedor>('/fornecedores', { nome: p.texto }); });
    setCriando(false);
    if (ok && novo) {
      p.acao.anunciar(`«${(novo as Fornecedor).nome}» entrou nos fornecedores. Os dados para pagar se completam na tela Fornecedores.`);
      p.ao((novo as Fornecedor).nome, novo);
      p.aoCadastrar();
    }
  }

  return (
    <div className="campo dp-fornecedor">
      <div className="campo-rotulo"><label htmlFor={id}>Fornecedor ou credor (opcional)</label></div>
      <input id={id} type="text" list={lista} value={p.texto} placeholder="A quem se paga" autoComplete="off"
             onChange={(e) => escrever(e.target.value)} aria-describedby={`${id}-nota`} />
      <datalist id={lista}>
        {ativos.map((f) => <option key={f.id} value={f.nome} />)}
      </datalist>
      <p className="sub dp-fornecedor-nota" id={`${id}-nota`}>
        {doCadastro
          ? <><Icone nome="confirmar" tamanho={12} /> Do cadastro{doCadastro.documento ? ` · ${doCadastro.documento_tipo === 'cpf' ? 'CPF' : 'CNPJ'} ${doCadastro.documento}` : ''}</>
          : p.texto.trim()
            ? <>Só o nome, sem cadastro.{' '}
                <button type="button" className="discreto" disabled={criando || p.acao.ocupado} onClick={() => void cadastrar()}>
                  Cadastrar «{p.texto.trim()}»
                </button></>
            : 'Escreva para escolher do cadastro, ou deixe vazio.'}
      </p>
    </div>
  );
}

// ------------------------------------------------------ nova despesa e edição

type Repeticao = RecorrenciaDaDespesa;

function FormularioDeDespesa(p: {
  despesa: Despesa | null; hoje: string; cadastros: CadastrosDaEmpresa | null;
  fornecedores: readonly ResumoDoFornecedor[]; acao: Acao;
  aoFechar: () => void; aoSalvar: () => void; aoCadastrarFornecedor: () => void;
}) {
  const e = p.despesa;
  const [f, setF] = useState({
    descricao: e?.descricao ?? '',
    fornecedor: e?.beneficiario_nome ?? '',
    fornecedor_id: e?.fornecedor_id ?? '',
    categoria_id: e?.categoria_id ?? '',
    centro_custo_id: e?.centro_custo_id ?? '',
    natureza: e?.natureza ?? '',
    valor: e ? centavosParaCampo(e.valor_centavos) : '',
    vencimento: e ? dia(e.vencimento) : '',
    competencia: e ? mesDe(e.competencia) : '',
    recorrencia: (e?.recorrencia ?? 'avulsa') as Repeticao,
    parcelas: '2',
    parcela_inicial: '1',
    recorrente_ate: '',
    forma_prevista: e?.forma_prevista ?? '',
    origem_pagamento_id: e?.origem_pagamento_id ?? '',
    numero_documento: e?.numero_documento ?? '',
    comprovante_url: e?.comprovante_url ?? '',
    observacao: e?.observacao ?? '',
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  /* A competência acompanha o vencimento até alguém mexer nela — na planilha as
     duas quase sempre caem no mesmo mês. */
  const [competenciaTocada, setCompetenciaTocada] = useState(!!e);
  const campo = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const origens = (p.cadastros?.origens ?? []).filter((o) => o.ativo || o.id === f.origem_pagamento_id);
  const centros = (p.cadastros?.centros ?? []).filter((c) => c.ativo || c.id === f.centro_custo_id);
  const parcelada = f.recorrencia === 'parcelada';
  const periodica = !!INTERVALO_EM_MESES[f.recorrencia];

  let centavos: number | null = null;
  try { centavos = f.valor ? paraCentavos(f.valor) : null; } catch { centavos = null; }
  const nParcelas = Number(f.parcelas);
  const nInicio = Number(f.parcela_inicial || '1');
  const parcelasOk = Number.isInteger(nParcelas) && nParcelas >= 2 && nParcelas <= 360;
  const inicioOk = Number.isInteger(nInicio) && nInicio >= 1 && (!parcelasOk || nInicio <= nParcelas);
  const quantas = parcelasOk && inicioOk ? nParcelas - nInicio + 1 : 0;
  const faltando = [
    !f.descricao.trim() && 'o histórico',
    (centavos === null || centavos <= 0) && 'o valor',
    !f.vencimento && 'o vencimento',
    !f.competencia && 'a competência',
    parcelada && !e && !parcelasOk && 'o número de parcelas (2 a 360)',
    parcelada && !e && !inicioOk && 'a parcela em que começa (de 1 ao total)',
  ].filter(Boolean) as string[];

  const opcoesDeRepeticao = (Object.keys(ROTULO_DA_RECORRENCIA) as Repeticao[])
    .filter((r) => !e || (e.recorrencia === 'parcelada' ? r === 'parcelada' : r !== 'parcelada'))
    .map((valor) => ({ valor, texto: ROTULO_DA_RECORRENCIA[valor] }));

  /* Escolhido um fornecedor do cadastro, o plano e o centro de costume dele entram
     — só no que ainda está vazio: nada que a pessoa escolheu é trocado. */
  function escolherFornecedor(texto: string, fo: Fornecedor | null) {
    setF((x) => ({
      ...x, fornecedor: texto, fornecedor_id: fo?.id ?? '',
      categoria_id: x.categoria_id || fo?.categoria_padrao_id || '',
      centro_custo_id: x.centro_custo_id || fo?.centro_padrao_id || '',
    }));
  }

  useEffect(() => { setErroDoArquivo(null); }, [arquivo]);

  async function salvar() {
    if (faltando.length) return;
    const corpo = {
      descricao: f.descricao, fornecedor: f.fornecedor, fornecedor_id: f.fornecedor_id || null, valor_centavos: centavos,
      competencia: `${f.competencia}-01`, vencimento: f.vencimento,
      categoria_id: f.categoria_id || null, centro_custo_id: f.centro_custo_id || null, natureza: f.natureza || null,
      forma_prevista: f.forma_prevista || null, origem_pagamento_id: f.origem_pagamento_id || null,
      numero_documento: f.numero_documento, comprovante_url: f.comprovante_url, observacao: f.observacao,
      recorrencia: f.recorrencia,
    };
    let criadas: Array<{ id: string }> = [];
    const ok = await p.acao.executar(async () => {
      if (e) await api.patch(`/despesas/${e.id}`, corpo);
      else criadas = await api.post<Array<{ id: string }>>('/despesas', {
        ...corpo,
        parcelas: parcelada ? nParcelas : undefined,
        parcela_inicial: parcelada ? nInicio : undefined,
        recorrente_ate: periodica && f.recorrente_ate ? `${f.recorrente_ate}-01` : null,
      });
    });
    if (!ok) return;
    /* O comprovante sobe DEPOIS de a despesa existir (o anexo aponta para ela). Na
       parcelada, vai na primeira parcela lançada — é a compra. */
    const alvo = e?.id ?? criadas[0]?.id;
    const erroDoAnexo = arquivo && alvo ? await anexarArquivo(alvo, arquivo) : null;
    p.acao.anunciar((e ? `«${f.descricao.trim()}» foi atualizada.`
      : parcelada ? `«${f.descricao.trim()}» entrou em ${quantas} parcelas.`
      : `«${f.descricao.trim()}» entrou.`)
      + (arquivo ? (erroDoAnexo ? ` O comprovante NÃO subiu: ${erroDoAnexo}` : ' Com o comprovante anexado.') : ''));
    p.aoSalvar();
  }

  return (
    <PainelDeCriar id="nova-despesa" titulo={e ? `Editar «${e.descricao}»` : 'Nova despesa'} aoFechar={p.aoFechar}>
      <form className="dp-nova" onSubmit={(ev) => { ev.preventDefault(); void salvar(); }}>
        <fieldset>
          <legend>O quê</legend>
          <div className="dp-campos">
            <Campo rotulo="Histórico" valor={f.descricao} ao={campo('descricao')} dica="Aluguel da sala comercial" />
            <CampoDoFornecedor texto={f.fornecedor} fornecedorId={f.fornecedor_id} fornecedores={p.fornecedores} acao={p.acao}
                               ao={escolherFornecedor} aoCadastrar={p.aoCadastrarFornecedor} />
            <Campo rotulo="Plano de contas" valor={f.categoria_id} ao={campo('categoria_id')}
                   opcoes={opcoesDoPlano(p.cadastros, f.categoria_id)} />
            <Campo rotulo="Centro de custo" valor={f.centro_custo_id} ao={campo('centro_custo_id')}
                   opcoes={centros.map((c) => ({ valor: c.id, texto: c.nome }))} />
            <Campo rotulo="Tipo de despesa" valor={f.natureza} ao={campo('natureza')}
                   opcoes={OPCOES_DE_NATUREZA} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Quando e quanto</legend>
          <div className="dp-campos">
            <Campo rotulo={parcelada && !e ? 'Valor de cada parcela (R$)' : 'Valor (R$)'} valor={f.valor} ao={campo('valor')}
                   dica="0,00" />
            <Campo rotulo={parcelada && !e ? `Vencimento da ${nInicio > 1 && inicioOk ? `${nInicio}ª` : '1ª'} parcela` : 'Vencimento'} tipo="date" valor={f.vencimento}
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
            {parcelada && !e && (
              <Campo rotulo="Começa na parcela" valor={f.parcela_inicial} ao={campo('parcela_inicial')} teclado={{ inputMode: 'numeric' }}
                     erro={!inicioOk ? `De 1 a ${parcelasOk ? nParcelas : 'o total'}.` : null} />
            )}
            {periodica && !e && (
              <CampoDeMes rotulo="Último mês de vencimento (opcional)" valor={f.recorrente_ate} ao={campo('recorrente_ate')} vazio="sem fim" />
            )}
          </div>
          <p className="sub">
            {parcelada && !e && centavos && quantas > 0
              ? `Entram ${quantas} títulos de ${emReais(centavos)}, um por mês${nInicio > 1 ? `, da ${nInicio}ª à ${nParcelas}ª parcela` : ''} — ${emReais(centavos * quantas)} ao todo.`
              : periodica ? 'Entra este mês; os próximos aparecem na Projeção e entram com «Lançar o próximo».'
              : f.recorrencia === 'avulsa' ? 'Um título só.' : ''}
          </p>
        </fieldset>

        <Recolhido lembrar="despesas.mais-detalhes" titulo="Mais detalhes" resumo="Comprovante, forma, origem e documento">
          <div className="dp-campos">
            <div className="campo">
              <div className="campo-rotulo"><span>Comprovante (PDF ou foto)</span></div>
              <label className="dp-enviar">
                <Icone nome="anexo" tamanho={15} />
                {arquivo ? arquivo.name : 'Escolher o arquivo'}
                <input type="file" accept={TIPOS_DO_ANEXO} onChange={(ev) => setArquivo(ev.target.files?.[0] ?? null)} />
              </label>
              {arquivo && <button type="button" className="discreto" onClick={() => setArquivo(null)}>Tirar o arquivo</button>}
              {erroDoArquivo && <p className="campo-erro">{erroDoArquivo}</p>}
            </div>
            <Campo rotulo="Forma de pagamento prevista" valor={f.forma_prevista} ao={campo('forma_prevista')}
                   opcoes={OPCOES_DE_FORMA} />
            <Campo rotulo="Sai de" valor={f.origem_pagamento_id} ao={campo('origem_pagamento_id')}
                   opcoes={origens.map((o) => ({ valor: o.id, texto: o.nome }))} />
            <Campo rotulo="Nº do documento (NF, boleto)" valor={f.numero_documento} ao={campo('numero_documento')} />
            <Campo rotulo="Link do comprovante (opcional)" valor={f.comprovante_url} ao={campo('comprovante_url')} dica="https://…" />
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
