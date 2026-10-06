// PLANO DE CONTAS — a aba «Cadastros» da planilha `G3Solar_Financeiro.xlsx`.
//
// POR QUE ESTA TELA EXISTE: a tabela `categoria` existia desde 03/08/2026,
// vazia e sem tela; Despesas, Painel e Projeção agrupam por ela. A planilha
// trouxe a lista que a G3 usa (12 itens) e a origem do dinheiro (Conta PJ e os
// adiantamentos de sócio), e é aqui que as duas passam a morar.
//
// EM 06/10/2026 (etapa 1 do controle total, migration 44) ela ganhou o resto do
// chão da empresa:
//   - o 2º NÍVEL: os 12 itens da planilha são os grupos, e embaixo de cada um
//     entram subcategorias — à mão, ou com «Ampliar com as subcategorias
//     sugeridas» (tudo o que uma empresa como a G3 pode gastar, para riscar);
//   - a NATUREZA do grupo: despesa, investimento ou retirada de sócio — os dois
//     últimos saem do caixa e não são despesa (o DRE da etapa 4 os deixa fora);
//   - os CENTROS DE CUSTO, o «onde» do gasto, ao lado do plano, que é o «o quê»;
//   - nas origens, renomear, ordenar, e o banco, a agência e SÓ o final da conta.
//
// O QUE ELA NÃO FAZ, e a ausência é a regra: não apaga. Uma despesa já
// classificada aponta para o item; apagar deixaria o Painel com uma linha órfã.
// Desativar tira o item das escolhas e mantém o que já foi lançado.
//
// NADA NASCE SEMEADO (Q-CONTAPAGAR-01 c): o vazio oferece «Começar com o plano
// da planilha», um clique, e só então os itens existem.

import { useState } from 'react';
import {
  api, type CadastrosDaEmpresa, type CategoriaDaEmpresa, type CentroDeCusto, type NaturezaDaCategoria,
  type OrigemDePagamento, type TipoDeOrigem,
} from '../api.ts';
import { useAcao, useDados, type Acao } from '../dados.ts';
import {
  Pagina, Aviso, RetornoDoAto, Tabela, Campo, Escolha, BotaoDeIcone, Marca, Carregando, Interruptor, linha,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { SELO_DO_CADASTRO } from '../tom-do-estado.ts';
import {
  ROTULO_DA_NATUREZA, ROTULO_DA_RECORRENCIA, ROTULO_DO_TIPO_DE_ORIGEM, ROTULO_DA_NATUREZA_DA_CATEGORIA,
  gruposDoPlano, subcategoriasDe, foraDoResultado,
} from '../despesas-regras.ts';
import { ROTULO_DA_FORMA } from '../contas-regras.ts';

const OPCOES_DE_TIPO = (Object.keys(ROTULO_DO_TIPO_DE_ORIGEM) as TipoDeOrigem[])
  .map((valor) => ({ valor, texto: ROTULO_DO_TIPO_DE_ORIGEM[valor] }));
const OPCOES_DE_NATUREZA = (Object.keys(ROTULO_DA_NATUREZA_DA_CATEGORIA) as NaturezaDaCategoria[])
  .map((valor) => ({ valor, texto: ROTULO_DA_NATUREZA_DA_CATEGORIA[valor] }));

/** Troca a posição `i` pela `para` numa lista de ids — a ordem nova, inteira. */
function movido(ids: string[], i: number, para: number): string[] {
  const novo = [...ids];
  const [x] = novo.splice(i, 1);
  novo.splice(para, 0, x!);
  return novo;
}

export function TelaPlanoDeContas() {
  const carga = useDados<CadastrosDaEmpresa>(() => api.get('/plano-de-contas'));
  const acao = useAcao();
  const dados = carga.dado;
  const categorias = dados?.categorias ?? [];
  const origens = dados?.origens ?? [];
  const centros = dados?.centros ?? [];
  const vazio = dados !== null && categorias.length === 0 && origens.length === 0;

  async function comecar() {
    const ok = await acao.executar(() => api.post('/plano-de-contas/planilha', {}));
    if (ok) { acao.anunciar('O plano da planilha entrou: 12 itens, a Conta PJ G3 Solar e os sócios Vinicius Leal e Renata Estevam.'); carga.recarregar(); }
  }

  return (
    <Pagina titulo="Plano de contas"
            sub="Onde cada gasto da empresa se classifica (o quê e onde), e de onde sai o dinheiro.">
      {carga.erro && <Aviso tipo="erro">Não foi possível ler o plano de contas: {carga.erro}.</Aviso>}
      {carga.carregando && <Carregando />}
      <RetornoDoAto texto={acao.sucesso} />
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}

      {vazio && (
        <section className="cartao pc-vazio">
          <h2>Comece pelo plano que a empresa já usa</h2>
          <p>
            A planilha <em>G3Solar_Financeiro</em> tem 12 itens de plano de contas — de Despesas
            Administrativas a Outras Despesas. As origens são a Conta PJ G3 Solar e os sócios Vinicius Leal e
            Renata Estevam. Um clique e tudo passa a valer aqui; depois é renomear, reordenar ou desativar o
            que não servir.
          </p>
          <div style={linha}>
            <button type="button" className="primario" disabled={acao.ocupado} onClick={comecar}>
              Começar com o plano da planilha
            </button>
          </div>
          <p className="sub">Quando um sócio paga do bolso, a empresa passa a dever a ele — e o reembolso aparece em Despesas.</p>
        </section>
      )}

      {/* EMPILHADOS, na largura inteira (06/10/2026): lado a lado, a tabela do plano
          com a natureza e a das origens com banco e tipo não cabiam na metade da
          tela, e a situação e o interruptor ficavam cortados à direita. A ordem é a
          da pergunta: o quê (plano), onde (centro), de onde sai (origem). */}
      {dados && (
        <div className="pc-pilha">
          <ListaDoPlano categorias={categorias} acao={acao} aoMudar={carga.recarregar} />
          <ListaDeCentros centros={centros} acao={acao} aoMudar={carga.recarregar} />
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

// ------------------------------------------------------ o plano, em dois níveis

function ListaDoPlano(p: { categorias: readonly CategoriaDaEmpresa[]; acao: Acao; aoMudar: () => void }) {
  const [novo, setNovo] = useState('');
  const [natureza, setNatureza] = useState<NaturezaDaCategoria>('despesa');
  const [subDe, setSubDe] = useState<string | null>(null);
  const [nomeDaSub, setNomeDaSub] = useState('');
  const grupos = gruposDoPlano(p.categorias);
  const temSugeridas = p.categorias.some((c) => c.pai_id);

  async function criarGrupo() {
    const ok = await p.acao.executar(() => api.post('/categorias', { nome: novo, natureza }));
    if (ok) { p.acao.anunciar(`«${novo.trim()}» entrou no plano de contas.`); setNovo(''); setNatureza('despesa'); p.aoMudar(); }
  }

  async function criarSub(g: CategoriaDaEmpresa) {
    const ok = await p.acao.executar(() => api.post('/categorias', { nome: nomeDaSub, pai_id: g.id }));
    if (ok) { p.acao.anunciar(`«${nomeDaSub.trim()}» entrou em «${g.nome}».`); setNomeDaSub(''); setSubDe(null); p.aoMudar(); }
  }

  async function ampliar() {
    let r: { subcategorias_criadas: number; grupos_criados: number; grupos_que_faltam: string[] } | null = null;
    const ok = await p.acao.executar(async () => { r = await api.post('/plano-de-contas/sugeridas', {}); });
    if (ok && r) {
      const x = r as { subcategorias_criadas: number; grupos_criados: number; grupos_que_faltam: string[] };
      p.acao.anunciar(x.subcategorias_criadas || x.grupos_criados
        ? `Entraram ${x.subcategorias_criadas} subcategorias${x.grupos_criados ? ` e ${x.grupos_criados} grupos fora do resultado (Investimentos, Retiradas dos sócios)` : ''}. Desative o que não servir.`
          + (x.grupos_que_faltam.length ? ` Sem grupo com o nome da planilha, ficaram de fora as de: ${x.grupos_que_faltam.join(', ')}.` : '')
        : 'As sugeridas já estavam todas no plano.');
      p.aoMudar();
    }
  }

  return (
    <section className="cartao pc-lista" aria-labelledby="pc-plano">
      <h2 id="pc-plano">Plano de contas</h2>
      <p className="sub">
        Os grupos e, embaixo, as subcategorias. A ordem daqui é a do Painel e da Projeção, que somam a
        subcategoria no grupo dela.
      </p>
      <Tabela cartoes="estreita"
              cabecalho={<><th>Ordem</th><th>Nome</th><th>Natureza</th><th>Situação</th><th><span className="so-leitor">Ações</span></th></>}
              vazio="Nenhum item ainda.">
        {grupos.flatMap((g, i) => {
          const subs = subcategoriasDe(g.id, p.categorias);
          return [
            <LinhaDoPlano key={g.id} c={g} indice={i} irmaos={grupos} acao={p.acao} aoMudar={p.aoMudar}
                          aoAcrescentar={() => { setSubDe(subDe === g.id ? null : g.id); setNomeDaSub(''); }}
                          acrescentando={subDe === g.id} />,
            ...subs.map((s, j) => (
              <LinhaDoPlano key={s.id} c={s} indice={j} irmaos={subs} acao={p.acao} aoMudar={p.aoMudar} grupo={g} />
            )),
            ...(subDe === g.id ? [
              <tr key={`${g.id}-nova`} className="pc-sub">
                <td />
                <td colSpan={4}>
                  <form className="pc-novo pc-novo-sub" onSubmit={(e) => { e.preventDefault(); if (nomeDaSub.trim()) void criarSub(g); }}>
                    <Campo rotulo={`Nova subcategoria em «${g.nome}»`} valor={nomeDaSub} ao={setNomeDaSub} dica="Ex.: Aluguel e condomínio" />
                    <button type="submit" disabled={p.acao.ocupado || !nomeDaSub.trim()}>Acrescentar</button>
                    <button type="button" className="discreto" onClick={() => setSubDe(null)}>Fechar</button>
                  </form>
                </td>
              </tr>,
            ] : []),
          ];
        })}
      </Tabela>
      <form className="pc-novo" onSubmit={(e) => { e.preventDefault(); if (novo.trim()) void criarGrupo(); }}>
        <Campo rotulo="Novo grupo do plano" valor={novo} ao={setNovo} dica="Ex.: Seguros" />
        <Campo rotulo="Natureza" valor={natureza} ao={(v) => setNatureza((v || 'despesa') as NaturezaDaCategoria)} opcoes={OPCOES_DE_NATUREZA} />
        <button type="submit" disabled={p.acao.ocupado || !novo.trim()}>Acrescentar</button>
      </form>
      {grupos.length > 0 && (
        <div className="pc-sugeridas">
          <p className="sub">
            {temSugeridas
              ? 'As subcategorias sugeridas cobrem o que uma empresa como a G3 pode gastar — pessoal, impostos, usinas, veículos, cartão. Rodar de novo só acrescenta o que faltar.'
              : 'Quer o 2º nível pronto? As sugeridas penduram ~80 subcategorias nos 12 grupos (aluguel, IPTU, salários, FGTS, limpeza de módulos, combustível…) e criam Investimentos e Retiradas dos sócios, que saem do caixa sem ser despesa. O que não servir, desative.'}
          </p>
          <button type="button" disabled={p.acao.ocupado} onClick={() => void ampliar()}>
            Ampliar com as subcategorias sugeridas
          </button>
        </div>
      )}
    </section>
  );
}

function LinhaDoPlano(p: {
  c: CategoriaDaEmpresa; indice: number; irmaos: readonly CategoriaDaEmpresa[]; acao: Acao; aoMudar: () => void;
  /** Preenchido na SUBCATEGORIA: o grupo dela. */
  grupo?: CategoriaDaEmpresa;
  aoAcrescentar?: () => void; acrescentando?: boolean;
}) {
  const { c } = p;
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(c.nome);

  async function mover(para: number) {
    const ids = movido(p.irmaos.map((x) => x.id), p.indice, para);
    const ok = await p.acao.executar(() => api.put('/plano-de-contas/categorias/ordem', { ids }));
    if (ok) p.aoMudar();
  }
  async function alterar(corpo: Record<string, unknown>, frase?: string) {
    const ok = await p.acao.executar(() => api.patch(`/plano-de-contas/categorias/${c.id}`, corpo));
    if (ok) { if (frase) p.acao.anunciar(frase); setEditando(false); p.aoMudar(); }
  }

  const rotuloDoItem = p.grupo ? `«${c.nome}» (em ${p.grupo.nome})` : `«${c.nome}»`;
  return (
    <tr className={[p.grupo ? 'pc-sub' : 'pc-grupo', c.ativo ? '' : 'pc-desativada'].filter(Boolean).join(' ')}>
      <td className="pc-ordem">
        <BotaoDeIcone icone="subir" rotulo={`Subir ${rotuloDoItem}`} desabilitado={p.indice === 0 || p.acao.ocupado}
                      ao={() => mover(p.indice - 1)} />
        <BotaoDeIcone icone="descer" rotulo={`Descer ${rotuloDoItem}`}
                      desabilitado={p.indice === p.irmaos.length - 1 || p.acao.ocupado} ao={() => mover(p.indice + 1)} />
      </td>
      <td>
        {editando ? (
          <div style={linha}>
            <Campo rotulo={`Novo nome de «${c.nome}»`} valor={nome} ao={setNome} />
            <button type="button" className="primario" disabled={p.acao.ocupado || !nome.trim()}
                    onClick={() => alterar({ nome }, `Renomeado para «${nome.trim()}».`)}>Salvar</button>
            <button type="button" className="discreto" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        ) : (
          <>
            <button type="button" className="discreto pc-nome" title="Renomear"
                    onClick={() => { setEditando(true); setNome(c.nome); }}>
              {c.nome}
            </button>
            {!p.grupo && p.aoAcrescentar && (
              <button type="button" className="discreto pc-acrescentar" aria-expanded={p.acrescentando}
                      onClick={p.aoAcrescentar}>
                + subcategoria
              </button>
            )}
          </>
        )}
      </td>
      <td>
        {p.grupo
          ? <span className="sub">a do grupo</span>
          : <Escolha valor={c.natureza ?? 'despesa'} rotuloAcessivel={`Natureza de «${c.nome}»`} opcoes={OPCOES_DE_NATUREZA}
                     desabilitado={p.acao.ocupado}
                     ao={(v) => alterar({ natureza: v }, foraDoResultado(v as NaturezaDaCategoria)
                       ? `«${c.nome}» e as subcategorias dele saem do resultado: saída de caixa que não é despesa.`
                       : `«${c.nome}» volta a contar como despesa.`)} />}
      </td>
      <td><Marca selo={SELO_DO_CADASTRO[c.ativo ? 'ativo' : 'inativo']}>{c.ativo ? 'Ativo' : 'Desativado'}</Marca></td>
      <td>
        <Interruptor ligado={c.ativo} ao={(v) => alterar({ ativo: v })} rotulo=""
                     rotuloAcessivel={`${c.ativo ? 'Desativar' : 'Ativar'} ${rotuloDoItem}`}
                     desabilitado={p.acao.ocupado} />
      </td>
    </tr>
  );
}

// ------------------------------------------------------ os centros de custo

function ListaDeCentros(p: { centros: readonly CentroDeCusto[]; acao: Acao; aoMudar: () => void }) {
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const ordenados = [...p.centros].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));

  async function criar() {
    const ok = await p.acao.executar(() => api.post('/plano-de-contas/centros', { nome: novo }));
    if (ok) { p.acao.anunciar(`«${novo.trim()}» entrou nos centros de custo.`); setNovo(''); p.aoMudar(); }
  }
  async function mover(i: number, para: number) {
    const ok = await p.acao.executar(() => api.put('/plano-de-contas/centros/ordem', { ids: movido(ordenados.map((c) => c.id), i, para) }));
    if (ok) p.aoMudar();
  }
  async function alterar(c: CentroDeCusto, corpo: { nome?: string; ativo?: boolean }) {
    const ok = await p.acao.executar(() => api.patch(`/plano-de-contas/centros/${c.id}`, corpo));
    if (ok) { if (corpo.nome) p.acao.anunciar(`Renomeado para «${corpo.nome.trim()}».`); setEditando(null); p.aoMudar(); }
  }

  return (
    <section className="cartao pc-lista" aria-labelledby="pc-centros">
      <h2 id="pc-centros">Centros de custo</h2>
      <p className="sub">
        Onde o gasto acontece — Administrativo, Comercial, Operação das usinas. O plano diz o quê; o centro diz onde.
      </p>
      <Tabela cartoes="estreita"
              cabecalho={<><th>Ordem</th><th>Nome</th><th>Situação</th><th><span className="so-leitor">Ações</span></th></>}
              vazio="Nenhum centro ainda. Comece pelos que a empresa usa para separar o que gasta.">
        {ordenados.map((c, i) => (
          <tr key={c.id} className={c.ativo ? undefined : 'pc-desativada'}>
            <td className="pc-ordem">
              <BotaoDeIcone icone="subir" rotulo={`Subir «${c.nome}»`} desabilitado={i === 0 || p.acao.ocupado} ao={() => mover(i, i - 1)} />
              <BotaoDeIcone icone="descer" rotulo={`Descer «${c.nome}»`} desabilitado={i === ordenados.length - 1 || p.acao.ocupado}
                            ao={() => mover(i, i + 1)} />
            </td>
            <td>
              {editando === c.id ? (
                <div style={linha}>
                  <Campo rotulo={`Novo nome de «${c.nome}»`} valor={nome} ao={setNome} />
                  <button type="button" className="primario" disabled={p.acao.ocupado || !nome.trim()}
                          onClick={() => alterar(c, { nome })}>Salvar</button>
                  <button type="button" className="discreto" onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              ) : (
                <button type="button" className="discreto pc-nome" title="Renomear"
                        onClick={() => { setEditando(c.id); setNome(c.nome); }}>{c.nome}</button>
              )}
            </td>
            <td><Marca selo={SELO_DO_CADASTRO[c.ativo ? 'ativo' : 'inativo']}>{c.ativo ? 'Ativo' : 'Desativado'}</Marca></td>
            <td>
              <Interruptor ligado={c.ativo} ao={(v) => alterar(c, { ativo: v })} rotulo=""
                           rotuloAcessivel={`${c.ativo ? 'Desativar' : 'Ativar'} «${c.nome}»`} desabilitado={p.acao.ocupado} />
            </td>
          </tr>
        ))}
      </Tabela>
      <form className="pc-novo" onSubmit={(e) => { e.preventDefault(); if (novo.trim()) void criar(); }}>
        <Campo rotulo="Novo centro de custo" valor={novo} ao={setNovo} dica="Ex.: Operação das usinas" />
        <button type="submit" disabled={p.acao.ocupado || !novo.trim()}>Acrescentar</button>
      </form>
    </section>
  );
}

// ------------------------------------------------------ as origens

/** «Sicoob · ag. 3069 · conta final 0123», ou nada. Só o final: o número inteiro não fica no sistema. */
export const descricaoDaConta = (o: Pick<OrigemDePagamento, 'banco' | 'agencia' | 'conta_final'>): string =>
  [o.banco, o.agencia && `ag. ${o.agencia}`, o.conta_final && `conta final ${o.conta_final}`].filter(Boolean).join(' · ');

function ListaDeOrigens(p: { origens: readonly OrigemDePagamento[]; acao: Acao; aoMudar: () => void }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoDeOrigem>('conta_bancaria');
  const ordenadas = [...p.origens].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));

  async function criar() {
    const ok = await p.acao.executar(() => api.post('/plano-de-contas/origens', { nome, tipo }));
    if (ok) { p.acao.anunciar(`«${nome.trim()}» entrou como origem.`); setNome(''); p.aoMudar(); }
  }
  async function mover(i: number, para: number) {
    const ok = await p.acao.executar(() => api.put('/plano-de-contas/origens/ordem', { ids: movido(ordenadas.map((o) => o.id), i, para) }));
    if (ok) p.aoMudar();
  }

  return (
    <section className="cartao pc-lista" aria-labelledby="pc-origens">
      <h2 id="pc-origens">De onde sai o dinheiro</h2>
      <p className="sub">
        A conta da empresa, ou o sócio que pagou do bolso. O que sai do bolso de um sócio vira dívida da
        empresa com ele, em «Devido aos sócios», na tela Despesas. Da conta, guarda-se só o final.
      </p>
      <Tabela cartoes="estreita"
              cabecalho={<><th>Ordem</th><th>Nome</th><th>Tipo</th><th>Situação</th><th><span className="so-leitor">Ações</span></th></>}
              vazio="Nenhuma origem ainda.">
        {ordenadas.map((o, i) => (
          <LinhaDaOrigem key={o.id} o={o} indice={i} total={ordenadas.length} acao={p.acao} aoMudar={p.aoMudar}
                         aoMover={(para) => mover(i, para)} />
        ))}
      </Tabela>
      <form className="pc-novo" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) void criar(); }}>
        <Campo rotulo="Nova origem" valor={nome} ao={setNome} dica="Ex.: Conta Sicoob" />
        <Escolha valor={tipo} rotuloAcessivel="Tipo da nova origem" opcoes={OPCOES_DE_TIPO}
                 ao={(v) => setTipo(v as TipoDeOrigem)} />
        <button type="submit" disabled={p.acao.ocupado || !nome.trim()}>Acrescentar</button>
      </form>
    </section>
  );
}

function LinhaDaOrigem(p: {
  o: OrigemDePagamento; indice: number; total: number; acao: Acao; aoMudar: () => void; aoMover: (para: number) => void;
}) {
  const { o } = p;
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: o.nome, banco: o.banco ?? '', agencia: o.agencia ?? '', conta_final: o.conta_final ?? '' });
  const conta = o.tipo === 'conta_bancaria';
  const finalErrado = !!f.conta_final && !/^\d{4}$/.test(f.conta_final);

  async function alterar(corpo: Record<string, unknown>, frase?: string) {
    const ok = await p.acao.executar(() => api.patch(`/plano-de-contas/origens/${o.id}`, corpo));
    if (ok) { if (frase) p.acao.anunciar(frase); setEditando(false); p.aoMudar(); }
  }

  return (
    <tr className={o.ativo ? undefined : 'pc-desativada'}>
      <td className="pc-ordem">
        <BotaoDeIcone icone="subir" rotulo={`Subir «${o.nome}»`} desabilitado={p.indice === 0 || p.acao.ocupado} ao={() => p.aoMover(p.indice - 1)} />
        <BotaoDeIcone icone="descer" rotulo={`Descer «${o.nome}»`} desabilitado={p.indice === p.total - 1 || p.acao.ocupado}
                      ao={() => p.aoMover(p.indice + 1)} />
      </td>
      <td>
        {editando ? (
          <form className="pc-origem-form" onSubmit={(e) => {
            e.preventDefault();
            if (!f.nome.trim() || finalErrado) return;
            void alterar(conta ? f : { nome: f.nome }, `«${f.nome.trim()}» foi atualizada.`);
          }}>
            <Campo rotulo="Nome" valor={f.nome} ao={(v) => setF((x) => ({ ...x, nome: v }))} />
            {conta && <>
              <Campo rotulo="Banco" valor={f.banco} ao={(v) => setF((x) => ({ ...x, banco: v }))} dica="Sicoob" />
              <Campo rotulo="Agência" valor={f.agencia} ao={(v) => setF((x) => ({ ...x, agencia: v }))} dica="3069" />
              <Campo rotulo="Final da conta (4 dígitos)" valor={f.conta_final} teclado={{ inputMode: 'numeric' }}
                     ao={(v) => setF((x) => ({ ...x, conta_final: v.replace(/\D/g, '').slice(0, 4) }))}
                     erro={finalErrado ? 'Os 4 últimos dígitos da conta — o número inteiro não fica no sistema.' : null} />
            </>}
            <div style={linha}>
              <button type="submit" className="primario" disabled={p.acao.ocupado || !f.nome.trim() || finalErrado}>Salvar</button>
              <button type="button" className="discreto" onClick={() => setEditando(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <button type="button" className="discreto pc-nome" title={conta ? 'Editar nome e conta' : 'Renomear'}
                    onClick={() => { setEditando(true); setF({ nome: o.nome, banco: o.banco ?? '', agencia: o.agencia ?? '', conta_final: o.conta_final ?? '' }); }}>
              {o.nome}
            </button>
            {conta && <div className="sub">{descricaoDaConta(o) || 'banco e final da conta: clique no nome'}</div>}
          </>
        )}
      </td>
      <td>
        <Escolha valor={o.tipo} rotuloAcessivel={`Tipo de «${o.nome}»`} opcoes={OPCOES_DE_TIPO}
                 desabilitado={p.acao.ocupado} ao={(v) => alterar({ tipo: v as TipoDeOrigem })} />
      </td>
      <td><Marca selo={SELO_DO_CADASTRO[o.ativo ? 'ativo' : 'inativo']}>{o.ativo ? 'Ativa' : 'Desativada'}</Marca></td>
      <td>
        <Interruptor ligado={o.ativo} ao={(v) => alterar({ ativo: v })} rotulo=""
                     rotuloAcessivel={`${o.ativo ? 'Desativar' : 'Ativar'} «${o.nome}»`}
                     desabilitado={p.acao.ocupado} />
      </td>
    </tr>
  );
}
