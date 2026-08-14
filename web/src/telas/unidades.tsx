// UNIDADES CONSUMIDORAS — e a tela que fecha a camada `vencimento`.
//
// `data_vencimento` esta 100% vazia em producao, e e a Q-SPEC001-02: quem
// preenche, por UC ou por contrato, nao tem dono resolvido. O servidor RECUSA
// faturar sem ela em vez de escolher um dia (regra 10), entao alguem precisa
// digitar - e ate hoje nao havia onde.
//
// O FILTRO DE PENDENCIA EXISTE POR CAUSA DESSA DIGITACAO: sao 39 UCs para
// preencher, e "mostrar so as que faltam" e a diferenca entre conferir uma
// lista que encolhe e cacar linha por linha numa lista que nao muda.

import { useState } from 'react';
import { api, type UnidadeConsumidora, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Busca, Ferramentas, Filtro, ThOrd, Marca, BotaoDeIcone, CampoData, Icone,
  useOrdenacao, ordenar, contem, rotulo,
} from '../ui.tsx';
import {
  situacaoDaUc, ehFaturavel, contarSituacoes,
  ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, ICONE_DA_SITUACAO,
  type SituacaoDaUc,
} from '../unidades-regras.ts';
import { decimalTexto } from '../dinheiro.ts';

export function TelaUnidades() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  const acao = useAcao();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [rateio, setRateio] = useState<Record<string, string>>({});
  const [tarifa, setTarifa] = useState<Record<string, string>>({});

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pendencia, setPendencia] = useState('');
  const { ordem, alternar } = useOrdenacao('uc');

  const nomeUsina = (id: string | null) =>
    usinas.dado?.find((u) => u.id === id)?.codigo_geradora ?? (id ? '—' : null);

  const todas = ucs.dado ?? [];
  const visiveis = ordenar(
    todas.filter((u) =>
      (contem(u.numero_uc, busca) || contem(u.distribuidora, busca)) &&
      (!situacao || situacaoDaUc(u) === situacao) &&
      (pendencia !== 'sem_vencimento' || !u.data_vencimento) &&
      (pendencia !== 'sem_tarifa' || !u.tarifa_reais_por_kwh) &&
      (pendencia !== 'sem_usina' || !u.usina_id)),
    ordem,
    {
      uc: (u) => u.numero_uc,
      distribuidora: (u) => u.distribuidora,
      usina: (u) => nomeUsina(u.usina_id),
      rateio: (u) => (u.percentual_rateio == null ? null : parseFloat(u.percentual_rateio)),
      vencimento: (u) => u.data_vencimento,
      tarifa: (u) => (u.tarifa_reais_por_kwh == null ? null : parseFloat(u.tarifa_reais_por_kwh)),
      situacao: (u) => situacaoDaUc(u),
    },
  );

  async function salvarVencimento(uc: UnidadeConsumidora) {
    const v = edicao[uc.id];
    if (!v) return;
    const ok = await acao.executar(() => api.patch(`/unidades-consumidoras/${uc.id}`, { data_vencimento: v }));
    if (ok) { acao.anunciar(`Vencimento da ${uc.numero_uc} gravado.`); ucs.recarregar(); }
  }

  /*
   * A TARIFA DA UC (migration 30). Ela chegou aqui em 14/08, quando a aba
   * Tarifas saiu - decisao do dono: *"o campo tarifa nao deve ser selecionado
   * dentro do sistema financeiro, deve ser puxado do card do CRM"*, e depois
   * *"remova definitivamente a aba Tarifas"*.
   *
   * O QUE A MEDICAO MOSTROU, e e o que justifica o campo estar NESTA linha: a
   * granularidade real e por CLIENTE. Das 41 UCs de producao, 35 a R$ 1,130000,
   * 4 a R$ 1,16 e 2 a R$ 1,180000 - uma tarifa por distribuidora obrigaria as 41
   * a compartilharem um numero que 6 delas contradizem.
   *
   * VAI COMO STRING, como o rateio: R$/kWh e `numeric(12,6)` do outro lado, e
   * truncar 1,187650 em centavos cobra R$ 2,90 a mais numa UC num mes (R22).
   */
  async function salvarTarifa(uc: UnidadeConsumidora) {
    const v = tarifa[uc.id];
    if (v === undefined) return;
    const ok = await acao.executar(() => api.patch(`/unidades-consumidoras/${uc.id}`, {
      tarifa_reais_por_kwh: v.trim() ? decimalTexto(v, 6) : null,
    }));
    if (ok) { acao.anunciar(`Tarifa da ${uc.numero_uc} gravada.`); ucs.recarregar(); }
  }

  async function salvarRateio(uc: UnidadeConsumidora) {
    const pct = rateio[uc.id];
    if (!pct || !uc.usina_id) return;
    // O percentual vai como STRING: a regra 1 mantem proporcao em escala decimal
    // e o repositorio recusa `number` de proposito.
    const ok = await acao.executar(async () =>
      api.put(`/unidades-consumidoras/${uc.id}/rateio`, {
        usina_id: uc.usina_id, percentual_rateio: decimalTexto(pct, 4),
      }));
    if (ok) { acao.anunciar(`Rateio da ${uc.numero_uc} atualizado.`); ucs.recarregar(); }
  }

  /*
   * O ALERTA CONTA AS FATURAVEIS, e ate 04/08 contava as 41.
   *
   * `status === 'ativa'` e o nosso cadastro; faturavel exige tambem o rateio
   * ativado no CRM. Medido no dia: 41 contra 29. O alerta mandava preencher 41
   * vencimentos, e doze deles eram para UC que nao ia faturar de qualquer jeito.
   */
  const semVencimento = todas.filter((u) => !u.data_vencimento && ehFaturavel(u)).length;
  /* O MESMO CRITERIO DO VENCIMENTO, e pelo mesmo motivo: sem tarifa a composicao
   * LEVANTA (R26), e contar as 41 mandaria preencher doze que nao faturam. */
  const semTarifa = todas.filter((u) => !u.tarifa_reais_por_kwh && ehFaturavel(u)).length;
  const contagem = contarSituacoes(todas);

  return (
    <Pagina titulo="Unidades consumidoras"
            sub="Espelhadas do CRM. O dia de vencimento é local e obrigatório para faturar — o servidor recusa em vez de escolher um dia.">
      {semVencimento > 0 && (
        <Aviso tipo="erro">
          {semVencimento} unidade(s) ativa(s) sem dia de vencimento. Sem ele a fatura não nasce
          (<code>sem_vencimento</code>) — é a <code>Q-SPEC001-02</code>.
        </Aviso>
      )}
      {semTarifa > 0 && (
        <Aviso tipo="erro">
          {semTarifa} unidade(s) faturável(is) sem <strong>tarifa</strong> (R$/kWh). Sem ela a
          composição do lote <strong>levanta</strong> em vez de faturar por zero (R26) — e é aqui
          que ela se preenche desde 14/08, quando a aba Tarifas saiu: a tarifa é de cada UC, não
          da distribuidora.
        </Aviso>
      )}
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      {ucs.erro && <Aviso tipo="erro">{ucs.erro}</Aviso>}

      {/* A contagem diz as DUAS coisas. "41 de 41" escondia que so 29 faturam, e
          mostrar so as 29 esconderia as outras doze - o par e o que nao mente
          para nenhum dos dois lados. */}
      <Ferramentas contagem={todas.length
        ? `${visiveis.length} de ${todas.length} · ${contagem.faturaveis} faturáveis`
        : undefined}>
        <Busca valor={busca} ao={setBusca} dica="Buscar por UC ou distribuidora…" />
        {/* As opcoes saem do vocabulario FECHADO de `unidades-regras`, e nao de
            uma lista escrita aqui: uma situacao nova sem opcao de filtro ficaria
            invisivel, e `inativa` - que estava nesta lista - nem existe no enum
            do banco (`ativa | suspensa | cancelada`), entao filtrava por nada. */}
        <Filtro valor={situacao} ao={setSituacao} rotulo="Filtrar por situação"
                opcoes={[{ valor: '', texto: 'Todas as situações' },
                         ...(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDaUc[])
                           .map((k) => ({ valor: k, texto: ROTULO_DA_SITUACAO[k] }))]} />
        <Filtro valor={pendencia} ao={setPendencia} rotulo="Filtrar por pendência"
                opcoes={[{ valor: '', texto: 'Todas as pendências' },
                         { valor: 'sem_vencimento', texto: 'Sem vencimento' },
                         { valor: 'sem_tarifa', texto: 'Sem tarifa' },
                         { valor: 'sem_usina', texto: 'Sem usina' }]} />
        {(busca || situacao || pendencia) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); setPendencia(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="uc" ordem={ordem} ao={alternar}>UC</ThOrd>
                <ThOrd chave="distribuidora" ordem={ordem} ao={alternar}>Distribuidora</ThOrd>
                <ThOrd chave="usina" ordem={ordem} ao={alternar}>Usina</ThOrd>
                <ThOrd chave="rateio" ordem={ordem} ao={alternar} num>Rateio %</ThOrd>
                <ThOrd chave="tarifa" ordem={ordem} ao={alternar} num>Tarifa R$/kWh</ThOrd>
                <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
              </>}
              vazio={todas.length
                ? 'Nenhuma unidade corresponde à busca ou aos filtros.'
                : 'Nenhuma unidade consumidora espelhada.'}>
        {visiveis.map((u) => (
          <tr key={u.id}>
            <td><strong>{u.numero_uc}</strong></td>
            <td className="fraco">{u.distribuidora}</td>
            <td className="fraco">{nomeUsina(u.usina_id) ?? <span style={{ color: 'var(--erro)' }}>Sem usina</span>}</td>
            {/*
              OS DOIS CAMPOS DA LINHA PARECEM TEXTO ATE RECEBEREM ATENCAO
              (classe `inline`), e o "OK" virou botao redondo de check. E o pedido
              de 30/07, e ele conserta um problema real desta tabela: sao 39 linhas
              com dois inputs e dois botoes cada, e a versao anterior desenhava 156
              caixas com borda visivel de uma vez. A tela parecia um formulario
              gigante em vez de uma lista com dois campos editaveis.
            */}
            <td className="num" style={{ minWidth: 140 }}>
              <div className="inline" style={{ justifyContent: 'flex-end' }}>
                <input value={rateio[u.id] ?? u.percentual_rateio ?? ''}
                       aria-label={`Rateio da ${u.numero_uc}`}
                       onChange={(e) => setRateio({ ...rateio, [u.id]: e.target.value })}
                       placeholder="Ex. 12,5" style={{ width: 82, textAlign: 'right' }} />
                <BotaoDeIcone icone="confirmar" rotulo={`Gravar o rateio da ${u.numero_uc}`}
                              ao={() => void salvarRateio(u)}
                              desabilitado={acao.ocupado || !u.usina_id} />
              </div>
            </td>
            <td className="num" style={{ minWidth: 150 }}>
              <div className="inline" style={{ justifyContent: 'flex-end' }}>
                <input value={tarifa[u.id] ?? u.tarifa_reais_por_kwh ?? ''}
                       aria-label={`Tarifa da ${u.numero_uc} em R$ por kWh`}
                       onChange={(e) => setTarifa({ ...tarifa, [u.id]: e.target.value })}
                       placeholder="1,185396" style={{ width: 92, textAlign: 'right' }} />
                <BotaoDeIcone icone="confirmar" rotulo={`Gravar a tarifa da ${u.numero_uc}`}
                              ao={() => void salvarTarifa(u)} desabilitado={acao.ocupado} />
              </div>
            </td>
            <td style={{ minWidth: 180 }}>
              <div className="inline">
                <CampoData valor={edicao[u.id] ?? u.data_vencimento?.slice(0, 10) ?? ''}
                           rotuloAcessivel={`Vencimento da ${u.numero_uc}`}
                           ao={(v) => setEdicao({ ...edicao, [u.id]: v })} />
                <BotaoDeIcone icone="confirmar" rotulo={`Gravar o vencimento da ${u.numero_uc}`}
                              ao={() => void salvarVencimento(u)} desabilitado={acao.ocupado} />
              </div>
            </td>
            <td>
              <Marca tom={TOM_DA_SITUACAO[situacaoDaUc(u)]} icone={ICONE_DA_SITUACAO[situacaoDaUc(u)]}>
                {ROTULO_DA_SITUACAO[situacaoDaUc(u)]}
              </Marca>
            </td>
          </tr>
        ))}
      </Tabela>
      <p className="sub" style={{ marginTop: 12 }}>
        O dia do vencimento é o que conta: a fatura de uma competência vence no <strong>mês seguinte</strong>,
        no mesmo dia. Dia 29 a 31 em mês curto cai no último dia, sem transbordar.
      </p>
      <p className="sub">
        A <strong>tarifa</strong> é R$/kWh <strong>desta</strong> UC, com até seis casas — a aba
        Tarifas saiu em 14/08 porque servia um número só para todas, e a medição do CRM mostrou que
        ele varia por cliente. Truncar 1,185396 em centavos cobraria R$&nbsp;2,90 a mais numa UC,
        num mês, sempre a mais (R22). O conector a preenche a partir do card quando ele traz consumo
        em kWh e em reais, e <strong>nunca apaga</strong> um valor já digitado aqui.
      </p>
    </Pagina>
  );
}
