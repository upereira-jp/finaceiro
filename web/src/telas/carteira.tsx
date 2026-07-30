// CARTEIRA: o ensaio do lote e a posição da competência.
//
// ENSAIO E VALENDO SAO BOTOES DIFERENTES, e nao um interruptor. E o mesmo
// desenho do `npm run ciclo` e do `npm run faturar`, que exigem `--ensaio` ou
// `--valendo` sem default: aqui o erro nao e uma linha a mais no banco, e
// cobranca emitida para a carteira inteira. Caminhos separados nao tem default
// para errar, e o botao de valendo pede confirmacao explicita.

import { useState } from 'react';
import { api } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, rotulo, linha, Kpi, Marca, Icone, CampoData,
} from '../ui.tsx';
import { competenciaISO, emReais } from '../dinheiro.ts';

type Resumo = {
  competencia: string; criadas: number; recusadas: number;
  recusas: Record<string, number>; alertas: Record<string, number>;
  detalhe: Array<{ numero_uc: string; motivo: string; explicacao: string }>;
};
type Posicao = {
  competencia: string; faturas: number; emitidas: number; liquidadas: number;
  vencidas_em_aberto: number; faturado_centavos: number; recebido_centavos: number; a_receber_centavos: number;
};

export function TelaCarteira() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const acao = useAcao();
  const posicao = useDados<Posicao[]>(() => api.get('/carteira'));

  // Mais recente primeiro, de proposito: quem abre a carteira quer o mes
  // corrente, e o mes corrente no fim de uma lista crescente e o que some.
  const posicoes = [...(posicao.dado ?? [])]
    .sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
  const atual = posicoes[0];

  const rodar = (modo: 'ensaio' | 'compor') => async () => {
    if (modo === 'compor' && !confirm(
      `Compor as faturas de ${mes} VALENDO?\n\nIsto grava faturas em rascunho no banco. ` +
      'Emitir é um segundo ato, depois da conferência.')) return;
    const ok = await acao.executar(async () =>
      setResumo(await api.post<Resumo>(`/faturamento/${competenciaISO(mes)}/${modo}`)));
    if (ok && modo === 'compor') { acao.anunciar('Lote composto em rascunho.'); posicao.recarregar(); }
  };

  return (
    <Pagina titulo="Carteira"
            sub="O ensaio roda a triagem e não escreve nada. Compor grava as faturas em rascunho — emitir é um ato separado.">
      {atual && (
        <div className="kpis">
          <Kpi nome={<>Faturado · {String(atual.competencia).slice(0, 7)}</>} icone="faturado"
               valor={emReais(atual.faturado_centavos)} />
          <Kpi nome="Recebido" icone="recebido" valor={emReais(atual.recebido_centavos)} />
          <Kpi nome="A receber" icone="a_receber" valor={emReais(atual.a_receber_centavos)} />
          <Kpi nome="Vencidas em aberto" icone="vencidas" valor={atual.vencidas_em_aberto}
               tom={atual.vencidas_em_aberto ? 'erro' : undefined} />
        </div>
      )}

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div style={{ ...linha, gap: 12 }}>
          <div>
            <label>Competência</label>
            <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Competência" style={{ width: 'auto' }} />
          </div>
          <div style={{ alignSelf: 'end', display: 'flex', gap: 8 }}>
            <button onClick={rodar('ensaio')} disabled={acao.ocupado}>
              <Icone nome="recarregar" tamanho={15} /> Ensaio
            </button>
            <button className="primario" onClick={rodar('compor')} disabled={acao.ocupado}>
              <Icone nome="carteira" tamanho={15} peso="bold" /> Compor valendo
            </button>
          </div>
        </div>
        {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
        {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      </div>

      {resumo && (
        <>
          <div style={{ ...linha, gap: 10, marginBottom: 12 }}>
            <Marca tom="ok">{resumo.criadas} fatura(s)</Marca>
            <Marca tom={resumo.recusadas ? 'pendente' : 'ok'}>{resumo.recusadas} recusada(s)</Marca>
            {Object.entries(resumo.alertas).map(([a, n]) => (
              <Marca key={a} tom="nao_medido">{n} × {rotulo(a)}</Marca>
            ))}
          </div>
          {/*
            A RECUSA CARREGA O MOTIVO, e a contagem por motivo e o que traz
            problema a tona - foi assim que a Q-VALOR-01 apareceu no conector,
            em vez de virar 40 faturas erradas.
          */}
          {resumo.detalhe.length > 0 && (
            <Tabela cabecalho={<><th>UC</th><th>Motivo</th><th>O que significa</th></>}>
              {resumo.detalhe.slice(0, 60).map((d, i) => (
                <tr key={i}>
                  <td><strong>{d.numero_uc}</strong></td>
                  <td><Marca tom="pendente">{rotulo(d.motivo)}</Marca></td>
                  <td className="fraco" style={{ fontSize: 13 }}>{d.explicacao}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}

      <h2>Posição por competência</h2>
      {posicao.erro && <Aviso tipo="erro">{posicao.erro}</Aviso>}
      <Tabela cabecalho={<>
                <th>Competência</th><th className="num">Faturas</th><th className="num">Emitidas</th>
                <th className="num">Liquidadas</th><th className="num">Vencidas</th>
                <th className="num">Faturado</th><th className="num">Recebido</th><th className="num">A receber</th>
              </>}
              vazio="Nenhuma fatura ainda.">
        {posicoes.map((p) => (
          <tr key={p.competencia}>
            <td><strong>{String(p.competencia).slice(0, 7)}</strong></td>
            <td className="num">{p.faturas}</td>
            <td className="num">{p.emitidas}</td>
            <td className="num">{p.liquidadas}</td>
            <td className="num" style={{ color: p.vencidas_em_aberto ? 'var(--erro)' : undefined }}>{p.vencidas_em_aberto}</td>
            <td className="num">{emReais(p.faturado_centavos)}</td>
            <td className="num">{emReais(p.recebido_centavos)}</td>
            <td className="num">{emReais(p.a_receber_centavos)}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
