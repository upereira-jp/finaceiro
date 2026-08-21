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
  Pagina, Aviso, Tabela, Marca, Kpi, KpiSimNao, Carregando, CampoData, AjudaDoMes, Icone,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { competenciaISO } from '../dinheiro.ts';
import { DESTINO_DA_CAMADA, enderecoDoDestino, telaDoDestino } from '../destino-da-camada.ts';
import { VERBETE_DA_CAMADA, EFEITO, SITUACAO } from '../vocabulario.ts';

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function TelaProntidao() {
  const [mes, setMes] = useState(mesAtual);
  const { dado, carregando, erro } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mes)}/prontidao`), [mes]);

  return (
    /*
      O TÍTULO ERA "Prontidão para faturar" e a aba se chama "Pendências" desde
      30/07 — quem clicava em uma palavra chegava na outra. "Prontidão" é o nome
      do CÁLCULO no servidor (`repos/prontidao.ts`), e ele fica lá: aqui vale o
      nome que a barra já usa.
    */
    <Pagina titulo="Pendências"
            sub="O que ainda falta para este mês poder ser cobrado. Cada linha diz o que é, quantos faltam e onde se resolve. Esta tela só confere — ela não muda nada sozinha.">
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

          {/*
            A COLUNA "DONO" SAIU DA TABELA em 21/08/2026, com o jargão, e as duas
            pelo mesmo motivo: a partir de 22/08 entram usuários novos e não há
            divisão de suporte. "Vinicius + operacao" e "Q-PAGADOR-01" são
            rastreio interno — para quem abre o sistema pela primeira vez, é
            ruído ocupando duas colunas na largura útil.

            NADA FOI JOGADO FORA. O `dono`, a `questao` e o `explicacao` do
            servidor continuam chegando e aparecem em "detalhe técnico", atrás de
            um clique, por decisão do dono no mesmo dia. Quem precisa dos códigos
            continua a um clique deles; quem não sabe o que são não tropeça.
          */}
          <Tabela cabecalho={<><th>O que falta</th><th>Situação</th><th className="num">Quantos</th><th>Efeito</th><th>Onde resolver</th></>}>
            {dado.camadas.map((c) => (
              <tr key={c.camada}>
                <td><OQueFalta camada={c} /></td>
                <td><Marca tom={c.situacao}>{SITUACAO[c.situacao]?.curto ?? c.situacao}</Marca></td>
                <td className="num">
                  {c.situacao === 'nao_medido' ? '—' : `${c.faltam} de ${c.total}`}
                </td>
                <td className="fraco" style={{ fontSize: 13 }}>{EFEITO[c.efeito]?.curto ?? c.efeito}</td>
                <td><OndeResolver camada={c.camada} situacao={c.situacao} /></td>
              </tr>
            ))}
          </Tabela>

          <h2>Como ler esta tela</h2>
          <ul className="fraco" style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
            <li><strong>Impede cobrar</strong> significa que a cobrança deste mês não sai enquanto isso faltar. <strong>Impede dividir o dinheiro</strong> deixa cobrar normalmente — o que trava é o repasse ao dono da usina e a comissão, quando o dinheiro entrar.</li>
            <li><strong>Ainda não dá para conferir</strong> não é o mesmo que <strong>pronto</strong>. Essa conferência depende de algo de uma linha acima, que ainda está vazio — então não há o que medir.</li>
            <li>A ordem das linhas é a ordem do trabalho: fechar a de cima costuma destravar as de baixo.</li>
            <li><strong>Onde resolver</strong> abre a aba já filtrada, mostrando só o que falta. Onde diz <strong>não há tela</strong>, não há mesmo — o caminho está escrito ao lado.</li>
          </ul>
        </>
      )}
    </Pagina>
  );
}

/**
 * O QUE FALTA, em duas camadas de leitura.
 *
 * NA SUPERFÍCIE, português de quem opera: o nome curto, a frase do que falta e a
 * CONSEQUÊNCIA — que é o que responde «posso deixar para depois?». Nenhuma
 * sigla, nenhum nome de coluna, nenhum código de questão.
 *
 * ATRÁS DE UM CLIQUE, tudo o que estava na superfície até 21/08: a explicação de
 * engenharia que o servidor manda, o dono, o código da questão e o comando que
 * resolve a carteira inteira. A decisão do dono foi «esconder, não remover» — e
 * a diferença importa: quem acompanha o projeto continua com os ponteiros, e
 * quem chega amanhã não precisa saber que existem.
 *
 * O TEXTO DO SERVIDOR NÃO É REESCRITO AQUI. `c.explicacao` chega como veio, e é
 * essa a razão de ele caber no detalhe técnico em vez de virar a frase principal:
 * ele é preciso para quem lê código e a frase principal precisa ser outra coisa.
 */
function OQueFalta({ camada: c }: { camada: Camada }) {
  const [tecnico, setTecnico] = useState(false);
  const v = VERBETE_DA_CAMADA[c.camada];
  const d = DESTINO_DA_CAMADA[c.camada];

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Sem verbete, cai no nome cru: feio e honesto. Some seria pior — a
          suíte `ajuda.ts` (A5) impede que chegue aqui. */}
      <strong>{v?.titulo ?? c.camada}</strong>

      {v && (
        <div className="fraco" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
          {v.simples}{' '}
          {/* A consequência só aparece em quem ainda não está fechado: numa
              linha resolvida ela seria um aviso sobre um problema que não há. */}
          {c.situacao !== 'ok' && <span>{v.consequencia}</span>}
        </div>
      )}

      <button type="button" className="ajuda-pergunta" aria-expanded={tecnico}
              style={{ fontSize: 12, fontWeight: 500, padding: '6px 0' }}
              onClick={() => setTecnico((x) => !x)}>
        <Icone nome={tecnico ? 'subir' : 'descer'} tamanho={11} peso="bold" />
        {tecnico ? 'ocultar detalhe técnico' : 'ver detalhe técnico'}
      </button>

      {tecnico && (
        <div className="fraco" style={{ fontSize: 12, lineHeight: 1.55, paddingLeft: 19, paddingBottom: 8 }}>
          <p style={{ margin: '0 0 6px' }}>{c.explicacao}</p>
          {d?.nota && <p style={{ margin: '0 0 6px' }}>{d.nota}</p>}
          {d?.caminho && (
            <p style={{ margin: '0 0 6px' }}>
              Para a carteira inteira de uma vez: <code>{d.caminho}</code>
            </p>
          )}
          <p style={{ margin: 0 }}>
            Responsável: {c.dono}{c.questao && <> · questão {c.questao}</>} · chave <code>{c.camada}</code>
          </p>
        </div>
      )}
    </div>
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

  /*
   * A NOTA E O COMANDO SAÍRAM DAQUI em 21/08 e foram para o «detalhe técnico» da
   * primeira coluna. A razão é que esta coluna passou a ter UM trabalho — dizer
   * para onde ir — e ela o fazia embaixo de sessenta palavras de ressalva, com
   * `npm run documentos` no meio. Quem chega amanhã não roda comando nenhum.
   *
   * Nada se perdeu de lugar nenhum: os dois continuam na tela, a um clique, e
   * agora ao lado do resto do texto de engenharia em vez de espalhados por duas
   * colunas.
   */
  return (
    <div style={{ maxWidth: 260 }}>
      {endereco && tela ? (
        <Ligacao para={endereco}
                 rotulo={`${d.rotulo} — abre a aba ${tela.titulo}`}
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Icone nome={tela.icone} tamanho={16} /> {d.rotulo}
        </Ligacao>
      ) : (
        <>
          <strong>{d.rotulo}</strong>
          {d.caminho && (
            <div className="fraco" style={{ fontSize: 12, marginTop: 4 }}>
              O caminho é <code>{d.caminho}</code>
            </div>
          )}
        </>
      )}
    </div>
  );
}
