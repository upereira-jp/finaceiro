// RELATORIOS: repasse ao dono da usina, comissao do originador e uso da usina.
//
// POR QUE ESTA TELA EXISTE. As tres consultas ja respondiam - `/repasses`,
// `/comissoes` e `/carteira/uso-das-usinas`, todas pelo pool de RELATORIO, com
// timeout proprio - e nenhuma tinha tela. O numero saia por `curl` ou nao saia, e
// quem precisa dele e o contador.
//
// AS TRES SAO VIEWS DO BANCO, nao contas feitas aqui: `repasse_por_dono_usina`,
// `comissao_por_originador` e `uso_da_usina_por_competencia`. A tela soma nada -
// e isso e deliberado, porque somar no browser criaria uma segunda definicao do
// numero, que e como duas telas passam a discordar.
//
// O VAZIO AQUI TEM SIGNIFICADO PRECISO, e ele nao e "erro": o split so roda no
// evento de caixa (PRD 5.2), e enquanto nenhuma fatura for liquidada as duas
// primeiras tabelas ficam vazias com razao. A tela diz isso, em vez de mostrar
// uma tabela vazia que parece defeito - e diz tambem quando o vazio e falha de
// leitura, que e a distincao da sessao 12.

import { api, type Repasse, type Comissao, type UsoDaUsina } from '../api.ts';
import { useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, linha, Icone, Carregando, DetalheTecnico, Interruptor, DICA_DO_MES } from '../ui.tsx';
import { competenciaISO, emReais, decimalEmBr } from '../dinheiro.ts';
import { mesEmBr, mesPorExtenso } from '../formato.ts';
import { navegar } from '../rota.tsx';
import { useMesDoTrabalho, AvisoDoMesVelho } from '../seletor-de-mes.tsx';
import { enderecoComOMes, enderecoSemOMes } from '../mes-do-trabalho.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo, type Coluna } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';

/** A competencia e OPCIONAL nas tres rotas: sem ela, a serie inteira. */
const comCompetencia = (base: string, mes: string) =>
  mes ? `${base}${base.includes('?') ? '&' : '?'}competencia=${competenciaISO(mes)}` : base;

/*
 * O MÊS EM RELATÓRIOS (01/10/2026, etapa 8). Até aqui a tela tinha o próprio
 * campo de mês, vazio por padrão («Todos os meses»). Com o mês de trabalho
 * escolhido uma vez no menu, um quarto seletor seria a mesma confusão que a
 * etapa tirou das outras três — e Relatórios não é tela do trabalho do mês:
 * é a SÉRIE, que o contador pede inteira (o repasse devido se acumula, a
 * comissão vem em parcelas). Por isso:
 *
 *   o padrão continua «todos os meses»;
 *   recortar num mês só é um interruptor, «Só setembro de 2026», e o mês é o
 *   de TRABALHO — para ver outro mês, troca-se o mês no menu;
 *   o recorte ligado é o `?mes=` no endereço: o link copiado e o F5 voltam
 *   recortados, e quem chega com `?mes=` chega recortado (e muda o mês de
 *   trabalho, como em qualquer tela do mês).
 */
export function TelaRelatorios() {
  const trabalho = useMesDoTrabalho();
  const recorte = trabalho.recorte && Boolean(trabalho.mes);
  const mes = recorte ? trabalho.mes! : '';
  const alternarRecorte = (ligar: boolean) => {
    const lugar = { caminho: location.pathname, busca: location.search, fragmento: location.hash };
    /* `navegar(…, true)`: troca o endereço sem empilhar histórico e AVISA a
       casca, que lê o recorte do endereço. */
    if (!ligar) { navegar(enderecoSemOMes(lugar), true); return; }
    /* Ligar é pôr o `?mes=` — como numa tela que segue o mês. */
    const com = trabalho.mes ? enderecoComOMes(lugar, trabalho.mes, 'segue') : null;
    if (com) navegar(com, true);
  };

  const repasses = useDados<Repasse[]>(() => api.get(comCompetencia('/repasses', mes)), [mes]);
  const comissoes = useDados<Comissao[]>(() => api.get(comCompetencia('/comissoes', mes)), [mes]);
  const uso = useDados<UsoDaUsina[]>(() => api.get(comCompetencia('/carteira/uso-das-usinas', mes)), [mes]);

  return (
    <Pagina titulo="Relatórios" mes={recorte ? mesPorExtenso(mes) : null}
            sub="Quanto cabe a cada dono de usina, a comissão e o uso de cada usina.">
      {recorte && <AvisoDoMesVelho />}
      {/* O RECORTE: todos os meses (o padrão) ou só o mês de trabalho. A linha
          diz qual está valendo, com a dica do mês do consumo ao lado. */}
      <div className="cartao secao relatorio-recorte">
        <Interruptor ligado={recorte} desabilitado={!trabalho.mes}
                     rotulo={trabalho.mes ? `Só ${mesPorExtenso(trabalho.mes)}, o mês de trabalho` : 'Só o mês de trabalho'}
                     ao={alternarRecorte} />
        <p className="relatorio-recorte-nota">
          {recorte
            ? <>Mostrando só {mesPorExtenso(mes)} — {DICA_DO_MES}. Para outro mês, troque o mês de trabalho no menu.</>
            : <>Mostrando todos os meses, um por linha.</>}
        </p>
      </div>

      <Bloco titulo="Repasse por dono de usina"
             nota="O que a G3 deve a quem é dono da usina, mês a mês."
             carga={repasses}
             vazio="Nenhum repasse ainda — a divisão do dinheiro só acontece quando uma cobrança é paga."
             csv={{ assunto: 'repasses', mes, colunas: [
               { titulo: 'Dono', de: (r: Repasse) => r.dono },
               { titulo: 'Mes de referencia', de: (r: Repasse) => String(r.competencia).slice(0, 7) },
               { titulo: 'Itens', de: (r: Repasse) => r.itens },
               { titulo: 'Valor R$', de: (r: Repasse) => reaisParaPlanilha(r.valor_centavos) },
             ] }}
             cabecalho={<><th>Dono</th><th>Mês de ref.</th><th className="num">Itens</th><th className="num">Valor</th></>}
             corpo={(r: Repasse, i: number) => (
               <tr key={`${r.dono}-${r.competencia}-${i}`}>
                 <td><strong>{r.dono}</strong></td>
                 <td>{mesEmBr(r.competencia)}</td>
                 <td className="num">{r.itens}</td>
                 <td className="num c-val">{emReais(r.valor_centavos)}</td>
               </tr>
             )} />

      <Bloco titulo="Comissão por quem trouxe o cliente"
             nota="A parcela importa: a comissão sai na 1ª e na 2ª cobrança cheia paga do cliente, e é zero da 3ª em diante."
             detalhe={<DetalheTecnico>
               <p style={{ margin: 0 }}>A escala das parcelas é a do PRD §5.4; a soma vem da view <code>comissao_por_originador</code>.</p>
             </DetalheTecnico>}
             carga={comissoes}
             vazio="Nenhuma comissão ainda. Se já houve pagamento e isto continua vazio, olhe se o contrato tem quem trouxe o cliente — a tela Mês acusa, na lista do cadastro."
             csv={{ assunto: 'comissoes', mes, colunas: [
               { titulo: 'Originador', de: (c: Comissao) => c.originador },
               { titulo: 'Mes de referencia', de: (c: Comissao) => String(c.competencia).slice(0, 7) },
               { titulo: 'Parcela', de: (c: Comissao) => c.parcela_comissao },
               { titulo: 'Itens', de: (c: Comissao) => c.itens },
               { titulo: 'Valor R$', de: (c: Comissao) => reaisParaPlanilha(c.valor_centavos) },
             ] }}
             cabecalho={<><th>Quem trouxe o cliente</th><th>Mês de ref.</th><th className="num">Parcela</th><th className="num">Itens</th><th className="num">Valor</th></>}
             corpo={(c: Comissao, i: number) => (
               <tr key={`${c.originador}-${c.competencia}-${c.parcela_comissao}-${i}`}>
                 <td><strong>{c.originador}</strong></td>
                 <td>{mesEmBr(c.competencia)}</td>
                 <td className="num">{c.parcela_comissao}ª</td>
                 <td className="num">{c.itens}</td>
                 <td className="num c-val">{emReais(c.valor_centavos)}</td>
               </tr>
             )} />

      <Bloco titulo="Uso da usina, mês a mês"
             nota="A energia que a usina gerou contra a energia cobrada dos clientes, mês a mês. Saldo negativo quer dizer que se cobrou mais do que a usina gerou — sinal de uma cobrança montada fora do caminho normal, que vale conferir."
             detalhe={<DetalheTecnico>
               <p style={{ margin: 0 }}>A coluna é <code>saldo_kwh</code> da view <code>uso_da_usina_por_competencia</code>; o negativo é a <code>RATEIO-USO-01</code> ficando visível.</p>
             </DetalheTecnico>}
             carga={uso}
             vazio="Nenhum mês tem, ao mesmo tempo, energia gerada e cobrança emitida para comparar."
             csv={{ assunto: 'uso-das-usinas', mes, colunas: [
               { titulo: 'Geradora', de: (u: UsoDaUsina) => u.codigo_geradora },
               { titulo: 'Mes de referencia', de: (u: UsoDaUsina) => String(u.competencia).slice(0, 7) },
               { titulo: 'Geração kWh', de: (u: UsoDaUsina) => u.geracao_kwh ?? '' },
               { titulo: 'Faturado kWh', de: (u: UsoDaUsina) => u.consumo_faturado_kwh ?? '' },
               { titulo: 'Saldo kWh', de: (u: UsoDaUsina) => u.saldo_kwh ?? '' },
             ] }}
             cabecalho={<><th>Geradora</th><th>Mês de ref.</th><th className="num">Geração kWh</th><th className="num">Faturado kWh</th><th className="num">Saldo kWh</th></>}
             corpo={(u: UsoDaUsina, i: number) => {
               // kWh chega como STRING (numeric do Postgres). O `Number` aqui e
               // so para decidir a COR - nao volta para conta nenhuma, e por isso
               // nao fura a regra 1.
               const negativo = Number(u.saldo_kwh ?? 0) < 0;
               return (
                 <tr key={`${u.codigo_geradora}-${u.competencia}-${i}`}>
                   <td><strong>{u.codigo_geradora}</strong></td>
                   <td>{mesEmBr(u.competencia)}</td>
                   {/* kWh em portugues e na escala do banco (`decimalEmBr`): as tres
                       colunas com as mesmas duas casas alinham de cima a baixo. */}
                   <td className="num">{decimalEmBr(u.geracao_kwh)}</td>
                   <td className="num">{decimalEmBr(u.consumo_faturado_kwh)}</td>
                   <td className="num c-val" style={{ color: negativo ? 'var(--erro)' : undefined }}>
                     {decimalEmBr(u.saldo_kwh)}
                   </td>
                 </tr>
               );
             }} />
    </Pagina>
  );
}

// ------------------------------------------------------------------- o bloco
//
// Tres tabelas com o mesmo esqueleto: titulo, nota, erro, vazio explicado e
// botao de CSV. Um componente em vez de tres copias porque o que precisa ser
// igual nas tres e justamente o tratamento do erro e do vazio.

type Carga<T> = { dado: T[] | null; carregando: boolean; erro: string | null };

function Bloco<T>(p: {
  titulo: string; nota: string; vazio: string;
  /** O ponteiro para quem mantém o número (a view, o código da questão) — um
   *  `<DetalheTecnico>` inteiro, escrito por quem chama, para a suíte de
   *  vocabulário enxergar o esconderijo onde o texto mora. */
  detalhe?: React.ReactNode;
  carga: Carga<T>;
  csv: { assunto: string; mes: string; colunas: Array<Coluna<T>> };
  cabecalho: React.ReactNode;
  corpo: (t: T, i: number) => React.ReactNode;
}) {
  const lista = p.carga.dado ?? [];
  return (
    <section style={{ marginBottom: 28 }}>
      {/* [01/10/2026, etapa 6] O titulo e a nota ficam juntos, e o botao ao
          lado deles: no telefone a nota caia DEPOIS do «Exportar CSV», separada
          do titulo que ela explica. */}
      <div style={{ ...linha, gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{p.titulo}</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>{p.nota}</p>
        </div>
        <button style={{ marginLeft: 'auto' }} disabled={!lista.length}
                onClick={() => baixarCsv(
                  nomeDoArquivo(p.csv.assunto, p.csv.mes || undefined),
                  paraCsv(p.csv.colunas, lista),
                )}>
          <Icone nome="baixar" tamanho={15} /> Exportar CSV
        </button>
      </div>
      <div style={{ height: 14 }} />
      {p.detalhe}
      {p.carga.erro && (
        <Aviso tipo="erro">
          Não foi possível ler: {p.carga.erro} — a tabela abaixo não está vazia,
          ela é <strong>desconhecida</strong>.
        </Aviso>
      )}
      <Tabela cabecalho={p.cabecalho}
              vazio={p.carga.carregando ? <Carregando /> : p.carga.erro ? 'Desconhecido.' : p.vazio}>
        {lista.map(p.corpo)}
      </Tabela>
    </section>
  );
}
