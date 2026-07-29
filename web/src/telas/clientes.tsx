import { useState } from 'react';
import { api, type Cliente } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, ThOrd,
  useOrdenacao, ordenar, contem,
} from '../ui.tsx';

export function TelaClientes() {
  const lista = useDados<Cliente[]>(() => api.get('/clientes?limite=500'));
  const acao = useAcao();
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');

  const [busca, setBusca] = useState('');
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
    <Pagina titulo="Clientes" sub="Espelhados do CRM pelo conector, e cadastráveis aqui quando não vierem de lá.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="Nome" valor={nome} ao={setNome} />
          <Campo rotulo="Documento (CPF ou CNPJ)" valor={doc} ao={setDoc} dica="Opcional" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={criar} disabled={acao.ocupado || !nome.trim()}>Cadastrar</button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}

      <Ferramentas contagem={todos.length ? `${visiveis.length} de ${todos.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por nome ou documento…" />
        <select value={situacao} aria-label="Filtrar por situação" onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
        {(busca || situacao) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); }}>Limpar filtros</button>
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
            <td><span className={`marca ${c.ativo ? 'ok' : 'pendente'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
