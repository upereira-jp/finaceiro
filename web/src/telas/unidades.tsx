// UNIDADES CONSUMIDORAS — e a tela que fecha a camada `vencimento`.
//
// `data_vencimento` esta 100% vazia em producao, e e a Q-SPEC001-02: quem
// preenche, por UC ou por contrato, nao tem dono resolvido. O servidor RECUSA
// faturar sem ela em vez de escolher um dia (regra 10), entao alguem precisa
// digitar - e ate hoje nao havia onde.
//
// O FILTRO DE PENDENCIA EXISTE POR CAUSA DESSA DIGITACAO: sao 39 UCs para
// preencher, e "mostrar so as que faltam" e a diferenca entre conferir uma
// lista que encolhe e cacar linha por linha numa lista que nao muda.

import { useState } from 'react';
import { api, type UnidadeConsumidora, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Busca, Ferramentas, ThOrd,
  useOrdenacao, ordenar, contem, rotulo,
} from '../ui.tsx';
import { decimalTexto } from '../dinheiro.ts';

export function TelaUnidades() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const acao = useAcao();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [rateio, setRateio] = useState<Record<string, string>>({});

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pendencia, setPendencia] = useState('');
  const { ordem, alternar } = useOrdenacao('uc');

  const nomeUsina = (id: string | null) =>
    usinas.dado?.find((u) => u.id === id)?.codigo_geradora ?? (id ? '—' : null);

  const todas = ucs.dado ?? [];
  const visiveis = ordenar(
    todas.filter((u) =>
      (contem(u.numero_uc, busca) || contem(u.distribuidora, busca)) &&
      (!situacao || u.status === situacao) &&
      (pendencia !== 'sem_vencimento' || !u.data_vencimento) &&
      (pendencia !== 'sem_usina' || !u.usina_id)),
    ordem,
    {
      uc: (u) => u.numero_uc,
      distribuidora: (u) => u.distribuidora,
      usina: (u) => nomeUsina(u.usina_id),
      rateio: (u) => (u.percentual_rateio == null ? null : parseFloat(u.percentual_rateio)),
      vencimento: (u) => u.data_vencimento,
      situacao: (u) => u.status,
    },
  );

  async function salvarVencimento(uc: UnidadeConsumidora) {
    const v = edicao[uc.id];
    if (!v) return;
    const ok = await acao.executar(() => api.patch(`/unidades-consumidoras/${uc.id}`, { data_vencimento: v }));
    if (ok) { acao.anunciar(`Vencimento da ${uc.numero_uc} gravado.`); ucs.recarregar(); }
  }

  async function salvarRateio(uc: UnidadeConsumidora) {
    const pct = rateio[uc.id];
    if (!pct || !uc.usina_id) return;
    // O percentual vai como STRING: a regra 1 mantem proporcao em escala decimal
    // e o repositorio recusa `number` de proposito.
    const ok = await acao.executar(async () =>
      api.put(`/unidades-consumidoras/${uc.id}/rateio`, {
        usina_id: uc.usina_id, percentual_rateio: decimalTexto(pct, 4),
      }));
    if (ok) { acao.anunciar(`Rateio da ${uc.numero_uc} atualizado.`); ucs.recarregar(); }
  }

  const semVencimento = todas.filter((u) => !u.data_vencimento && u.status === 'ativa').length;

  return (
    <Pagina titulo="Unidades consumidoras"
            sub="Espelhadas do CRM. O dia de vencimento é local e obrigatório para faturar — o servidor recusa em vez de escolher um dia.">
      {semVencimento > 0 && (
        <Aviso tipo="erro">
          {semVencimento} unidade(s) ativa(s) sem dia de vencimento. Sem ele a fatura não nasce
          (<code>sem_vencimento</code>) — é a <code>Q-SPEC001-02</code>.
        </Aviso>
      )}
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      {ucs.erro && <Aviso tipo="erro">{ucs.erro}</Aviso>}

      <Ferramentas contagem={todas.length ? `${visiveis.length} de ${todas.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por UC ou distribuidora…" />
        <select value={situacao} aria-label="Filtrar por situação" onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="ativa">Ativas</option>
          <option value="inativa">Inativas</option>
        </select>
        <select value={pendencia} aria-label="Filtrar por pendência" onChange={(e) => setPendencia(e.target.value)}>
          <option value="">Todas as pendências</option>
          <option value="sem_vencimento">Sem vencimento</option>
          <option value="sem_usina">Sem usina</option>
        </select>
        {(busca || situacao || pendencia) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); setPendencia(''); }}>Limpar filtros</button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="uc" ordem={ordem} ao={alternar}>UC</ThOrd>
                <ThOrd chave="distribuidora" ordem={ordem} ao={alternar}>Distribuidora</ThOrd>
                <ThOrd chave="usina" ordem={ordem} ao={alternar}>Usina</ThOrd>
                <ThOrd chave="rateio" ordem={ordem} ao={alternar} num>Rateio %</ThOrd>
                <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
              </>}
              vazio={todas.length
                ? 'Nenhuma unidade corresponde à busca ou aos filtros.'
                : 'Nenhuma unidade consumidora espelhada.'}>
        {visiveis.map((u) => (
          <tr key={u.id}>
            <td><strong>{u.numero_uc}</strong></td>
            <td className="fraco">{u.distribuidora}</td>
            <td className="fraco">{nomeUsina(u.usina_id) ?? <span style={{ color: 'var(--erro)' }}>Sem usina</span>}</td>
            <td className="num" style={{ minWidth: 150 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={rateio[u.id] ?? u.percentual_rateio ?? ''}
                       aria-label={`Rateio da ${u.numero_uc}`}
                       onChange={(e) => setRateio({ ...rateio, [u.id]: e.target.value })}
                       placeholder="Ex. 12,5" style={{ width: 90 }} />
                <button onClick={() => salvarRateio(u)} disabled={acao.ocupado || !u.usina_id}>OK</button>
              </div>
            </td>
            <td style={{ minWidth: 190 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="date" value={edicao[u.id] ?? u.data_vencimento?.slice(0, 10) ?? ''}
                       aria-label={`Vencimento da ${u.numero_uc}`}
                       onChange={(e) => setEdicao({ ...edicao, [u.id]: e.target.value })} />
                <button onClick={() => salvarVencimento(u)} disabled={acao.ocupado}>OK</button>
              </div>
            </td>
            <td><span className={`marca ${u.status === 'ativa' ? 'ok' : 'pendente'}`}>{rotulo(u.status)}</span></td>
          </tr>
        ))}
      </Tabela>
      <p className="sub" style={{ marginTop: 12 }}>
        O dia do vencimento é o que conta: a fatura de uma competência vence no <strong>mês seguinte</strong>,
        no mesmo dia. Dia 29 a 31 em mês curto cai no último dia, sem transbordar.
      </p>
    </Pagina>
  );
}
