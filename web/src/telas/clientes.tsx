import { useState } from 'react';
import { api, type Cliente } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, Filtro, ThOrd, Marca, Icone,
  useOrdenacao, ordenar, contem,
} from '../ui.tsx';

/** As duas situações de cliente, para o filtro e para a pílula. */
const SITUACOES = [
  { valor: '', texto: 'Todas as situações' },
  { valor: 'ativo', texto: 'Ativos' },
  { valor: 'inativo', texto: 'Inativos' },
];

export function TelaClientes() {
  /*
   * O ESCOPO E DA CARTEIRA ATIVA, e e ele que decide o que a rota devolve.
   *
   * `carteira_ativa` (padrao) = so quem tem UC na etapa `Desconto Ativo` do
   * funil `Rateio` - 29 em producao. `todos` = o cadastro inteiro, 86, e existe
   * para que cliente criado a mao nao fique inalcancavel.
   */
  const [escopo, setEscopo] = useState<'carteira_ativa' | 'todos'>('carteira_ativa');
  const lista = useDados<Cliente[]>(
    () => api.get(`/clientes?limite=500${escopo === 'todos' ? '&escopo=todos' : ''}`),
    [escopo],
  );
  const acao = useAcao();
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');

  const [busca, setBusca] = useState('');
  /*
   * O FILTRO DE SITUACAO ABRE VAZIO DE NOVO, e agora isso esta certo.
   *
   * Ele passou a "Ativos" mais cedo em 04/08 para tirar da tela as 41 vitimas
   * de merge. Depois o recorte subiu para o SERVIDOR - a rota devolve so a
   * carteira ativa -, e nenhuma vitima de merge chega mais ate aqui. Manter o
   * filtro pre-aplicado esconderia, dentro das 29, uma que alguem tivesse
   * desativado a mao: duas peneiras empilhadas para o mesmo proposito, e a
   * segunda invisivel.
   */
  const [situacao, setSituacao] = useState('');
  const { ordem, alternar } = useOrdenacao('nome');

  const todos = lista.dado ?? [];
  const visiveis = ordenar(
    todos.filter((c) =>
      (contem(c.nome, busca) || contem(c.documento, busca)) &&
      (!situacao || (situacao === 'ativo') === c.ativo)),
    ordem,
    { nome: (c) => c.nome, documento: (c) => c.documento, situacao: (c) => (c.ativo ? 0 : 1) },
  );

  async function criar() {
    // `documento_bruto` e opcional no cliente (o indice e parcial), ao contrario
    // de originador e dono de usina, onde a coluna e NOT NULL.
    const ok = await acao.executar(() => api.post('/clientes', {
      nome: nome.trim(), documento_bruto: doc.trim() || undefined, documento_origem: 'coleta_local',
    }));
    if (ok) { setNome(''); setDoc(''); acao.anunciar('Cliente cadastrado.'); lista.recarregar(); }
  }

  return (
    <Pagina titulo="Clientes"
            sub="A carteira ativa: quem tem unidade consumidora na etapa Desconto Ativo do funil Rateio. O cadastro inteiro está em «Todo o cadastro», e inclui quem o CRM fundiu.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="Nome" valor={nome} ao={setNome} />
          <Campo rotulo="Documento (CPF ou CNPJ)" valor={doc} ao={setDoc} dica="Opcional" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={criar} disabled={acao.ocupado || !nome.trim()}>
              <Icone nome="acrescentar" tamanho={15} peso="bold" /> Cadastrar
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}

      <Ferramentas contagem={todos.length
        ? `${visiveis.length} de ${todos.length}${escopo === 'carteira_ativa' ? ' na carteira ativa' : ' no cadastro'}`
        : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por nome ou documento…" />
        <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação" opcoes={SITUACOES} />
        {/* O ESCOPO E O RECORTE DO SERVIDOR, e nao mais um filtro de tela: trocar
            aqui muda a CONSULTA. Fica ao lado dos outros para quem opera nao ter
            de saber a diferenca - e o rotulo diz o que cada um traz. */}
        <Filtro valor={escopo} ao={(v) => setEscopo(v as 'carteira_ativa' | 'todos')}
                rotulo="Escopo da lista"
                opcoes={[{ valor: 'carteira_ativa', texto: 'Carteira ativa' },
                         { valor: 'todos', texto: 'Todo o cadastro' }]} />
        {(busca || situacao) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="nome" ordem={ordem} ao={alternar}>Nome</ThOrd>
                <ThOrd chave="documento" ordem={ordem} ao={alternar}>Documento</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
              </>}
              vazio={todos.length
                ? 'Nenhum cliente corresponde à busca ou aos filtros.'
                : <>Nenhum cliente — rode <code>npm run ciclo -- --valendo</code> para espelhar do CRM.</>}>
        {visiveis.map((c) => (
          <tr key={c.id}>
            <td>{c.nome}</td>
            <td className="fraco">{c.documento ?? '—'}</td>
            <td><Marca tom={c.ativo ? 'ok' : 'pendente'}>{c.ativo ? 'Ativo' : 'Inativo'}</Marca></td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
