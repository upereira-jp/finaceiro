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
import { Pagina, Aviso, Tabela, linha } from '../ui.tsx';
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
        <label style={{ margin: 0 }}>competência</label>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 'auto' }} />
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && <p className="fraco">carregando…</p>}

      {dado && (
        <>
          <div style={{ ...linha, gap: 16, marginBottom: 16 }}>
            <span className={`marca ${dado.pode_faturar ? 'ok' : 'pendente'}`}>
              {dado.pode_faturar ? 'pode faturar' : 'não pode faturar'}
            </span>
            <span className={`marca ${dado.pode_repartir ? 'ok' : 'pendente'}`}>
              {dado.pode_repartir ? 'pode repartir' : 'não pode repartir'}
            </span>
            <span className="fraco">{dado.ucs_ativas} unidades consumidoras ativas</span>
          </div>

          <Tabela cabecalho={<><th>camada</th><th>estado</th><th className="num">falta</th><th>efeito</th><th>dono</th></>}>
            {dado.camadas.map((c) => (
              <tr key={c.camada}>
                <td>
                  <strong>{c.camada.replace(/_/g, ' ')}</strong>
                  <div className="fraco" style={{ fontSize: 13, marginTop: 4, maxWidth: 620 }}>{c.explicacao}</div>
                </td>
                <td><span className={`marca ${c.situacao}`}>{c.situacao.replace('_', ' ')}</span></td>
                <td className="num">
                  {c.situacao === 'nao_medido' ? '—' : `${c.faltam} de ${c.total}`}
                </td>
                <td className="fraco">{c.efeito === 'bloqueia_fatura' ? 'fatura' : 'split'}</td>
                <td className="fraco">{c.dono}{c.questao && <div style={{ fontSize: 12 }}>{c.questao}</div>}</td>
              </tr>
            ))}
          </Tabela>

          <h2>como ler</h2>
          <ul className="fraco" style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
            <li><strong>fatura</strong> impede a cobrança existir. <strong>split</strong> deixa faturar e trava a repartição quando o dinheiro entrar.</li>
            <li><strong>não medido</strong> não é <strong>ok</strong>: o universo daquela camada depende de contrato, e não há contrato. Zero sobre nada não é “pronto”.</li>
            <li>A ordem é a do trabalho: fechar a de cima é o que torna a de baixo mensurável.</li>
          </ul>
        </>
      )}
    </Pagina>
  );
}
