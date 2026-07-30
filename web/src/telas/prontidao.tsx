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
import {
  Pagina, Aviso, Tabela, Marca, rotulo, Kpi, KpiSimNao, Carregando, CampoData,
} from '../ui.tsx';
import { competenciaISO } from '../dinheiro.ts';

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function TelaProntidao() {
  const [mes, setMes] = useState(mesAtual);
  const { dado, carregando, erro } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mes)}/prontidao`), [mes]);

  return (
    <Pagina titulo="Prontidão para faturar"
            sub="O que falta para esta competência poder ser cobrada. Dez camadas, cada uma com dono. Esta tela conta — não decide nada.">
      <div className="ferramentas">
        <label style={{ margin: 0 }}>Competência</label>
        <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Competência" style={{ width: 'auto' }} />
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && <Carregando texto="Contando as dez camadas…" />}

      {dado && (
        <>
          {/*
            OS DOIS PRIMEIROS CARTOES SAO AS DUAS RESPOSTAS DE CONSEQUENCIA, e por
            isso sao os unicos com icone grande de sim/nao: "pode faturar" decide
            se a cobranca existe, "pode repartir" decide se o dinheiro que entrar
            e distribuido. A palavra continua escrita ao lado do desenho.
          */}
          <div className="kpis">
            <KpiSimNao nome="Pode faturar" sim={dado.pode_faturar} icone="pode_faturar" />
            <KpiSimNao nome="Pode repartir" sim={dado.pode_repartir} icone="pode_repartir" />
            <Kpi nome="Unidades ativas" icone="unidades" valor={dado.ucs_ativas} />
            <Kpi nome="Camadas pendentes" icone="prontidao"
                 valor={<>
                   {dado.camadas.filter((c) => c.situacao === 'pendente').length}
                   <span className="fraco" style={{ fontSize: 14, fontWeight: 500 }}> de {dado.camadas.length}</span>
                 </>} />
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
