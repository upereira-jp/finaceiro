// PLANO DE CONTAS — a aba «Cadastros» da planilha `G3Solar_Financeiro.xlsx`.
//
// POR QUE ESTA TELA EXISTE: a tabela `categoria` existia desde 03/08/2026,
// vazia e sem tela; Despesas, Painel e Projeção agrupam por ela. A planilha
// trouxe a lista que a G3 usa (12 itens) e a origem do dinheiro (Conta PJ e os
// adiantamentos de sócio), e é aqui que as duas passam a morar.
//
// O QUE ELA NÃO FAZ, e a ausência é a regra: não apaga. Uma despesa já
// classificada aponta para o item; apagar deixaria o Painel com uma linha órfã.
// Desativar tira o item das escolhas e mantém o que já foi lançado.
//
// NADA NASCE SEMEADO (Q-CONTAPAGAR-01 c): o vazio oferece «Começar com o plano
// da planilha», um clique, e só então os itens existem.
//
// Tipo de despesa, recorrência e forma de pagamento NÃO são cadastro aqui: a
// projeção depende do significado de cada um, e um item renomeado mudaria a conta.
// Eles aparecem embaixo, como referência.

import { useState } from 'react';
import {
  api, type CadastrosDaEmpresa, type CategoriaDaEmpresa, type OrigemDePagamento, type TipoDeOrigem,
} from '../api.ts';
import { useAcao, useDados, type Acao } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, Escolha, BotaoDeIcone, Marca, Carregando, Interruptor, linha,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { SELO_DO_CADASTRO } from '../tom-do-estado.ts';
import {
  ROTULO_DA_NATUREZA, ROTULO_DA_RECORRENCIA, ROTULO_DO_TIPO_DE_ORIGEM,
} from '../despesas-regras.ts';
import { ROTULO_DA_FORMA } from '../contas-regras.ts';

const OPCOES_DE_TIPO = (Object.keys(ROTULO_DO_TIPO_DE_ORIGEM) as TipoDeOrigem[])
  .map((valor) => ({ valor, texto: ROTULO_DO_TIPO_DE_ORIGEM[valor] }));

export function TelaPlanoDeContas() {
  const carga = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const acao = useAcao();
  const dados = carga.dado;
  const categorias = dados?.categorias ?? [];
  const origens = dados?.origens ?? [];
  const vazio = dados !== null && categorias.length === 0 && origens.length === 0;

  async function comecar() {
    const ok = await acao.executar(() => api.post('/plano-de-contas/planilha', {}));
    if (ok) { acao.anunciar('O plano da planilha entrou: 12 itens e a Conta PJ G3 Solar.'); carga.recarregar(); }
  }

  return (
    <Pagina titulo="Plano de contas"
            sub="Onde cada despesa da empresa se classifica, e de onde sai o dinheiro.">
      {carga.erro && <Aviso tipo="erro">Não foi possível ler o plano de contas: {carga.erro}.</Aviso>}
      {carga.carregando && <Carregando />}
      <RetornoDoAto texto={acao.sucesso} />
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}

      {vazio && (
        <section className="cartao pc-vazio">
          <h2>Comece pelo plano que a empresa já usa</h2>
          <p>
            A planilha <em>G3Solar_Financeiro</em> tem 12 itens de plano de contas — de Despesas
            Administrativas a Outras Despesas — e a Conta PJ G3 Solar como origem. Um clique e eles
            passam a valer aqui; depois é renomear, reordenar ou desativar o que não servir.
          </p>
          <div style={linha}>
            <button type="button" className="primario" disabled={acao.ocupado} onClick={comecar}>
              Começar com o plano da planilha
            </button>
          </div>
          <p className="sub">Os adiantamentos de sócio não entram sozinhos: escreva o nome de cada sócio em «De onde sai o dinheiro».</p>
        </section>
      )}

      {dados && (
        <div className="pc-colunas">
          <ListaDoPlano categorias={categorias} acao={acao} aoMudar={carga.recarregar} />
          <ListaDeOrigens origens={origens} acao={acao} aoMudar={carga.recarregar} />
        </div>
      )}

      {dados && (
        <section className="pc-fixas">
          <h2>Listas fixas</h2>
          <p className="sub">
            Não mudam por cadastro, porque a projeção conta com o significado de cada uma.
          </p>
          <dl>
            <dt>Tipo de despesa</dt><dd>{Object.values(ROTULO_DA_NATUREZA).join(' · ')}</dd>
            <dt>Recorrência</dt><dd>{Object.values(ROTULO_DA_RECORRENCIA).join(' · ')}</dd>
            <dt>Forma de pagamento</dt><dd>{Object.values(ROTULO_DA_FORMA).join(' · ')}</dd>
          </dl>
          <p className="sub">Para lançar uma despesa com estas escolhas, abra <Ligacao para="/despesas">Despesas</Ligacao>.</p>
        </section>
      )}
    </Pagina>
  );
}

// ------------------------------------------------------ o plano

function ListaDoPlano(p: { categorias: readonly CategoriaDaEmpresa[]; acao: Acao; aoMudar: () => void }) {
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const ordenadas = [...p.categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));

  async function criar() {
    const ok = await p.acao.executar(() => api.post('/categorias', { nome: novo }));
    if (ok) { p.acao.anunciar(`«${novo.trim()}» entrou no plano de contas.`); setNovo(''); p.aoMudar(); }
  }

  async function mover(i: number, para: number) {
    const ids = ordenadas.map((c) => c.id);
    const [c] = ids.splice(i, 1);
    ids.splice(para, 0, c!);
    const ok = await p.acao.executar(() => api.put('/plano-de-contas/categorias/ordem', { ids }));
    if (ok) p.aoMudar();
  }

  async function salvarNome(c: CategoriaDaEmpresa) {
    const ok = await p.acao.executar(() => api.patch(`/plano-de-contas/categorias/${c.id}`, { nome }));
    if (ok) { p.acao.anunciar(`Renomeado para «${nome.trim()}».`); setEditando(null); p.aoMudar(); }
  }

  async function alternar(c: CategoriaDaEmpresa, ativo: boolean) {
    const ok = await p.acao.executar(() => api.patch(`/plano-de-contas/categorias/${c.id}`, { ativo }));
    if (ok) p.aoMudar();
  }

  return (
    <section className="cartao pc-lista" aria-labelledby="pc-plano">
      <h2 id="pc-plano">Plano de contas</h2>
      <p className="sub">A ordem daqui é a do Painel e da Projeção.</p>
      <Tabela cartoes="estreita"
              cabecalho={<><th>Ordem</th><th>Nome</th><th>Situação</th><th><span className="so-leitor">Ações</span></th></>}
              vazio="Nenhum item ainda.">
        {ordenadas.map((c, i) => (
          <tr key={c.id} className={c.ativo ? undefined : 'pc-desativada'}>
            <td className="pc-ordem">
              <BotaoDeIcone icone="subir" rotulo={`Subir «${c.nome}»`} desabilitado={i === 0 || p.acao.ocupado}
                            ao={() => mover(i, i - 1)} />
              <BotaoDeIcone icone="descer" rotulo={`Descer «${c.nome}»`}
                            desabilitado={i === ordenadas.length - 1 || p.acao.ocupado} ao={() => mover(i, i + 1)} />
            </td>
            <td>
              {editando === c.id ? (
                <div style={linha}>
                  <Campo rotulo={`Novo nome de «${c.nome}»`} valor={nome} ao={setNome} />
                  <button type="button" className="primario" disabled={p.acao.ocupado || !nome.trim()}
                          onClick={() => salvarNome(c)}>Salvar</button>
                  <button type="button" className="discreto" onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              ) : (
                <button type="button" className="discreto pc-nome" title="Renomear"
                        onClick={() => { setEditando(c.id); setNome(c.nome); }}>
                  {c.nome}
                </button>
              )}
            </td>
            <td><Marca selo={SELO_DO_CADASTRO[c.ativo ? 'ativo' : 'inativo']}>{c.ativo ? 'Ativo' : 'Desativado'}</Marca></td>
            <td>
              <Interruptor ligado={c.ativo} ao={(v) => alternar(c, v)} rotulo=""
                           rotuloAcessivel={`${c.ativo ? 'Desativar' : 'Ativar'} «${c.nome}»`}
                           desabilitado={p.acao.ocupado} />
            </td>
          </tr>
        ))}
      </Tabela>
      <form className="pc-novo" onSubmit={(e) => { e.preventDefault(); if (novo.trim()) criar(); }}>
        <Campo rotulo="Novo item do plano" valor={novo} ao={setNovo} dica="Ex.: Seguros" />
        <button type="submit" disabled={p.acao.ocupado || !novo.trim()}>Acrescentar</button>
      </form>
    </section>
  );
}

// ------------------------------------------------------ as origens

function ListaDeOrigens(p: { origens: readonly OrigemDePagamento[]; acao: Acao; aoMudar: () => void }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoDeOrigem>('conta_bancaria');

  async function criar() {
    const ok = await p.acao.executar(() => api.post('/plano-de-contas/origens', { nome, tipo }));
    if (ok) { p.acao.anunciar(`«${nome.trim()}» entrou como origem.`); setNome(''); p.aoMudar(); }
  }

  async function alterar(o: OrigemDePagamento, corpo: { ativo?: boolean; tipo?: TipoDeOrigem }) {
    const ok = await p.acao.executar(() => api.patch(`/plano-de-contas/origens/${o.id}`, corpo));
    if (ok) p.aoMudar();
  }

  return (
    <section className="cartao pc-lista" aria-labelledby="pc-origens">
      <h2 id="pc-origens">De onde sai o dinheiro</h2>
      <p className="sub">
        A conta da empresa, ou o sócio que pagou do bolso e a quem a empresa fica devendo.
      </p>
      <Tabela cartoes="estreita"
              cabecalho={<><th>Nome</th><th>Tipo</th><th>Situação</th><th><span className="so-leitor">Ações</span></th></>}
              vazio="Nenhuma origem ainda.">
        {p.origens.map((o) => (
          <tr key={o.id} className={o.ativo ? undefined : 'pc-desativada'}>
            <td>{o.nome}</td>
            <td>
              <Escolha valor={o.tipo} rotuloAcessivel={`Tipo de «${o.nome}»`} opcoes={OPCOES_DE_TIPO}
                       desabilitado={p.acao.ocupado} ao={(v) => alterar(o, { tipo: v as TipoDeOrigem })} />
            </td>
            <td><Marca selo={SELO_DO_CADASTRO[o.ativo ? 'ativo' : 'inativo']}>{o.ativo ? 'Ativa' : 'Desativada'}</Marca></td>
            <td>
              <Interruptor ligado={o.ativo} ao={(v) => alterar(o, { ativo: v })} rotulo=""
                           rotuloAcessivel={`${o.ativo ? 'Desativar' : 'Ativar'} «${o.nome}»`}
                           desabilitado={p.acao.ocupado} />
            </td>
          </tr>
        ))}
      </Tabela>
      <form className="pc-novo" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) criar(); }}>
        <Campo rotulo="Nova origem" valor={nome} ao={setNome} dica="Ex.: Adiantamento — Ana" />
        <Escolha valor={tipo} rotuloAcessivel="Tipo da nova origem" opcoes={OPCOES_DE_TIPO}
                 ao={(v) => setTipo(v as TipoDeOrigem)} />
        <button type="submit" disabled={p.acao.ocupado || !nome.trim()}>Acrescentar</button>
      </form>
    </section>
  );
}
