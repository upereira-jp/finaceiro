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
  horaDaLinha, veioCortada, ehRodadaAutomatica, VERBO,
  type LinhaDaTrilha, type RespostaDaTrilha,
} from '../historico.ts';

/** O tom de cada operação: criar é ganho, apagar é perda, alterar é neutro. Os
 *  três tons são os mesmos das outras telas — `ok`, `pendente`, `nao_medido` —,
 *  e "pendente" aqui não quer dizer que há trabalho a fazer: quer dizer que a
 *  linha merece um segundo olhar, que é o que apagar merece. */
const TOM: Record<string, 'ok' | 'pendente' | 'nao_medido'> = {
  I: 'ok', U: 'nao_medido', D: 'pendente',
};

const hojeISO = () => new Date().toISOString().slice(0, 10);

export function TelaHistorico() {
  const [tabela, setTabela] = useState('');
  const [operacao, setOperacao] = useState('');
  const [desde, setDesde] = useState('');
  const [rodadas, setRodadas] = useState(false);
  const [busca, setBusca] = useState('');

  const PEDIDO = 200;

  const trilha = useDados<RespostaDaTrilha>(() => {
    const q = new URLSearchParams({ limite: String(PEDIDO) });
    if (tabela) q.set('tabela', tabela);
    if (operacao) q.set('operacao', operacao);
    if (desde) q.set('desde', `${desde}T00:00:00.000Z`);
    if (rodadas) q.set('rodadas', '1');
    return api.get(`/auditoria?${q.toString()}`);
  }, [tabela, operacao, desde, rodadas]);

  const linhas = trilha.dado?.linhas ?? [];
  const visiveis = busca
    ? linhas.filter((l) => contem(quemFez(l), busca)
        || contem(rotuloDaTabela(l.tabela), busca)
        || contem(resumoDaLinha(l), busca)
        || contem(l.registro_id, busca))
    : linhas;

  const dias = porDia(visiveis, hojeISO());
  const cortada = trilha.dado ? veioCortada(trilha.dado, PEDIDO) : false;

  /* As tabelas do filtro vêm do que EXISTE na trilha, e não de uma lista
     escrita — que envelheceria na primeira migration. O batimento da máquina só
     aparece na lista quando o interruptor está ligado: oferecê-lo desligado
     seria oferecer um filtro que devolve o que a tela acabou de esconder. */
  const opcoes = (trilha.dado?.tabelas ?? [])
    .filter((t) => rodadas || !ehRodadaAutomatica(t.tabela))
    .map((t) => ({ valor: t.tabela, texto: `${rotuloDaTabela(t.tabela)} (${t.linhas})` }));

  return (
    <Pagina titulo="Histórico"
            sub="Tudo o que foi criado, alterado ou apagado neste sistema — quem fez, quando, e o que mudou.">

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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="fraco" style={{ fontSize: 12 }}>Desde</span>
          <CampoData valor={desde} ao={setDesde} rotuloAcessivel="Mostrar a partir desta data" />
        </label>
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
        <span className="fraco" style={{ fontSize: 12 }}>
          As rotinas que rodam sozinhas se registram aqui a cada poucos minutos e respondem por
          quase toda a lista. Para saber se elas estão rodando, a resposta melhor está no rodapé
          da tela de Pendências.
        </span>
      </div>

      {trilha.erro && <Aviso tipo="erro">Não foi possível ler o histórico: {trilha.erro}</Aviso>}

      {cortada && (
        <Aviso tipo="alerta">
          <strong>Esta é só a parte mais recente.</strong> A lista foi cortada no que cabe de uma
          vez, então o que você procura pode estar antes do começo dela. Escolha uma data em
          «Desde», ou filtre por um tipo, para chegar mais perto.
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
    </Pagina>
  );
}

/** O dia como cabeçalho dentro da tabela: uma linha de contexto a cada troca de
 *  data, em vez de repetir a data em todas as linhas. */
function Dia(p: { titulo: string; linhas: readonly LinhaDaTrilha[] }) {
  return (
    <>
      <tr>
        <td colSpan={5} style={{ paddingTop: 18 }}>
          <strong>{p.titulo}</strong>{' '}
          <span className="fraco" style={{ fontSize: 12 }}>
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
        <td>
          <Marca tom={TOM[l.operacao] ?? 'nao_medido'}
                 icone={l.operacao === 'I' ? 'acrescentar' : l.operacao === 'D' ? 'remover' : 'confirmar'}>
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
      <div className="rolagem">
      <table>
        <thead>
          <tr>
            <th>Campo</th>
            <th>Antes</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          {l.mudancas.map((m) => (
            <tr key={m.coluna}>
              <td>{rotuloDaColuna(m.coluna)}</td>
              <td className="fraco">{valorNaTela(m.coluna, m.de)}</td>
              <td><strong>{valorNaTela(m.coluna, m.para)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {l.mudancas.some((m) => m.cortado) && (
        <p className="fraco" style={{ fontSize: 12, marginBottom: 0 }}>
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
