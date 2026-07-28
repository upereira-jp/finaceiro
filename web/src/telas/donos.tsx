// DONOS DE USINA — para quem vai o repasse, 70% do consumo.
//
// AUD-08: nulo em 3 de 3 usinas em producao. Nao impede faturar (a cobranca ao
// cliente nao depende disso), mas a R12 bloqueia o SPLIT inteiro quando a fatura
// for paga - e ai o repasse acumula sem destino. E por isso a tela existe antes
// da primeira liquidacao, e nao depois.

import { useState } from 'react';
import { api, type DonoUsina, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Campo } from '../ui.tsx';

export function TelaDonos() {
  const donos = useDados<DonoUsina[]>(() => api.get('/donos-usina'));
  const semDono = useDados<Usina[]>(() => api.get('/usinas-sem-dono'));
  const acao = useAcao();
  const [f, setF] = useState({ nome: '', natureza: 'pf', documento_bruto: '', chave_pix: '', email: '' });
  const p = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function criar() {
    const ok = await acao.executar(() => api.post('/donos-usina', {
      nome: f.nome.trim(), natureza: f.natureza, documento_bruto: f.documento_bruto.trim(),
      chave_pix: f.chave_pix.trim() || null, email: f.email.trim() || null,
    }));
    if (ok) {
      setF({ nome: '', natureza: 'pf', documento_bruto: '', chave_pix: '', email: '' });
      acao.anunciar('dono cadastrado — agora vincule-o à usina na tela Usinas');
      donos.recarregar(); semDono.recarregar();
    }
  }

  return (
    <Pagina titulo="Donos de usina"
            sub="O maior fluxo de dinheiro do sistema. Exige chave PIX ou conta completa — conferido no cadastro, porque no pagamento já é tarde.">
      {(semDono.dado?.length ?? 0) > 0 && (
        <Aviso tipo="erro">
          {semDono.dado!.length} usina(s) sem dono: {semDono.dado!.map((u) => u.codigo_geradora).join(', ')}.
          O repasse delas fica bloqueado pela R12 quando a primeira fatura for paga.
        </Aviso>
      )}

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div className="campos">
          <Campo rotulo="nome" valor={f.nome} ao={p('nome')} />
          <Campo rotulo="natureza" valor={f.natureza} ao={p('natureza')}
                 opcoes={[{ valor: 'pf', texto: 'pessoa física' }, { valor: 'pj', texto: 'pessoa jurídica' }]} />
          <Campo rotulo="documento" valor={f.documento_bruto} ao={p('documento_bruto')} dica="CPF ou CNPJ" />
          <Campo rotulo="chave PIX" valor={f.chave_pix} ao={p('chave_pix')} />
          <Campo rotulo="e-mail" valor={f.email} ao={p('email')} />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={criar}
                    disabled={acao.ocupado || !f.nome.trim() || !f.documento_bruto.trim()}>cadastrar</button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {donos.erro && <Aviso tipo="erro">{donos.erro}</Aviso>}
      <Tabela cabecalho={<><th>nome</th><th>documento</th><th>PIX</th><th>situação</th></>}
              vazio="nenhum dono cadastrado — AUD-08">
        {(donos.dado ?? []).map((d) => (
          <tr key={d.id}>
            <td>{d.nome} <span className="fraco">· {d.natureza}</span></td>
            <td className="fraco">{d.documento}</td>
            <td className="fraco">{d.chave_pix ?? d.banco ?? '—'}</td>
            <td><span className={`marca ${d.ativo ? 'ok' : 'pendente'}`}>{d.ativo ? 'ativo' : 'inativo'}</span></td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
