// USINAS: vincular o dono e abrir a vigencia de repasse.
//
// A REGRA DE REPASSE E VERSIONADA POR VIGENCIA, nunca editada no lugar (R25).
// Renegociar 70% para 65% hoje NAO reprecifica repasse ja pago - por isso a tela
// nao tem "editar percentual", so "abrir nova vigencia", e a anterior fecha na
// mesma transacao.

import { useState } from 'react';
import { api, type Usina, type DonoUsina, type RegraRepasse } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Campo } from '../ui.tsx';
import { decimalTexto } from '../dinheiro.ts';

export function TelaUsinas() {
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const donos = useDados<DonoUsina[]>(() => api.get('/donos-usina?ativo=true'));
  const acao = useAcao();
  const [sel, setSel] = useState('');
  const [pct, setPct] = useState('70,00');
  const [inicio, setInicio] = useState('2026-01-01');

  const repasses = useDados<RegraRepasse[]>(
    () => (sel ? api.get(`/usinas/${sel}/repasse`) : Promise.resolve([])), [sel]);

  async function vincular(usinaId: string, donoId: string) {
    const ok = await acao.executar(() => api.patch(`/usinas/${usinaId}`, { dono_usina_id: donoId || null }));
    if (ok) { acao.anunciar('dono vinculado'); usinas.recarregar(); }
  }

  async function abrirVigencia() {
    if (!sel) return;
    const ok = await acao.executar(() =>
      api.post(`/usinas/${sel}/repasse`, { percentual: decimalTexto(pct, 2), vigencia_inicio: inicio }));
    if (ok) { acao.anunciar('vigência aberta — a anterior foi fechada na mesma transação'); repasses.recarregar(); }
  }

  return (
    <Pagina titulo="Usinas"
            sub="Espelhadas do CRM. O dono e o percentual de repasse são locais — e os dois travam o split se faltarem.">
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      {usinas.erro && <Aviso tipo="erro">{usinas.erro}</Aviso>}

      <Tabela cabecalho={<><th>código</th><th>distribuidora</th><th>dono</th><th>situação</th></>}
              vazio="nenhuma usina espelhada">
        {(usinas.dado ?? []).map((u) => (
          <tr key={u.id}>
            <td><strong>{u.codigo_geradora}</strong> {u.apelido && <span className="fraco">· {u.apelido}</span>}</td>
            <td className="fraco">{u.distribuidora}</td>
            <td style={{ minWidth: 230 }}>
              <select value={u.dono_usina_id ?? ''} onChange={(e) => vincular(u.id, e.target.value)}
                      disabled={acao.ocupado}>
                <option value="">— sem dono (bloqueia o repasse)</option>
                {(donos.dado ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </td>
            <td><span className={`marca ${u.status === 'ativa' ? 'ok' : 'pendente'}`}>{u.status}</span></td>
          </tr>
        ))}
      </Tabela>

      <h2>Percentual de repasse, por vigência</h2>
      <div className="cartao">
        <div className="campos">
          <Campo rotulo="usina" valor={sel} ao={setSel}
                 opcoes={(usinas.dado ?? []).map((u) => ({ valor: u.id, texto: u.codigo_geradora }))} />
          <Campo rotulo="percentual" valor={pct} ao={setPct} dica="ex. 70,00" />
          <Campo rotulo="vigência a partir de" valor={inicio} ao={setInicio} tipo="date" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={abrirVigencia} disabled={acao.ocupado || !sel}>abrir vigência</button>
          </div>
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
          O percentual aplicado é o vigente <strong>na competência da fatura</strong>, não o corrente da usina (R25).
          Não há “editar”: abrir uma vigência nova fecha a anterior na mesma transação.
        </p>
      </div>

      {sel && (
        <Tabela cabecalho={<><th>percentual</th><th>início</th><th>fim</th></>} vazio="sem regra de repasse — o split levanta">
          {(repasses.dado ?? []).map((r) => (
            <tr key={r.id}>
              <td className="num">{r.percentual}%</td>
              <td className="fraco">{String(r.vigencia_inicio).slice(0, 10)}</td>
              <td className="fraco">{r.vigencia_fim ? String(r.vigencia_fim).slice(0, 10) : 'em aberto'}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}
