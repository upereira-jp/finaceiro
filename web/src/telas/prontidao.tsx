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
//
// E DESDE 19/08/2026 CADA LINHA DIZ ONDE SE RESOLVE, a pedido do dono. A tela
// dizia com precisao O QUE falta e DE QUEM e, e deixava o CAMINHO implicito -
// quem opera tinha de saber de cabeca que a tarifa e coluna da aba Unidades
// desde 14/08 (antes era a aba Tarifas, que saiu), que o documento so ganhou
// tela em 17/08, e que geracao nao tem tela porque e espelhada do CRM.
//
// Caminho implicito e o MESMO defeito que esta tela existe para combater: a
// triagem dizia `sem_contrato_vigente` e nao dizia que atras havia mais tres
// camadas vazias. O mapa mora em `destino-da-camada.ts`, `.ts` puro e com suite
// propria (regra 8), e ele conta duas verdades que a tela nao inventa: a de que
// ha tela, e a de que NAO ha - geracao e regra de comissao nao tem formulario, e
// a coluna diz isso em vez de desenhar um link para lugar nenhum.

import { useState } from 'react';
import { api, type Camada, type Prontidao } from '../api.ts';
import { useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Marca, rotulo, Kpi, KpiSimNao, Carregando, CampoData, AjudaDoMes, Icone,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { competenciaISO } from '../dinheiro.ts';
import { DESTINO_DA_CAMADA, enderecoDoDestino, telaDoDestino } from '../destino-da-camada.ts';

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function TelaProntidao() {
  const [mes, setMes] = useState(mesAtual);
  const { dado, carregando, erro } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mes)}/prontidao`), [mes]);

  return (
    <Pagina titulo="Prontidão para faturar"
            sub="O que falta para este mês poder ser cobrado. Uma linha por camada, cada uma com dono e com o caminho de quem preenche. Esta tela conta — não decide nada.">
      <div className="ferramentas">
        <label style={{ margin: 0 }}>Mês de referência</label>
        <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} /><AjudaDoMes />
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {/* "as camadas" e nao "as dez camadas": eram dez ate 04/08/2026, quando a
          R9 virou camada, e o texto ficou para tras — o cartao ja diz o total
          contando a lista que o servidor devolveu. */}
      {carregando && <Carregando texto="Contando as camadas…" />}

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

          <Tabela cabecalho={<><th>Camada</th><th>Estado</th><th className="num">Falta</th><th>Efeito</th><th>Dono</th><th>Onde resolver</th></>}>
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
                <td><OndeResolver camada={c.camada} situacao={c.situacao} /></td>
              </tr>
            ))}
          </Tabela>

          <h2>Como ler</h2>
          <ul className="fraco" style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
            <li><strong>Fatura</strong> impede a cobrança existir. <strong>Split</strong> deixa faturar e trava a repartição quando o dinheiro entrar.</li>
            <li><strong>Não medido</strong> não é <strong>OK</strong>: o universo daquela camada depende de contrato, e não há contrato. Zero sobre nada não é “pronto”.</li>
            <li>A ordem é a do trabalho: fechar a de cima é o que torna a de baixo mensurável.</li>
            <li><strong>Onde resolver</strong> abre a aba já filtrada na pendência — “Sem tarifa”, “Sem vencimento”, “Ainda não vale para o contrato”. Onde diz <strong>não há tela</strong>, não há mesmo: o caminho está escrito ao lado.</li>
          </ul>
        </>
      )}
    </Pagina>
  );
}

/**
 * ONDE A CAMADA SE RESOLVE — o link, o caminho em lote e a ressalva.
 *
 * O QUE ELE MOSTRA MUDA COM O ESTADO, e as tres respostas sao diferentes:
 *
 *   `ok`          "Fechada". Uma chamada para a ação numa camada resolvida
 *                 mandaria alguém digitar o que já está digitado — e a tela
 *                 passaria a pedir trabalho que ela mesma diz não existir;
 *   sem `rota`    o rótulo diz **não há tela**, e o caminho real aparece do
 *                 lado. Duas camadas caem aqui, e as duas por decisão registrada:
 *                 geração é espelho do CRM (regra 4) e regra de comissão é
 *                 decisão com dono. Desenhar link para elas seria mandar
 *                 procurar um formulário que não existe;
 *   com `rota`    o link, com o ícone e o nome que a barra de navegação já usa
 *                 para aquela aba — quem conhece a barra reconhece o destino
 *                 antes de ler o rótulo.
 *
 * `nao_medido` LEVA LINK IGUAL A `pendente`, e isso é deliberado: universo vazio
 * quase sempre se destrava uma camada acima, e a nota de cada destino diz qual.
 * Esconder o caminho de quem não foi medido deixaria a linha sem saída.
 */
function OndeResolver({ camada, situacao }: Pick<Camada, 'camada' | 'situacao'>) {
  const d = DESTINO_DA_CAMADA[camada];

  // Camada nova no servidor sem destino aqui. A suite pega isso lendo
  // `src/repos/prontidao.ts` (D1), então na prática não acontece — mas a tela
  // não pode quebrar por uma linha a mais no relatório.
  if (!d) return <span className="fraco">—</span>;
  if (situacao === 'ok') return <span className="fraco">Fechada</span>;

  const endereco = enderecoDoDestino(d);
  const tela = telaDoDestino(d);

  return (
    <div style={{ maxWidth: 340 }}>
      {endereco && tela ? (
        <Ligacao para={endereco}
                 rotulo={`${d.rotulo} — abre a aba ${tela.titulo}`}
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Icone nome={tela.icone} tamanho={16} /> {d.rotulo}
        </Ligacao>
      ) : (
        <strong>{d.rotulo}</strong>
      )}

      {d.caminho && (
        <div className="fraco" style={{ fontSize: 12, marginTop: 4 }}>
          {endereco ? 'ou, para a carteira inteira de uma vez, ' : 'O caminho é '}
          <code>{d.caminho}</code>
        </div>
      )}

      <div className="fraco" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.55 }}>{d.nota}</div>
    </div>
  );
}
