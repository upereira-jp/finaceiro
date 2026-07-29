// USINAS: vincular o dono e abrir a vigencia de repasse.
//
// A REGRA DE REPASSE E VERSIONADA POR VIGENCIA, nunca editada no lugar (R25).
// Renegociar 70% para 65% hoje NAO reprecifica repasse ja pago - por isso a tela
// nao tem "editar percentual", so "abrir nova vigencia", e a anterior fecha na
// mesma transacao.

import { useState } from 'react';
import { api, type Usina, type DonoUsina, type RegraRepasse } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Campo, Busca, Ferramentas, ThOrd,
  useOrdenacao, ordenar, contem, rotulo,
} from '../ui.tsx';
import { decimalTexto } from '../dinheiro.ts';

export function TelaUsinas() {
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const donos = useDados<DonoUsina[]>(() => api.get('/donos-usina?ativo=true'));
  const acao = useAcao();
  const [sel, setSel] = useState('');
  const [pct, setPct] = useState('70,00');
  const [inicio, setInicio] = useState('2026-01-01');

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [comDono, setComDono] = useState('');
  const { ordem, alternar } = useOrdenacao('codigo');

  const repasses = useDados<RegraRepasse[]>(
    () => (sel ? api.get(`/usinas/${sel}/repasse`) : Promise.resolve([])), [sel]);

  const nomeDono = (id: string | null) => donos.dado?.find((d) => d.id === id)?.nome ?? null;

  const todas = usinas.dado ?? [];
  const visiveis = ordenar(
    todas.filter((u) =>
      (contem(u.codigo_geradora, busca) || contem(u.apelido, busca) || contem(u.distribuidora, busca)) &&
      (!situacao || u.status === situacao) &&
      (!comDono || (comDono === 'com') === Boolean(u.dono_usina_id))),
    ordem,
    {
      codigo: (u) => u.codigo_geradora,
      distribuidora: (u) => u.distribuidora,
      dono: (u) => nomeDono(u.dono_usina_id),
      situacao: (u) => u.status,
    },
  );

  async function vincular(usinaId: string, donoId: string) {
    const ok = await acao.executar(() => api.patch(`/usinas/${usinaId}`, { dono_usina_id: donoId || null }));
    if (ok) { acao.anunciar('Dono vinculado.'); usinas.recarregar(); }
  }

  async function abrirVigencia() {
    if (!sel) return;
    const ok = await acao.executar(() =>
      api.post(`/usinas/${sel}/repasse`, { percentual: decimalTexto(pct, 2), vigencia_inicio: inicio }));
    if (ok) { acao.anunciar('Vigência aberta — a anterior foi fechada na mesma transação.'); repasses.recarregar(); }
  }

  return (
    <Pagina titulo="Usinas"
            sub="Espelhadas do CRM. O dono e o percentual de repasse são locais — e os dois travam o split se faltarem.">
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      {usinas.erro && <Aviso tipo="erro">{usinas.erro}</Aviso>}

      <Ferramentas contagem={todas.length ? `${visiveis.length} de ${todas.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por código, apelido ou distribuidora…" />
        <select value={situacao} aria-label="Filtrar por situação" onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="ativa">Ativas</option>
          <option value="inativa">Inativas</option>
        </select>
        <select value={comDono} aria-label="Filtrar por dono" onChange={(e) => setComDono(e.target.value)}>
          <option value="">Com e sem dono</option>
          <option value="com">Com dono</option>
          <option value="sem">Sem dono (bloqueia o repasse)</option>
        </select>
        {(busca || situacao || comDono) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); setComDono(''); }}>Limpar filtros</button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="codigo" ordem={ordem} ao={alternar}>Código</ThOrd>
                <ThOrd chave="distribuidora" ordem={ordem} ao={alternar}>Distribuidora</ThOrd>
                <ThOrd chave="dono" ordem={ordem} ao={alternar}>Dono</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
              </>}
              vazio={todas.length ? 'Nenhuma usina corresponde à busca ou aos filtros.' : 'Nenhuma usina espelhada.'}>
        {visiveis.map((u) => (
          <tr key={u.id}>
            <td><strong>{u.codigo_geradora}</strong> {u.apelido && <span className="fraco">· {u.apelido}</span>}</td>
            <td className="fraco">{u.distribuidora}</td>
            <td style={{ minWidth: 230 }}>
              <select value={u.dono_usina_id ?? ''} onChange={(e) => vincular(u.id, e.target.value)}
                      disabled={acao.ocupado} aria-label={`Dono da usina ${u.codigo_geradora}`}>
                <option value="">— Sem dono (bloqueia o repasse)</option>
                {(donos.dado ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </td>
            <td><span className={`marca ${u.status === 'ativa' ? 'ok' : 'pendente'}`}>{rotulo(u.status)}</span></td>
          </tr>
        ))}
      </Tabela>

      <h2>Percentual de repasse, por vigência</h2>
      <div className="cartao">
        <div className="campos">
          <Campo rotulo="Usina" valor={sel} ao={setSel}
                 opcoes={todas.map((u) => ({ valor: u.id, texto: u.codigo_geradora }))} />
          <Campo rotulo="Percentual" valor={pct} ao={setPct} dica="Ex. 70,00" />
          <Campo rotulo="Vigência a partir de" valor={inicio} ao={setInicio} tipo="date" />
          <div style={{ alignSelf: 'end' }}>
            <button className="primario" onClick={abrirVigencia} disabled={acao.ocupado || !sel}>Abrir vigência</button>
          </div>
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
          O percentual aplicado é o vigente <strong>na competência da fatura</strong>, não o corrente da usina (R25).
          Não há “editar”: abrir uma vigência nova fecha a anterior na mesma transação.
        </p>
      </div>

      {sel && (
        <Tabela cabecalho={<><th>Percentual</th><th>Início</th><th>Fim</th></>}
                vazio="Sem regra de repasse — o split levanta.">
          {(repasses.dado ?? []).map((r) => (
            <tr key={r.id}>
              <td className="num">{r.percentual}%</td>
              <td className="fraco">{String(r.vigencia_inicio).slice(0, 10)}</td>
              <td className="fraco">{r.vigencia_fim ? String(r.vigencia_fim).slice(0, 10) : 'Em aberto'}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </Pagina>
  );
}
