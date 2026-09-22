// CONTAS A RECEBER — o retrato do caixa a ENTRAR, para a vertente da empresa.
//
// ============================================================================
// POR QUE ESTA TELA EXISTE, e por que ela não é a de Emissão e cobrança
//
// Emissão e cobrança responde por MÊS: é a tela dos ATOS (emitir, pedir o
// boleto, dar baixa), e o seletor de mês é o que faz sentido para agir. Mas a
// pergunta de quem cuida do caixa é outra — «quanto os clientes devem AO TODO,
// quanto já venceu, quanto vence esta semana, quanto entrou» —, e ela é sobre a
// carteira inteira, por vencimento. Até 22/09/2026 uma fatura de maio que nunca
// foi paga só aparecia para quem lembrasse de voltar o seletor para maio.
//
// É A PONTE ENTRE OS DOIS FUNIS: lê o que o Rateio produziu e apresenta como a
// Empresa precisa ler. Por isso é a PRIMEIRA tela da metade Empresa.
//
// O QUE ELA NÃO OFERECE, e a ausência é a regra: nenhum botão de cobrar. Cobrar
// é ato do Rateio, e um segundo caminho de baixa aqui seria a mesma regra em dois
// lugares. O que ela oferece é «Ver na emissão», que abre a outra tela já no mês
// da fatura.
//
// TODA CONTA DE DIA PARTE DO `hoje` DO SERVIDOR (regra em `receber-regras.ts`),
// e as regras são puras e têm suíte própria — aqui fica só o desenho.

import { useState } from 'react';
import { api, type ContasAReceber, type TituloAReceber } from '../api.ts';
import { useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Kpi, Marca, Busca, Ferramentas, Filtro, ThOrd, Icone, Carregando,
  DetalheTecnico, useOrdenacao, ordenar, contem, linha,
} from '../ui.tsx';
import { Ligacao } from '../rota.tsx';
import { emReais } from '../dinheiro.ts';
import { emBr } from '../contas-regras.ts';
import {
  diasDeAtraso, faixaDeAtraso, fraseDoAtraso, FAIXAS, ROTULO_DA_FAIXA, TOM_DA_FAIXA,
  situacaoDaCobranca, SITUACOES, ROTULO_DA_SITUACAO, TOM_DA_SITUACAO,
  porFaixa, porCliente, totalCentavos, avisoDeTruncagem,
  type FaixaDeAtraso, type SituacaoDaCobranca,
} from '../receber-regras.ts';
import { paraCsv, reaisParaPlanilha, nomeDoArquivo, type Coluna } from '../csv.ts';
import { baixarCsv } from '../baixar.ts';

const MAIS_DEVEDORES = 8;

export function TelaContasAReceber() {
  const carga = useDados<ContasAReceber>(() => api.get('/contas-a-receber'));

  const [busca, setBusca] = useState('');
  const [faixa, setFaixa] = useState<'' | FaixaDeAtraso>('');
  const [situacao, setSituacao] = useState<'' | SituacaoDaCobranca>('');
  const { ordem, alternar } = useOrdenacao('vencimento');

  const dados = carga.dado;
  const hoje = dados?.hoje ?? '';
  const todas: readonly TituloAReceber[] = dados?.linhas ?? [];

  const visiveis = ordenar(
    todas.filter((t) =>
      (contem(t.cliente, busca) || contem(t.unidade, busca))
      && (!faixa || faixaDeAtraso(t.vencimento, hoje) === faixa)
      && (!situacao || situacaoDaCobranca(t.boleto) === situacao)),
    ordem,
    {
      vencimento: (t) => t.vencimento,
      atraso: (t) => diasDeAtraso(t.vencimento, hoje),
      cliente: (t) => t.cliente,
      unidade: (t) => t.unidade,
      competencia: (t) => t.competencia,
      valor: (t) => t.valor_total_centavos,
      cobranca: (t) => situacaoDaCobranca(t.boleto),
    },
  );

  const faixas = dados ? porFaixa(todas, hoje) : [];
  const devedores = dados ? porCliente(todas, hoje).slice(0, MAIS_DEVEDORES) : [];
  const truncagem = dados ? avisoDeTruncagem(dados.total, todas.length) : null;
  const r = dados?.resumo;

  const COLUNAS: Coluna<TituloAReceber>[] = [
    { titulo: 'Vencimento', de: (t) => String(t.vencimento).slice(0, 10) },
    { titulo: 'Dias de atraso', de: (t) => Math.max(0, diasDeAtraso(t.vencimento, hoje)) },
    { titulo: 'Cliente', de: (t) => t.cliente },
    { titulo: 'Unidade', de: (t) => t.unidade },
    { titulo: 'Mes de referencia', de: (t) => String(t.competencia).slice(0, 7) },
    { titulo: 'Valor R$', de: (t) => reaisParaPlanilha(t.valor_total_centavos) },
    { titulo: 'Cobranca', de: (t) => ROTULO_DA_SITUACAO[situacaoDaCobranca(t.boleto)] },
    { titulo: 'Nosso numero', de: (t) => t.boleto?.nosso_numero ?? '' },
  ];

  return (
    <Pagina titulo="Contas a receber"
            sub="Tudo o que os clientes ainda devem, de qualquer mês: quanto venceu, quanto vence nos próximos dias e se cada título tem boleto para ser pago. Cobrar — emitir, pedir o boleto, dar baixa — continua em Emissão e cobrança.">

      {carga.erro && (
        <Aviso tipo="erro">
          Não foi possível ler as contas a receber: {carga.erro}. Os números abaixo não estão
          zerados — estão <strong>desconhecidos</strong>.
        </Aviso>
      )}

      {carga.carregando && <Carregando texto="Contando a carteira…" />}

      {r && (
        <>
          <div className="kpis">
            <Kpi nome="A receber" icone="a_receber" valor={emReais(r.em_aberto.centavos)} />
            <Kpi nome="Vencido" icone="vencidas" valor={emReais(r.vencido.centavos)}
                 tom={r.vencido.titulos ? 'erro' : undefined} />
            <Kpi nome="Vence em 7 dias" icone="calendario" valor={emReais(r.vence_em_7_dias.centavos)} />
            <Kpi nome="Recebido nos últimos 30 dias" icone="recebido"
                 valor={emReais(r.recebido_em_30_dias.centavos)}
                 tom={r.recebido_em_30_dias.titulos ? 'ok' : undefined} />
          </div>
          <p className="sub" style={{ marginTop: -8 }}>
            {r.em_aberto.titulos} {r.em_aberto.titulos === 1 ? 'título' : 'títulos'} em aberto,
            {' '}{r.vencido.titulos} {r.vencido.titulos === 1 ? 'vencido' : 'vencidos'},
            {' '}{r.vence_em_30_dias.titulos} {r.vence_em_30_dias.titulos === 1 ? 'vence' : 'vencem'} nos
            próximos 30 dias. Contado em {emBr(r ? dados!.hoje : '')}.
          </p>
        </>
      )}

      {truncagem && <Aviso tipo="alerta">{truncagem}</Aviso>}

      {dados && todas.length > 0 && (
        <div style={{ ...linha, gap: 16, alignItems: 'stretch', marginBottom: 20 }}>
          {/*
            POR TEMPO DE ATRASO. Sempre as cinco faixas, inclusive as zeradas —
            uma tabela de idade que omite a faixa vazia faz quem compara com o
            mes passado achar que a linha sumiu. Clicar numa faixa filtra a
            lista de baixo; clicar de novo solta.
          */}
          <section className="cartao secao" style={{ flex: '1 1 320px', margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Por tempo de atraso</h2>
            <p className="sub">Quanto está parado em cada faixa. Clique numa faixa para ver só ela.</p>
            <Tabela cabecalho={<><th>Faixa</th><th className="num">Títulos</th><th className="num">Valor</th></>}
                    vazio="Nada em aberto.">
              {faixas.map((f) => (
                <tr key={f.faixa}
                    style={{ cursor: 'pointer', fontWeight: faixa === f.faixa ? 650 : undefined }}
                    onClick={() => setFaixa((atual) => (atual === f.faixa ? '' : f.faixa))}>
                  <td><Marca tom={f.titulos ? TOM_DA_FAIXA[f.faixa] : 'nao_medido'}>{ROTULO_DA_FAIXA[f.faixa]}</Marca></td>
                  <td className="num">{f.titulos}</td>
                  <td className="num">{emReais(f.centavos)}</td>
                </tr>
              ))}
            </Tabela>
          </section>

          {/*
            QUEM MAIS DEVE, por cliente e nao por unidade: um cliente com tres
            unidades e UMA pessoa a quem se liga. Quem tem mais VENCIDO vem
            primeiro — o que esta atrasado e o que pede acao.
          */}
          <section className="cartao secao" style={{ flex: '1 1 380px', margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Quem mais deve</h2>
            <p className="sub">Por cliente, somando todas as unidades dele. Clique no nome para ver só os títulos dele.</p>
            <Tabela cabecalho={<><th>Cliente</th><th className="num">Títulos</th><th className="num">Vencido</th><th className="num">Em aberto</th><th>Atraso maior</th></>}
                    vazio="Ninguém deve nada.">
              {devedores.map((d) => (
                <tr key={d.cliente_id} style={{ cursor: 'pointer', fontWeight: busca === d.cliente ? 650 : undefined }}
                    onClick={() => setBusca((atual) => (atual === d.cliente ? '' : d.cliente))}>
                  <td><strong>{d.cliente}</strong></td>
                  <td className="num">{d.titulos}</td>
                  <td className="num" style={{ color: d.vencido_centavos ? 'var(--erro)' : undefined }}>
                    {emReais(d.vencido_centavos)}
                  </td>
                  <td className="num">{emReais(d.centavos)}</td>
                  <td>{d.maior_atraso_dias ? fraseDoAtraso(d.maior_atraso_dias) : '—'}</td>
                </tr>
              ))}
            </Tabela>
          </section>
        </div>
      )}

      <Ferramentas contagem={dados ? `${visiveis.length} de ${todas.length} · ${emReais(totalCentavos(visiveis))}` : undefined}>
        <Busca valor={busca} ao={setBusca} dica="cliente ou unidade" />
        <Filtro valor={faixa} ao={(v) => setFaixa(v as '' | FaixaDeAtraso)} rotulo="Tempo de atraso" opcoes={[
          { valor: '', texto: 'Todas as faixas' },
          ...FAIXAS.map((f) => ({ valor: f, texto: ROTULO_DA_FAIXA[f] })),
        ]} />
        <Filtro valor={situacao} ao={(v) => setSituacao(v as '' | SituacaoDaCobranca)} rotulo="Cobrança" opcoes={[
          { valor: '', texto: 'Qualquer cobrança' },
          ...SITUACOES.map((s) => ({ valor: s, texto: ROTULO_DA_SITUACAO[s] })),
        ]} />
        <button type="button" disabled={!visiveis.length}
                onClick={() => baixarCsv(nomeDoArquivo('contas-a-receber'), paraCsv(COLUNAS, visiveis))}>
          <Icone nome="baixar" tamanho={15} /> Exportar CSV
        </button>
      </Ferramentas>

      <Tabela
        cabecalho={<>
          <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
          <ThOrd chave="atraso" ordem={ordem} ao={alternar}>Atraso</ThOrd>
          <ThOrd chave="cliente" ordem={ordem} ao={alternar}>Cliente</ThOrd>
          <ThOrd chave="unidade" ordem={ordem} ao={alternar}>Unidade</ThOrd>
          <ThOrd chave="competencia" ordem={ordem} ao={alternar}>Mês de ref.</ThOrd>
          <ThOrd chave="valor" ordem={ordem} ao={alternar} num>Valor</ThOrd>
          <ThOrd chave="cobranca" ordem={ordem} ao={alternar}>Cobrança</ThOrd>
          <th></th>
        </>}
        vazio={carga.carregando ? <Carregando />
             : carga.erro ? 'Desconhecido.'
             : todas.length === 0
               ? 'Nenhum título em aberto. Ou tudo o que foi emitido já foi pago, ou nenhuma fatura foi emitida ainda — a aba Pendências diz qual dos dois.'
               : 'Nenhum título com esses filtros.'}>
        {visiveis.map((t) => {
          const dias = diasDeAtraso(t.vencimento, hoje);
          const fx = faixaDeAtraso(t.vencimento, hoje);
          const sit = situacaoDaCobranca(t.boleto);
          return (
            <tr key={t.fatura_id}>
              <td>{emBr(t.vencimento)}</td>
              <td>
                <Marca tom={TOM_DA_FAIXA[fx]} icone={dias > 0 ? 'vencidas' : undefined}>
                  {fraseDoAtraso(dias)}
                </Marca>
              </td>
              <td><strong>{t.cliente}</strong></td>
              <td>{t.unidade}</td>
              <td>{String(t.competencia).slice(0, 7)}</td>
              <td className="num">{emReais(t.valor_total_centavos)}</td>
              <td><Marca tom={TOM_DA_SITUACAO[sit]} icone="boleto">{ROTULO_DA_SITUACAO[sit]}</Marca></td>
              <td>
                {/* Abre Emissao e cobranca JA NO MES da fatura — sem isso a pessoa
                    cai no mes corrente e o titulo antigo some de novo. */}
                <Ligacao para={`/faturas?mes=${String(t.competencia).slice(0, 7)}`}
                         rotulo={`Ver a fatura de ${t.cliente} em Emissão e cobrança`}>
                  Ver na emissão
                </Ligacao>
              </td>
            </tr>
          );
        })}
      </Tabela>

      <DetalheTecnico>
        <p>
          Leitura de <code>GET /contas-a-receber</code> (pool de relatório). Em aberto é
          <code>fatura.status in (emitida, vencida)</code> sem linha em <code>liquidacao</code>;
          vencido é em aberto com <code>vencimento &lt; hoje</code> — a data, e não o status
          <code>vencida</code>, que é registro do ato <code>marcarVencidas()</code>. Recebido nos
          últimos 30 dias é <code>liquidacao.data_liquidacao</code>, ou seja, caixa e não competência.
          Teto de 500 linhas, e o servidor diz quando truncou. Regras em <code>receber-regras.ts</code>,
          suíte <code>web/tests/receber.ts</code>.
        </p>
      </DetalheTecnico>
    </Pagina>
  );
}
