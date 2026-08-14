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

import { useState } from 'react';
import { api, type Repasse, type Comissao, type UsoDaUsina } from '../api.ts';
import { useDados } from '../dados.ts';
import { Pagina, Aviso, Tabela, linha, Icone, CampoData, Carregando, AjudaDoMes } from '../ui.tsx';
import { competenciaISO, emReais } from '../dinheiro.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo, type Coluna } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';

/** A competencia e OPCIONAL nas tres rotas: sem ela, a serie inteira. */
const comCompetencia = (base: string, mes: string) =>
  mes ? `${base}${base.includes('?') ? '&' : '?'}competencia=${competenciaISO(mes)}` : base;

export function TelaRelatorios() {
  const [mes, setMes] = useState('');

  const repasses = useDados<Repasse[]>(() => api.get(comCompetencia('/repasses', mes)), [mes]);
  const comissoes = useDados<Comissao[]>(() => api.get(comCompetencia('/comissoes', mes)), [mes]);
  const uso = useDados<UsoDaUsina[]>(() => api.get(comCompetencia('/carteira/uso-das-usinas', mes)), [mes]);

  return (
    <Pagina titulo="Relatórios"
            sub="Repasse, comissão e uso da usina — como o banco os calcula. Sem competência, a série inteira.">
      <div className="cartao secao">
        <div style={{ ...linha, gap: 12 }}>
          <div>
            <label>Mês de referência (vazio = todos)</label>
            <CampoData mes valor={mes} ao={setMes} rotuloAcessivel="Mês de referência" style={{ width: 'auto' }} /><AjudaDoMes />
          </div>
          {mes && (
            <button style={{ alignSelf: 'end' }} onClick={() => setMes('')}>
              <Icone nome="limpar" tamanho={15} /> Todas as competências
            </button>
          )}
        </div>
      </div>

      <Bloco titulo="Repasse por dono de usina"
             nota="O que a G3 deve a quem é dono da usina, por competência. Sai da view `repasse_por_dono_usina`."
             carga={repasses}
             vazio="Nenhum repasse ainda — o split só roda quando uma fatura é liquidada (PRD 5.2)."
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
                 <td>{String(r.competencia).slice(0, 7)}</td>
                 <td className="num">{r.itens}</td>
                 <td className="num">{emReais(r.valor_centavos)}</td>
               </tr>
             )} />

      <Bloco titulo="Comissão por originador"
             nota="A parcela importa: o PRD §5.4 escalona a comissão na 1ª e na 2ª fatura cheia, e zero da 3ª em diante."
             carga={comissoes}
             vazio="Nenhuma comissão ainda. Se houver liquidação e isto continuar vazio, o caminho a olhar é o contrato sem originador — a prontidão acusa (camada `originador_do_contrato`)."
             csv={{ assunto: 'comissoes', mes, colunas: [
               { titulo: 'Originador', de: (c: Comissao) => c.originador },
               { titulo: 'Mes de referencia', de: (c: Comissao) => String(c.competencia).slice(0, 7) },
               { titulo: 'Parcela', de: (c: Comissao) => c.parcela_comissao },
               { titulo: 'Itens', de: (c: Comissao) => c.itens },
               { titulo: 'Valor R$', de: (c: Comissao) => reaisParaPlanilha(c.valor_centavos) },
             ] }}
             cabecalho={<><th>Originador</th><th>Mês de ref.</th><th className="num">Parcela</th><th className="num">Itens</th><th className="num">Valor</th></>}
             corpo={(c: Comissao, i: number) => (
               <tr key={`${c.originador}-${c.competencia}-${c.parcela_comissao}-${i}`}>
                 <td><strong>{c.originador}</strong></td>
                 <td>{String(c.competencia).slice(0, 7)}</td>
                 <td className="num">{c.parcela_comissao}ª</td>
                 <td className="num">{c.itens}</td>
                 <td className="num">{emReais(c.valor_centavos)}</td>
               </tr>
             )} />

      <Bloco titulo="Uso da usina por competência"
             nota="Geração lançada contra consumo faturado. `saldo_kwh` negativo significa que a composição foi contornada por outro caminho — é a RATEIO-USO-01 ficando olhável."
             carga={uso}
             vazio="Nenhuma competência com geração e faturamento para cruzar."
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
                   <td>{String(u.competencia).slice(0, 7)}</td>
                   <td className="num">{u.geracao_kwh ?? '—'}</td>
                   <td className="num">{u.consumo_faturado_kwh ?? '—'}</td>
                   <td className="num" style={{ color: negativo ? 'var(--erro)' : undefined }}>
                     {u.saldo_kwh ?? '—'}
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
  carga: Carga<T>;
  csv: { assunto: string; mes: string; colunas: Array<Coluna<T>> };
  cabecalho: React.ReactNode;
  corpo: (t: T, i: number) => React.ReactNode;
}) {
  const lista = p.carga.dado ?? [];
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ ...linha, gap: 12 }}>
        <h2 style={{ margin: 0 }}>{p.titulo}</h2>
        <button style={{ marginLeft: 'auto' }} disabled={!lista.length}
                onClick={() => baixarCsv(
                  nomeDoArquivo(p.csv.assunto, p.csv.mes || undefined),
                  paraCsv(p.csv.colunas, lista),
                )}>
          <Icone nome="baixar" tamanho={15} /> Exportar CSV
        </button>
      </div>
      <p className="sub">{p.nota}</p>
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
