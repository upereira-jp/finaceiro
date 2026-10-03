// HISTÓRICO — o que foi feito neste sistema, por quem e quando.
//
// ============================================================================
// POR QUE ESTA TELA EXISTE, e a resposta é uma medição
//
// O banco guarda cada criação, alteração e exclusão desde a primeira semana do
// projeto. Em 10/09/2026 eram **21.917 registros neste tenant, e nenhum leitor**:
// nenhuma rota, nenhum repositório, nenhuma tela. A pergunta *"quem cancelou
// esta fatura?"* só tinha uma resposta possível — chamar quem tem a senha do
// banco. Era o último item de código da lista do que ainda exigia um
// desenvolvedor.
//
// ============================================================================
// A DECISÃO QUE FAZ ESTA TELA SER ÚTIL, e ela não é óbvia
//
// Das 21.917 linhas, **21.077 (96%) são o batimento das rodadas automáticas** —
// a fila de boleto se registrando de 5 em 5 minutos, a leitura do outro sistema
// de 15 em 15. Elas crescem 1.440 por dia. Tudo o que **pessoas** fizeram em 45
// dias somava 840 linhas.
//
// Uma tela que abrisse "pelas mais recentes" mostraria cem linhas de rodada, e
// a última alteração de cadastro estaria a milhares de linhas do topo. Por isso
// o padrão é **o que as pessoas fizeram**, com o batimento a um clique — e a
// razão inteira, com os números, está em `src/repos/auditoria.ts`.
//
// ⚠️ E HÁ UMA COISA QUE ESTA TELA MOSTRA E NÃO CONSERTA. As três rodadas
// automáticas entram na trilha **assinadas pela pessoa cujo acesso o servidor
// usa para rodá-las** — ou seja, o histórico diz que alguém alterou coisas às
// 3h da manhã, todos os dias. Não é defeito desta tela: é o que está gravado, e
// mostrar outra coisa seria a tela mentindo sobre o que o banco tem. Está
// registrado como questão, com o dono nomeado.
//
// COMO ELA É MONTADA: a regra é pura e mora em `historico.ts` (regra 8) — os
// rótulos das tabelas e colunas, o formato dos valores, a frase de quem fez e o
// agrupamento por dia. Aqui fica só o desenho.

import { useState } from 'react';
import { api } from '../api.ts';
import { useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Busca, Ferramentas, Filtro, Icone, Marca, Interruptor,
  Carregando, CampoData, DetalheTecnico, contem,
} from '../ui.tsx';
import {
  porDia, quemFez, resumoDaLinha, rotuloDaTabela, rotuloDaColuna, valorNaTela,
  horaDaLinha, temAnteriores, ehRodadaAutomatica, VERBO,
  semAnteriores, anterioresDe, acrescentarPagina,
  type LinhaDaTrilha, type RespostaDaTrilha, type Anteriores,
} from '../historico.ts';
import { SELO_DA_TRILHA } from '../tom-do-estado.ts';
import { hojeEmSP } from '../formato.ts';

/* O TOM DE CADA OPERAÇÃO vem de `tom-do-estado.ts` (`SELO_DA_TRILHA`) desde
 * 01/10/2026 (etapa 7b), e os três são NEUTROS: um verbo de auditoria é fato,
 * não estado. [30/09, etapa 4a] Apagar já tinha saído do vermelho; «Alterou»
 * ainda era âmbar — a cor de tarefa — e «Criou» verde, a cor do que fechou. O
 * desenho e o verbo dizem qual foi: o mais, as setas da troca, a lixeira. */

/** Hoje em São Paulo (`formato.ts`): o `toISOString` é UTC, e das 21h à
 *  meia-noite o título «hoje» caía no dia seguinte. */
const hojeISO = () => hojeEmSP();

export function TelaHistorico() {
  const [tabela, setTabela] = useState('');
  const [operacao, setOperacao] = useState('');
  const [desde, setDesde] = useState('');
  const [rodadas, setRodadas] = useState(false);
  const [busca, setBusca] = useState('');

  const PEDIDO = 200;

  /* A MESMA CONSULTA para a primeira página e para as anteriores: o cursor só
     faz sentido sobre os mesmos filtros que produziram a linha de onde ele saiu. */
  const consulta = () => {
    const q = new URLSearchParams({ limite: String(PEDIDO) });
    if (tabela) q.set('tabela', tabela);
    if (operacao) q.set('operacao', operacao);
    if (desde) q.set('desde', `${desde}T00:00:00.000Z`);
    if (rodadas) q.set('rodadas', '1');
    return q;
  };

  const trilha = useDados<RespostaDaTrilha>(
    () => api.get(`/auditoria?${consulta().toString()}`),
    [tabela, operacao, desde, rodadas]);

  /* As páginas anteriores, presas à primeira (ver `Anteriores`): trocar um
     filtro relê a primeira, e as anteriores da consulta velha somem sozinhas. */
  const [maisAntigas, setMaisAntigas] = useState<Anteriores>(() => semAnteriores(null));
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [erroAnteriores, setErroAnteriores] = useState<string | null>(null);
  const anteriores = anterioresDe(maisAntigas, trilha.dado);

  async function carregarAnteriores() {
    if (!anteriores.proximo || carregandoAnteriores) return;
    const de = anteriores;
    setCarregandoAnteriores(true);
    setErroAnteriores(null);
    try {
      const q = consulta();
      q.set('antes_de', de.proximo!);
      const pagina = await api.get<RespostaDaTrilha>(`/auditoria?${q.toString()}`);
      setMaisAntigas(acrescentarPagina(de, pagina));
    } catch (e) {
      setErroAnteriores(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregandoAnteriores(false);
    }
  }

  const linhas = [...(trilha.dado?.linhas ?? []), ...anteriores.linhas];
  const visiveis = busca
    ? linhas.filter((l) => contem(quemFez(l), busca)
        || contem(rotuloDaTabela(l.tabela), busca)
        || contem(resumoDaLinha(l), busca)
        || contem(l.registro_id, busca))
    : linhas;

  const dias = porDia(visiveis, hojeISO());
  const haAnteriores = trilha.dado ? temAnteriores(anteriores) : false;

  /* As tabelas do filtro vêm do que EXISTE na trilha, e não de uma lista
     escrita — que envelheceria na primeira migration. O batimento da máquina só
     aparece na lista quando o interruptor está ligado: oferecê-lo desligado
     seria oferecer um filtro que devolve o que a tela acabou de esconder. */
  const opcoes = (trilha.dado?.tabelas ?? [])
    .filter((t) => rodadas || !ehRodadaAutomatica(t.tabela))
    .map((t) => ({ valor: t.tabela, texto: `${rotuloDaTabela(t.tabela)} (${t.linhas})` }));

  return (
    <Pagina titulo="Histórico"
            sub="Quem criou, alterou ou apagou o quê neste sistema, e quando.">

      <Ferramentas contagem={trilha.dado ? `${visiveis.length} de ${linhas.length}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="quem fez, o que foi tocado…" />
        <Filtro valor={tabela} ao={setTabela} rotulo="O que"
                opcoes={[{ valor: '', texto: 'Tudo' }, ...opcoes]} />
        <Filtro valor={operacao} ao={setOperacao} rotulo="Ação"
                opcoes={[
                  { valor: '', texto: 'Todas as ações' },
                  { valor: 'I', texto: 'Só o que foi criado' },
                  { valor: 'U', texto: 'Só o que foi alterado' },
                  { valor: 'D', texto: 'Só o que foi apagado' },
                ]} />
        {/* O «Desde» é o rótulo DA data (htmlFor), e não um label em volta de um
            grupo: o nome que o leitor de tela ouve é o que está escrito. Corpo
            de meta (13,5px) e não 12px: o detector mediu o 12 como miúdo. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label htmlFor="historico-desde" className="rotulo-em-linha">Desde</label>
          <CampoData id="historico-desde" valor={desde} ao={setDesde} />
        </span>
        {(busca || tabela || operacao || desde) && (
          <button type="button"
                  onClick={() => { setBusca(''); setTabela(''); setOperacao(''); setDesde(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      {/* O INTERRUPTOR VEM COM A EXPLICAÇÃO AO LADO, e não sozinho: sem ela,
          "rotinas automáticas" pareceria uma coisa que a pessoa está deixando de
          ver por descuido. Com ela, fica claro que o que está escondido é o
          relógio do sistema, e que quem responde por ele é outra tela. */}
      <div className="cartao secao" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Interruptor ligado={rodadas} ao={setRodadas}
                     rotulo="Mostrar também as rotinas automáticas" />
        {/* [01/10/2026, etapa 6] Na medida de leitura e no tamanho de meta:
            a 12px e na largura do cartão ela corria 150 caracteres por linha. */}
        <span className="fraco" style={{ fontSize: 'var(--t-meta)', maxWidth: '72ch' }}>
          As rotinas que rodam sozinhas se registram aqui a cada poucos minutos e respondem por
          quase toda a lista. Para saber se elas estão rodando, a resposta melhor está no rodapé
          da tela Mês, no setor Rateio.
        </span>
      </div>

      {trilha.erro && <Aviso tipo="erro">Não foi possível ler o histórico: {trilha.erro}</Aviso>}

      {/* A BUSCA OLHA SÓ O QUE ESTÁ NA TELA, e com mais para trás isso precisa ser
          dito: «nada encontrado» nas 200 carregadas não é «nada na história». */}
      {haAnteriores && busca && (
        <Aviso tipo="alerta">
          <strong>A busca olha só as {linhas.length} alterações carregadas.</strong> O que você
          procura pode estar mais para trás: carregue as anteriores no fim da lista, ou escolha
          uma data em «Desde» para começar mais perto.
        </Aviso>
      )}

      {trilha.carregando ? <Carregando /> : (
        <Tabela vazio={tabela || operacao || desde || busca
                  ? 'Nada foi feito dentro desses filtros.'
                  : 'Nada foi criado, alterado ou apagado por ninguém ainda.'}
                cabecalho={<>
                  <th style={{ width: '5.5rem' }}>Quando</th>
                  <th>Quem</th>
                  <th>O que</th>
                  <th>Mudou</th>
                  <th style={{ width: '2.5rem' }} />
                </>}>
          {dias.map((d) => (
            <Dia key={d.dia} titulo={d.titulo} linhas={d.linhas} />
          ))}
        </Tabela>
      )}

      {/* O FIM DA LISTA DIZ SE A HISTÓRIA ACABOU. Com mais para trás, o botão
          traz a página anterior no tempo; sem, a frase diz que é o começo — e
          não deixa a pessoa rolando à procura de um botão que não existe. */}
      {!trilha.carregando && trilha.dado && linhas.length > 0 && (
        <div className="secao" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {haAnteriores ? (
            <button type="button" onClick={() => void carregarAnteriores()} disabled={carregandoAnteriores}>
              <Icone nome="ordem_decrescente" tamanho={15} />{' '}
              {carregandoAnteriores ? 'Carregando…' : `Carregar as ${PEDIDO} anteriores`}
            </button>
          ) : (
            <span className="fraco" style={{ fontSize: 'var(--t-meta)' }}>
              Este é o começo da história dentro desses filtros.
            </span>
          )}
          {erroAnteriores && (
            <Aviso tipo="erro">Não foi possível carregar as anteriores: {erroAnteriores}</Aviso>
          )}
        </div>
      )}
    </Pagina>
  );
}

/** O dia como cabeçalho dentro da tabela: uma linha de contexto a cada troca de
 *  data, em vez de repetir a data em todas as linhas. */
function Dia(p: { titulo: string; linhas: readonly LinhaDaTrilha[] }) {
  return (
    <>
      {/* A linha do dia é um CABEÇALHO DE GRUPO da casa ("grupo-da-tabela"):
          no celular ela vira o título que separa os cartões do dia, e não um
          cartão vazio (01/10/2026, etapa 5). */}
      <tr className="grupo-da-tabela">
        <td colSpan={5}>
          <strong>{p.titulo}</strong>{' '}
          <span className="fraco" style={{ fontSize: 'var(--t-meta)' }}>
            · {p.linhas.length} {p.linhas.length === 1 ? 'alteração' : 'alterações'}
          </span>
        </td>
      </tr>
      {p.linhas.map((l) => <LinhaDoHistorico key={l.id} l={l} />)}
    </>
  );
}

function LinhaDoHistorico({ l }: { l: LinhaDaTrilha }) {
  const [aberta, setAberta] = useState(false);
  const resumo = resumoDaLinha(l);

  return (
    <>
      <tr>
        <td>{horaDaLinha(l.ocorrido_em)}</td>
        <td>{quemFez(l)}</td>
        <td className="c-id">
          <Marca selo={SELO_DA_TRILHA[l.operacao as 'I' | 'U' | 'D'] ?? SELO_DA_TRILHA.U}>
            {VERBO[l.operacao]}
          </Marca>{' '}
          {rotuloDaTabela(l.tabela)}
        </td>
        <td className="fraco">{resumo}</td>
        <td>
          <button type="button" disabled={l.mudancas.length === 0}
                  aria-expanded={aberta}
                  title={aberta ? 'Fechar o detalhe' : 'Ver o que mudou'}
                  aria-label={aberta ? 'Fechar o detalhe' : 'Ver o que mudou'}
                  onClick={() => setAberta(!aberta)}>
            <Icone nome={aberta ? 'ordem_crescente' : 'ordem_decrescente'} tamanho={15} />
          </button>
        </td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={5}>
            <Diferenca l={l} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * O ANTES E O DEPOIS, campo a campo.
 *
 * DUAS COLUNAS E NÃO UMA FRASE: "de X para Y" lido vinte vezes seguidas vira
 * ruído, e a tabela deixa o olho descer pela coluna do depois, que é a que
 * responde "como está agora".
 */
function Diferenca({ l }: { l: LinhaDaTrilha }) {
  return (
    <div className="cartao" style={{ margin: 0 }}>
      <Tabela cabecalho={<><th>Campo</th><th>Antes</th><th>Depois</th></>}>
        {l.mudancas.map((m) => (
          <tr key={m.coluna}>
            <td>{rotuloDaColuna(m.coluna)}</td>
            <td className="fraco">{valorNaTela(m.coluna, m.de)}</td>
            <td><strong>{valorNaTela(m.coluna, m.para)}</strong></td>
          </tr>
        ))}
      </Tabela>
      {l.mudancas.some((m) => m.cortado) && (
        <p className="fraco" style={{ fontSize: 'var(--t-meta)', marginBottom: 0 }}>
          Um dos valores é longo demais para caber aqui e aparece cortado. O que está guardado
          continua inteiro — o corte é só do que a tela mostra.
        </p>
      )}
      {/* O identificador do registro é a única coisa desta tela que serve para
          quem vai procurar no banco, e é exatamente o tipo de ponteiro que mora
          atrás do clique — não na superfície. */}
      <DetalheTecnico>
        <code>{l.tabela} · {l.registro_id ?? 'sem registro_id'}</code>
      </DetalheTecnico>
    </div>
  );
}
