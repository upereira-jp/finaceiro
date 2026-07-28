import { useState } from 'react';
import { api, type Cliente } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Campo, linha } from '../ui.tsx';

export function TelaClientes() {
  const lista = useDados<Cliente[]>(() => api.get('/clientes?limite=500'));
  const acao = useAcao();
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');

  async function criar() {
    // `documento_bruto` e opcional no cliente (o indice e parcial), ao contrario
    // de originador e dono de usina, onde a coluna e NOT NULL.
    const ok = await acao.executar(() => api.post('/clientes', {
      nome: nome.trim(), documento_bruto: doc.trim() || undefined, documento_origem: 'coleta_local',
    }));
    if (ok) { setNome(''); setDoc(''); acao.anunciar('cliente cadastrado'); lista.recarregar(); }
  }

  return (
    <Pagina titulo="Clientes" sub="Espelhados do CRM pelo conector, e cadastráveis aqui quando não vierem de lá.">
      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="nome" valor={nome} ao={setNome} />
          <Campo rotulo="documento (CPF ou CNPJ)" valor={doc} ao={setDoc} dica="opcional" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={criar} disabled={acao.ocupado || !nome.trim()}>cadastrar</button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}
      <Tabela cabecalho={<><th>nome</th><th>documento</th><th>situação</th></>}
              vazio="nenhum cliente — rode `npm run ciclo -- --valendo` para espelhar do CRM">
        {(lista.dado ?? []).map((c) => (
          <tr key={c.id}>
            <td>{c.nome}</td>
            <td className="fraco">{c.documento ?? '—'}</td>
            <td><span className={`marca ${c.ativo ? 'ok' : 'pendente'}`}>{c.ativo ? 'ativo' : 'inativo'}</span></td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
