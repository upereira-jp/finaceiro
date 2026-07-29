// A TELA DE PRONTIDAO, e ela e a primeira de propósito.
//
// Hoje o sistema nao consegue emitir uma fatura, e o motivo nao e codigo: sao
// quatro camadas de cadastro vazias. Esta tela e o mesmo `--prontidao` do
// script, com a mesma disciplina: mostra as nove camadas, com dono nomeado, e
// nao decide nenhuma.
//
// `nao_medido` E AMARELO E NAO VERDE. Tres camadas tem por universo as UCs
// CONTRATADAS; com zero contratos o universo e vazio, e pintar "0 de 0" de verde
// seria o relatorio autorizando o que nao conferiu. Foi um defeito real, achado
// rodando contra producao em 28/07.

import { useState } from 'react';
import { api, type Prontidao } from '../api.ts';
import { useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, Marca, rotulo, linha } from '../ui.tsx';
import { competenciaISO } from '../dinheiro.ts';

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function TelaProntidao() {
  const [mes, setMes] = useState(mesAtual);
  const { dado, carregando, erro } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mes)}/prontidao`), [mes]);

  return (
    <Pagina titulo="Prontidão para faturar"
            sub="O que falta para esta competência poder ser cobrada. Nove camadas, cada uma com dono. Esta tela conta — não decide nada.">
      <div style={{ ...linha, marginBottom: 16 }}>
        <label style={{ margin: 0 }}>Competência</label>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 'auto' }} />
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && <p className="fraco">Carregando…</p>}

      {dado && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="nome">Pode faturar</div>
              <div className="valor" style={{ color: dado.pode_faturar ? 'var(--ok)' : 'var(--erro)' }}>
                {dado.pode_faturar ? 'Sim' : 'Não'}
              </div>
            </div>
            <div className="kpi">
              <div className="nome">Pode repartir</div>
              <div className="valor" style={{ color: dado.pode_repartir ? 'var(--ok)' : 'var(--erro)' }}>
                {dado.pode_repartir ? 'Sim' : 'Não'}
              </div>
            </div>
            <div className="kpi">
              <div className="nome">Unidades ativas</div>
              <div className="valor">{dado.ucs_ativas}</div>
            </div>
            <div className="kpi">
              <div className="nome">Camadas pendentes</div>
              <div className="valor">
                {dado.camadas.filter((c) => c.situacao === 'pendente').length}
                <span className="fraco" style={{ fontSize: 14 }}> de {dado.camadas.length}</span>
              </div>
            </div>
          </div>

          <Tabela cabecalho={<><th>Camada</th><th>Estado</th><th className="num">Falta</th><th>Efeito</th><th>Dono</th></>}>
            {dado.camadas.map((c) => (
              <tr key={c.camada}>
                <td>
                  <strong>{rotulo(c.camada)}</strong>
                  <div className="fraco" style={{ fontSize: 13, marginTop: 4, maxWidth: 620 }}>{c.explicacao}</div>
                </td>
                <td><Marca tom={c.situacao}>{rotulo(c.situacao)}</Marca></td>
                <td className="num">
                  {c.situacao === 'nao_medido' ? '—' : `${c.faltam} de ${c.total}`}
                </td>
                <td className="fraco">{c.efeito === 'bloqueia_fatura' ? 'Fatura' : 'Split'}</td>
                <td className="fraco">{c.dono}{c.questao && <div style={{ fontSize: 12 }}>{c.questao}</div>}</td>
              </tr>
            ))}
          </Tabela>

          <h2>Como ler</h2>
          <ul className="fraco" style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
            <li><strong>Fatura</strong> impede a cobrança existir. <strong>Split</strong> deixa faturar e trava a repartição quando o dinheiro entrar.</li>
            <li><strong>Não medido</strong> não é <strong>OK</strong>: o universo daquela camada depende de contrato, e não há contrato. Zero sobre nada não é “pronto”.</li>
            <li>A ordem é a do trabalho: fechar a de cima é o que torna a de baixo mensurável.</li>
          </ul>
        </>
      )}
    </Pagina>
  );
}
