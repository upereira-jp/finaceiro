// FORNECEDORES — a quem a empresa paga (06/10/2026, etapa 1 do controle total).
//
// POR QUE ESTA TELA EXISTE: na planilha o «FORNECEDOR / CREDOR» era texto livre,
// e no sistema continuou sendo até a migration 44. Texto livre não responde
// «quanto pagamos à imobiliária este ano»: «Imobiliária X» num mês e «Imob. X» no
// outro eram dois credores. Aqui cada fornecedor tem UM cadastro, com o documento
// conferido, os dados para pagar e o plano de contas de costume — e a lista diz,
// de cada um, quanto saiu nos últimos 12 meses e quanto está em aberto.
//
// O QUE ELA NÃO FAZ: obrigar. A despesa continua aceitando só o nome escrito (ou
// nada), como a planilha; o cadastro nasce aqui ou na hora de lançar, no campo
// Fornecedor de Despesas («Cadastrar este»). E não apaga: desativa.

import { useState, type ReactNode } from 'react';
import {
  api, type CadastrosDaEmpresa, type FichaDoFornecedor, type Fornecedor, type ResumoDoFornecedor,
} from '../api.ts';
import { useAcao, useDados, type Acao } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, Marca, Icone, Carregando, Busca, Ferramentas, Filtro, Menu,
  BotaoDeCriar, PainelDeCriar, Recolhido, linha, contem,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { emReais } from '../dinheiro.ts';
import { diaEmBr } from '../formato.ts';
import { formatarDocumento } from '../clientes-regras.ts';
import { SELO_DO_CADASTRO, SELO_DA_DESPESA } from '../tom-do-estado.ts';
import { situacao, nomeNoPlano, ROTULO_DA_SITUACAO_DA_DESPESA, gruposDoPlano, subcategoriasDe } from '../despesas-regras.ts';
import { hojeEmSP } from '../formato.ts';

type Mostrar = 'ativos' | 'inativos' | 'todos';
const ROTULO_DO_MOSTRAR: Record<Mostrar, string> = { ativos: 'Ativos', inativos: 'Desativados', todos: 'Todos' };

const TIPOS_DE_CHAVE = [
  { valor: 'cnpj', texto: 'CNPJ' }, { valor: 'cpf', texto: 'CPF' }, { valor: 'email', texto: 'E-mail' },
  { valor: 'telefone', texto: 'Telefone' }, { valor: 'aleatoria', texto: 'Chave aleatória' },
];
const TIPOS_DE_CONTA = [{ valor: 'corrente', texto: 'Corrente' }, { valor: 'poupanca', texto: 'Poupança' }];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** As opções do plano para o «plano de costume»: grupos e, embaixo, as subcategorias. */
export function opcoesDoPlano(cad: CadastrosDaEmpresa | null, atual?: string | null) {
  const cats = (cad?.categorias ?? []).filter((c) => c.ativo || c.id === atual);
  return gruposDoPlano(cats).flatMap((g) => [
    { valor: g.id, texto: g.nome },
    ...subcategoriasDe(g.id, cats).map((s) => ({ valor: s.id, texto: `${g.nome} › ${s.nome}` })),
  ]);
}

export function TelaFornecedores() {
  const carga = useDados<ResumoDoFornecedor[]>(() => api.get('/fornecedores'));
  const cad = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const acao = useAcao();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [mostrar, setMostrar] = useState<Mostrar>('ativos');
  const [busca, setBusca] = useState('');

  const todos = carga.dado ?? [];
  /* Pelo documento só quando a busca tem dígitos: «contem(x, '')» casaria todo mundo. */
  const digitos = busca.replace(/\D/g, '');
  const visiveis = todos.filter((f) => (mostrar === 'todos' || (mostrar === 'ativos') === f.ativo)
    && (!busca.trim() || contem(f.nome, busca) || (digitos.length >= 3 && contem(f.documento, digitos))));
  const pago = visiveis.reduce((s, f) => s + f.pago_12_meses_centavos, 0);

  return (
    <Pagina titulo="Fornecedores"
            sub="A quem a empresa paga: quanto saiu para cada um em 12 meses e quanto está em aberto."
            acao={
              <BotaoDeCriar controla="novo-fornecedor" aberto={criando} ao={() => { setEditando(null); setCriando(!criando); }}>
                Novo fornecedor
              </BotaoDeCriar>
            }>
      {carga.erro && <Aviso tipo="erro">Não foi possível ler os fornecedores: {carga.erro}.</Aviso>}
      {carga.carregando && <Carregando texto="Lendo os fornecedores…" />}
      <RetornoDoAto texto={acao.sucesso} />

      {(criando || editando) && (
        <FormularioDoFornecedor key={editando?.id ?? 'novo'} fornecedor={editando} cadastros={cad.dado} acao={acao}
                                aoFechar={() => { setCriando(false); setEditando(null); }}
                                aoSalvar={() => { setCriando(false); setEditando(null); carga.recarregar(); }} />
      )}

      {carga.dado && (
        <Ferramentas contagem={`${plural(visiveis.length, 'fornecedor', 'fornecedores')} · ${emReais(pago)} pagos em 12 meses`}>
          <Filtro rotulo="Mostrar" valor={mostrar} ao={(v) => setMostrar(v as Mostrar)}
                  opcoes={(Object.keys(ROTULO_DO_MOSTRAR) as Mostrar[]).map((valor) => ({ valor, texto: ROTULO_DO_MOSTRAR[valor] }))} />
          <Busca valor={busca} ao={setBusca} dica="Buscar por nome ou CPF/CNPJ" />
        </Ferramentas>
      )}

      {carga.dado && (
        <Tabela cartoes="larga"
                cabecalho={<>
                  <th>Fornecedor</th><th>Contato</th><th className="num">Pago em 12 meses</th>
                  <th className="num">Em aberto</th><th>Última despesa</th><th>Situação</th>
                  <th><span className="so-leitor">Ações</span></th>
                </>}
                vazio={todos.length === 0
                  ? <>Nenhum fornecedor ainda. Cadastre aqui, ou na hora de lançar uma despesa: no campo <strong>Fornecedor</strong> de
                      {' '}<Ligacao para="/despesas">Despesas</Ligacao>, escreva o nome e escolha «Cadastrar».</>
                  : <>Nenhum fornecedor em «{ROTULO_DO_MOSTRAR[mostrar]}» com esta busca.</>}>
          {visiveis.map((f) => (
            <LinhaDoFornecedor key={f.id} f={f} cadastros={cad.dado} acao={acao}
                               aoEditar={() => { setCriando(false); setEditando(f); }} aoMudar={carga.recarregar} />
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}

function LinhaDoFornecedor(p: {
  f: ResumoDoFornecedor; cadastros: CadastrosDaEmpresa | null; acao: Acao; aoEditar: () => void; aoMudar: () => void;
}) {
  const { f } = p;
  const [aberto, setAberto] = useState(false);

  async function ativar(ativo: boolean) {
    const ok = await p.acao.executar(() => api.patch(`/fornecedores/${f.id}`, { ativo }));
    if (ok) { p.acao.anunciar(ativo ? `«${f.nome}» voltou a valer.` : `«${f.nome}» foi desativado. As despesas dele continuam.`); p.aoMudar(); }
  }

  return (
    <>
      <tr className={f.ativo ? undefined : 'pc-desativada'}>
        <td>
          <button type="button" className="discreto dp-nome" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            {f.nome}
          </button>
          {f.documento && <div className="sub">{f.documento_tipo === 'cpf' ? 'CPF' : 'CNPJ'} {formatarDocumento(f.documento)}</div>}
        </td>
        <td>{f.contato ?? <span className="sub">—</span>}</td>
        <td className="num">{emReais(f.pago_12_meses_centavos)}</td>
        <td className="num">{f.em_aberto_centavos ? emReais(f.em_aberto_centavos) : <span className="sub">—</span>}</td>
        <td>{f.ultimo_vencimento ? diaEmBr(f.ultimo_vencimento) : <span className="sub">nenhuma</span>}
          {f.despesas > 0 && <div className="sub">{plural(f.despesas, 'despesa', 'despesas')}</div>}</td>
        <td><Marca selo={SELO_DO_CADASTRO[f.ativo ? 'ativo' : 'inativo']}>{f.ativo ? 'Ativo' : 'Desativado'}</Marca></td>
        <td className="dp-acoes">
          <Menu soIcone rotulo={`Mais ações de «${f.nome}»`} gatilho={<Icone nome="mais_acoes" tamanho={18} peso="bold" />}>
            <button type="button" role="menuitem" onClick={() => setAberto(!aberto)}>
              <Icone nome="abrir_linha" tamanho={16} /> {aberto ? 'Fechar a ficha' : 'Ver a ficha'}
            </button>
            <button type="button" role="menuitem" onClick={p.aoEditar}>
              <Icone nome="alterou" tamanho={16} /> Editar…
            </button>
            <button type="button" role="menuitem" onClick={() => void ativar(!f.ativo)}>
              <Icone nome={f.ativo ? 'cancelado' : 'confirmar'} tamanho={16} /> {f.ativo ? 'Desativar' : 'Reativar'}
            </button>
          </Menu>
        </td>
      </tr>
      {aberto && (
        <tr className="dp-extra"><td colSpan={7}><FichaDoFornecedor id={f.id} f={f} cadastros={p.cadastros} /></td></tr>
      )}
    </>
  );
}

function FichaDoFornecedor(p: { id: string; f: ResumoDoFornecedor; cadastros: CadastrosDaEmpresa | null }) {
  const ficha = useDados<FichaDoFornecedor>(() => api.get(`/fornecedores/${p.id}`));
  const hoje = hojeEmSP();
  const categorias = p.cadastros?.categorias ?? [];
  const centros = p.cadastros?.centros ?? [];
  const item = (rotulo: string, valor: ReactNode) => (valor ? <><dt>{rotulo}</dt><dd>{valor}</dd></> : null);
  const { f } = p;
  const pagar = [
    f.chave_pix && `Pix (${TIPOS_DE_CHAVE.find((t) => t.valor === f.tipo_chave_pix)?.texto ?? f.tipo_chave_pix}): ${f.chave_pix}`,
    (f.banco || f.agencia || f.conta) && [f.banco, f.agencia && `ag. ${f.agencia}`, f.conta && `conta ${f.conta}`,
      f.tipo_conta && TIPOS_DE_CONTA.find((t) => t.valor === f.tipo_conta)?.texto.toLowerCase()].filter(Boolean).join(' · '),
  ].filter(Boolean);
  return (
    <div className="dp-detalhe">
      <dl>
        {item('Para pagar', pagar.length ? pagar.map((x, i) => <div key={i}>{x}</div>) : null)}
        {item('Plano de costume', nomeNoPlano(f.categoria_padrao_id, categorias))}
        {item('Centro de costume', centros.find((c) => c.id === f.centro_padrao_id)?.nome ?? null)}
        {item('Observações', f.observacao)}
      </dl>
      {ficha.carregando && <Carregando texto="Lendo as despesas…" />}
      {ficha.erro && <Aviso tipo="erro">Não foi possível ler as despesas: {ficha.erro}.</Aviso>}
      {ficha.dado && (ficha.dado.despesas.length === 0
        ? <p className="sub">Nenhuma despesa ligada a este fornecedor ainda.</p>
        : (
          <table className="dp-pagamentos">
            <caption>As despesas mais recentes ({ficha.dado.despesas.length})</caption>
            <thead><tr><th>Nº</th><th>Vencimento</th><th>Histórico</th><th className="num">Valor</th><th>Situação</th></tr></thead>
            <tbody>
              {ficha.dado.despesas.slice(0, 12).map((d) => {
                const sit = situacao({ status: d.status, vencimento: d.vencimento, reembolso_de_pagamento_id: null }, hoje);
                return (
                  <tr key={d.id}>
                    <td>{d.numero ?? '—'}</td>
                    <td>{diaEmBr(d.vencimento)}</td>
                    <td>{d.descricao}</td>
                    <td className="num">{emReais(d.valor_centavos)}</td>
                    <td><Marca selo={SELO_DA_DESPESA[sit]}>{ROTULO_DA_SITUACAO_DA_DESPESA[sit]}</Marca></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      <p className="sub"><Ligacao para={`/despesas?fornecedor=${p.id}`}>Ver todas em Despesas</Ligacao></p>
    </div>
  );
}

// ------------------------------------------------------ o cadastro

export function FormularioDoFornecedor(p: {
  fornecedor: Fornecedor | null; cadastros: CadastrosDaEmpresa | null; acao: Acao;
  aoFechar: () => void; aoSalvar: (f: Fornecedor | null) => void;
  /** O nome que veio escrito no campo de Despesas («Cadastrar este»). */
  nomeInicial?: string;
}) {
  const e = p.fornecedor;
  const [f, setF] = useState({
    nome: e?.nome ?? p.nomeInicial ?? '',
    documento: e?.documento ? formatarDocumento(e.documento) : '',
    contato: e?.contato ?? '',
    categoria_padrao_id: e?.categoria_padrao_id ?? '',
    centro_padrao_id: e?.centro_padrao_id ?? '',
    tipo_chave_pix: e?.tipo_chave_pix ?? '',
    chave_pix: e?.chave_pix ?? '',
    banco: e?.banco ?? '',
    agencia: e?.agencia ?? '',
    conta: e?.conta ?? '',
    tipo_conta: e?.tipo_conta ?? '',
    observacao: e?.observacao ?? '',
  });
  const campo = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const centros = (p.cadastros?.centros ?? []).filter((c) => c.ativo || c.id === f.centro_padrao_id);

  async function salvar() {
    if (!f.nome.trim()) return;
    const corpo = {
      nome: f.nome, documento: f.documento, contato: f.contato,
      categoria_padrao_id: f.categoria_padrao_id || null, centro_padrao_id: f.centro_padrao_id || null,
      tipo_chave_pix: f.tipo_chave_pix || null, chave_pix: f.chave_pix,
      banco: f.banco, agencia: f.agencia, conta: f.conta, tipo_conta: f.tipo_conta || null, observacao: f.observacao,
    };
    let criado: Fornecedor | null = null;
    const ok = await p.acao.executar(async () => {
      if (e) await api.patch(`/fornecedores/${e.id}`, corpo);
      else criado = await api.post<Fornecedor>('/fornecedores', corpo);
    });
    if (ok) {
      p.acao.anunciar(e ? `«${f.nome.trim()}» foi atualizado.` : `«${f.nome.trim()}» entrou nos fornecedores.`);
      p.aoSalvar(criado);
    }
  }

  return (
    <PainelDeCriar id="novo-fornecedor" titulo={e ? `Editar «${e.nome}»` : 'Novo fornecedor'} aoFechar={p.aoFechar}>
      <form className="dp-nova" onSubmit={(ev) => { ev.preventDefault(); void salvar(); }}>
        <fieldset>
          <legend>Quem é</legend>
          <div className="dp-campos">
            <Campo rotulo="Nome" valor={f.nome} ao={campo('nome')} dica="Imobiliária Central" />
            <Campo rotulo="CPF ou CNPJ (opcional)" valor={f.documento} ao={campo('documento')} dica="00.000.000/0000-00" />
            <Campo rotulo="Contato (opcional)" valor={f.contato} ao={campo('contato')} dica="telefone ou e-mail" />
          </div>
        </fieldset>
        <fieldset>
          <legend>Como costuma ser lançado</legend>
          <div className="dp-campos">
            <Campo rotulo="Plano de contas de costume" valor={f.categoria_padrao_id} ao={campo('categoria_padrao_id')}
                   opcoes={opcoesDoPlano(p.cadastros, f.categoria_padrao_id)} />
            <Campo rotulo="Centro de custo de costume" valor={f.centro_padrao_id} ao={campo('centro_padrao_id')}
                   opcoes={centros.map((c) => ({ valor: c.id, texto: c.nome }))} />
          </div>
          <p className="sub">Quando este fornecedor é escolhido numa despesa nova, o plano e o centro já vêm preenchidos.</p>
        </fieldset>
        <Recolhido lembrar="fornecedores.dados-de-pagamento" titulo="Dados para pagar" resumo="Chave Pix ou conta bancária">
          <div className="dp-campos">
            <Campo rotulo="Tipo da chave Pix" valor={f.tipo_chave_pix} ao={campo('tipo_chave_pix')} opcoes={TIPOS_DE_CHAVE} />
            <Campo rotulo="Chave Pix" valor={f.chave_pix} ao={campo('chave_pix')} />
            <Campo rotulo="Banco" valor={f.banco} ao={campo('banco')} />
            <Campo rotulo="Agência" valor={f.agencia} ao={campo('agencia')} />
            <Campo rotulo="Conta" valor={f.conta} ao={campo('conta')} />
            <Campo rotulo="Tipo da conta" valor={f.tipo_conta} ao={campo('tipo_conta')} opcoes={TIPOS_DE_CONTA} />
            <Campo rotulo="Observações" valor={f.observacao} ao={campo('observacao')} />
          </div>
        </Recolhido>
        {p.acao.erro && <Aviso tipo="erro">{p.acao.erro}</Aviso>}
        <div style={linha}>
          <button type="submit" className="primario" disabled={p.acao.ocupado || !f.nome.trim()}>
            {e ? 'Salvar o fornecedor' : 'Cadastrar o fornecedor'}
          </button>
          <button type="button" className="discreto" onClick={p.aoFechar}>Cancelar</button>
          {!f.nome.trim() && <span className="sub">Falta o nome.</span>}
        </div>
      </form>
    </PainelDeCriar>
  );
}
