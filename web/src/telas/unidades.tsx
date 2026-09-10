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
//
// E DESDE 17/08/2026 ELA FECHA TAMBEM O ENDERECO DO PAGADOR. Era o item 7 da
// `PENDENCIAS.md` §2.a - 0 de 29 -, e o unico caminho era `npm run enderecos`,
// rodado de um Codespace contra producao. As colunas sao da UC, o
// `PATCH /unidades-consumidoras/:id` ja as aceitava, e o que faltava era a tela.
// ⚠️ O ENDERECO TRAVA A EMISSAO desde 28/08/2026, e este comentario dizia o
// contrario ate 08/09. `repos/boleto.ts:259` recusa com `PagadorSemEndereco`
// (422) quando falta logradouro, bairro, municipio, CEP ou UF — os cinco sao
// obrigatorios no modelo `Boleto` da Sicoob, e o item (c) da `Q-PAGADOR-01`
// deixou de estar aberto. A tela pergunta a MESMA funcao do servidor
// (`faltamNoEndereco`), entao ela nao pode mais discordar dele.

import { Fragment, useState } from 'react';
import { api, type UnidadeConsumidora, type Usina } from '../api.ts';
import { PainelDoVinculo } from '../vinculo-do-crm-corpo.tsx';
import type { VinculoNaTela } from '../vinculo-do-crm.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Busca, Campo, Ferramentas, Filtro, ThOrd, Marca, BotaoDeIcone,
  CampoData, Icone, useOrdenacao, ordenar, contem, rotulo, DetalheTecnico,
} from '../ui.tsx';
import {
  situacaoDaUc, ehFaturavel, contarSituacoes,
  ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, ICONE_DA_SITUACAO,
  situacaoDoEndereco, camposDoEnderecoPreenchidos, enderecoNumaLinha,
  CAMPOS_DO_ENDERECO, tomDoEndereco, rotuloDoEndereco, enderecoEmiteBoleto,
  type SituacaoDaUc,
} from '../unidades-regras.ts';
import { decimalTexto } from '../dinheiro.ts';
import { FILTROS_DA_TELA, filtroDaConsulta } from '../destino-da-camada.ts';
import { separarEndereco, completarVazios, faltamNaProposta } from '../endereco-da-conta.ts';

export function TelaUnidades() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
  /*
   * O ENDERECO QUE VEIO NA CONTA DA DISTRIBUIDORA — 10/09/2026.
   *
   * O leitor de visao arranca `endereco` de toda conta lida e o sistema o
   * guardava sem nunca mostrar. Aqui ele vira OFERTA para quem preenche o
   * endereco do pagador, que e o mesmo trabalho feito duas vezes: o dado ja
   * entrou no sistema pela leitura da conta.
   *
   * Lista curta (uma linha por unidade, a competencia mais recente), buscada uma
   * vez com a tela — nao por linha aberta. Falha em silencio de proposito: se a
   * leitura nao voltar, a oferta simplesmente nao aparece e o formulario de
   * sempre continua ali. Nada nesta tela depende dela para funcionar.
   */
  const daConta = useDados<Array<{ numero_uc: string; endereco: string; competencia: string }>>(
    () => api.get('/faturas/unificada/enderecos'));
  const acao = useAcao();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [rateio, setRateio] = useState<Record<string, string>>({});
  const [tarifa, setTarifa] = useState<Record<string, string>>({});

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  /*
   * A PENDENCIA PODE VIR NO ENDERECO, e e por ela que a tela de Pendencias
   * aponta: `/unidades?pendencia=sem_tarifa` abre esta lista ja mostrando SO as
   * que faltam. Sao tres camadas da prontidao que terminam aqui - tarifa,
   * vencimento e rateio -, e chegar numa lista de 41 linhas sem recorte e o que
   * o link existe para evitar.
   *
   * LIDO SO NA MONTAGEM (inicializador do `useState`), de proposito: depois
   * disso quem manda e o `<select>`, e reagir ao endereco faria o filtro voltar
   * sozinho ao do link toda vez que a pessoa mudasse de ideia. Valor
   * desconhecido cai para "todas" — ver `filtroDaConsulta`.
   */
  const [pendencia, setPendencia] = useState(
    () => filtroDaConsulta(location.search, FILTROS_DA_TELA['/unidades']));
  /** Qual UC esta com o endereco aberto. Um por vez: sete campos por linha em 41
   *  linhas seriam 287 caixas de texto desenhadas de uma vez. */
  const [enderecoAberto, setEnderecoAberto] = useState<string | null>(null);
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
      (pendencia !== 'sem_usina' || !u.usina_id) &&
      /* `enderecoEmiteBoleto` e nao `situacaoDoEndereco(u) !== 'completo'`: a
         camada `endereco_do_pagador` da prontidao conta quem NAO EMITE, e uma
         unidade sem o numero aparece como incompleta e emite normalmente. Filtro
         que nao casa com a contagem manda a pessoa para uma lista maior do que a
         linha prometeu — a regra 2 do cabecalho de `destino-da-camada.ts`. */
      (pendencia !== 'sem_endereco' || !enderecoEmiteBoleto(u))),
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

  /**
   * GRAVA O ENDERECO DO PAGADOR. `PATCH /unidades-consumidoras/:id`, que ja
   * aceitava os sete campos desde sempre — `uc.editar()` os normaliza um a um e
   * maiusculiza a UF.
   *
   * MANDA OS SETE JUNTOS, inclusive os vazios, e isso e deliberado: o painel
   * mostra o endereco INTEIRO, entao apagar um campo nele tem de apagar no banco.
   * Mandar so o que mudou faria "limpar o complemento" nao ter efeito nenhum, em
   * silencio. Vazio vira NULO no repositorio, e nao string vazia.
   */
  async function salvarEndereco(uc: UnidadeConsumidora, campos: Record<string, string>) {
    const ok = await acao.executar(() => api.patch(`/unidades-consumidoras/${uc.id}`, campos));
    if (ok) {
      acao.anunciar(`Endereço da ${uc.numero_uc} gravado.`);
      setEnderecoAberto(null);
      ucs.recarregar();
    }
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
  /* MESMO CRITERIO DOS OUTROS DOIS - so as faturaveis -, e pelo mesmo motivo:
   * contar as 41 mandaria preencher doze enderecos de UC que nao vai faturar. */
  const semEndereco = todas.filter((u) => !enderecoEmiteBoleto(u) && ehFaturavel(u)).length;
  const contagem = contarSituacoes(todas);

  return (
    <Pagina titulo="Unidades consumidoras"
            sub="Espelhadas do CRM. O dia de vencimento é local e obrigatório para faturar — o servidor recusa em vez de escolher um dia.">
      {/*
        OS TRES AVISOS FORAM REESCRITOS EM 21/08/2026 na mesma forma: primeiro o
        QUE falta, depois o que isso IMPEDE, depois o que FAZER — e o código de
        questão, o nome da recusa e o comando em lote atrás do «detalhe técnico».
        Antes, os três terminavam num identificador interno, que é onde a leitura
        para para quem não conhece o projeto.
      */}
      {semVencimento > 0 && (
        <Aviso tipo="erro">
          <strong>{semVencimento} unidade(s) sem dia de vencimento.</strong> Sem ele a cobrança
          dessas unidades não é gerada — o sistema prefere recusar a escolher uma data por você.{' '}
          <strong>Preencha o dia do mês</strong> na coluna Vencimento: a cobrança de um mês vence
          no mês seguinte, nesse mesmo dia.
          <DetalheTecnico>
            <p style={{ margin: 0 }}>
              A composição recusa com <code>sem_vencimento</code>. Quem preenche — por unidade ou
              por contrato — é a <code>Q-SPEC001-02</code>; não há valor padrão e não vai haver
              (regra 10).
            </p>
          </DetalheTecnico>
        </Aviso>
      )}
      {semTarifa > 0 && (
        <Aviso tipo="erro">
          <strong>{semTarifa} unidade(s) sem o preço do kWh.</strong> É por esse preço que a
          energia gerada vira valor em reais — sem ele a cobrança do mês não pode ser calculada.{' '}
          <strong>Preencha na coluna «Tarifa R$/kWh»</strong>, na linha da unidade. O preço é de
          cada unidade e não da distribuidora: ele muda de cliente para cliente.
          <DetalheTecnico>
            <p style={{ margin: 0 }}>
              A composição do lote <strong>levanta</strong> em vez de faturar por zero (R26). A aba
              Tarifas saiu em 14/08 porque servia um número só para todas, e a medição mostrou que
              ele varia por cliente: 35 a 1,130000 · 4 a 1,16 · 2 a 1,180000.
            </p>
          </DetalheTecnico>
        </Aviso>
      )}
      {semEndereco > 0 && (
        /* ERRO E NAO ALERTA, e a troca tem data: 28/08/2026. Ate entao a tela
           dizia «isto nao impede cobrar», e estava certa — o que a Sicoob exigia
           de endereco nao estava medido. Passou a estar: os cinco campos sao
           obrigatorios no modelo `Boleto` e `src/repos/boleto.ts` RECUSA com
           `PagadorSemEndereco` (422). O texto antigo sobreviveu onze dias
           mandando a operacao deixar para depois a unica coisa que, hoje, impede
           o primeiro boleto de sair. */
        <Aviso tipo="erro">
          <strong>{semEndereco} unidade(s) não emitem boleto por falta de endereço.</strong>{' '}
          O banco exige logradouro, bairro, município, CEP e UF do pagador, e a emissão é{' '}
          <strong>recusada</strong> sem eles — a fatura existe, o boleto não sai. Preencha abrindo
          a linha da unidade.
          <DetalheTecnico>
            <p style={{ margin: 0 }}>
              A recusa é <code>PagadorSemEndereco</code> (422) em <code>src/repos/boleto.ts</code>,
              e a lista de campos sai de <code>faltamNoEndereco</code> em{' '}
              <code>src/sicoob/porta.ts</code> — a mesma função que esta tela chama, para as duas
              metades não divergirem. O número não entra na lista. Para a carteira inteira de uma
              vez, <code>npm run enderecos</code>.
            </p>
          </DetalheTecnico>
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
        <Busca valor={busca} ao={setBusca} dica="Buscar pelo número da unidade ou pela distribuidora…" />
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
                         { valor: 'sem_usina', texto: 'Sem usina' },
                         { valor: 'sem_endereco', texto: 'Sem endereço completo' }]} />
        {(busca || situacao || pendencia) && (
          <button type="button" onClick={() => { setBusca(''); setSituacao(''); setPendencia(''); }}>
            <Icone nome="limpar" tamanho={15} /> Limpar filtros
          </button>
        )}
      </Ferramentas>

      <Tabela cabecalho={<>
                <ThOrd chave="uc" ordem={ordem} ao={alternar}>Unidade</ThOrd>
                <ThOrd chave="distribuidora" ordem={ordem} ao={alternar}>Distribuidora</ThOrd>
                <ThOrd chave="usina" ordem={ordem} ao={alternar}>Usina</ThOrd>
                <ThOrd chave="rateio" ordem={ordem} ao={alternar} num>Fatia do cliente %</ThOrd>
                <ThOrd chave="tarifa" ordem={ordem} ao={alternar} num>Tarifa R$/kWh</ThOrd>
                <ThOrd chave="vencimento" ordem={ordem} ao={alternar}>Vencimento</ThOrd>
                <ThOrd chave="situacao" ordem={ordem} ao={alternar}>Situação</ThOrd>
                <th>Endereço do pagador</th>
              </>}
              vazio={todas.length
                ? 'Nenhuma unidade corresponde à busca ou aos filtros.'
                : 'Nenhuma unidade consumidora espelhada.'}>
        {visiveis.map((u) => (
          <Fragment key={u.id}>
          <tr>
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
                <BotaoDeIcone icone="confirmar" rotulo={`Gravar a fatia da unidade ${u.numero_uc}`}
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
            {/* O ENDERECO E BOTAO E NAO CAMPO, e a razao e a mesma do comentario
                dos dois inputs acima: sao SETE campos, e desenha-los na linha em
                41 linhas seriam 287 caixas de texto de uma vez. O botao diz o
                estado e abre o painel de quem precisa mexer. */}
            <td style={{ minWidth: 210 }}>
              <button onClick={() => setEnderecoAberto(enderecoAberto === u.id ? null : u.id)}
                      aria-expanded={enderecoAberto === u.id}
                      title={enderecoNumaLinha(u) ?? 'Nenhum campo de endereço preenchido'}>
                <Icone nome={enderecoAberto === u.id ? 'limpar' : 'unidades'} tamanho={14} />
                <Marca tom={tomDoEndereco(u)}>
                  {rotuloDoEndereco(u)}
                </Marca>
              </button>
            </td>
          </tr>
          {enderecoAberto === u.id && (
            <tr>
              {/* `--fundo-recuo` e a terceira superficie da paleta, a mesma que o
                  painel da aba Faturas usa: sem ela o painel aberto se confunde
                  com a linha seguinte da tabela. */}
              <td colSpan={8} style={{ background: 'var(--fundo-recuo)' }}>
                <EnderecoDoPagador uc={u} ocupado={acao.ocupado}
                                   daConta={daConta.dado?.find((c) => c.numero_uc === u.numero_uc)}
                                   aoGravar={(campos) => void salvarEndereco(u, campos)} />
                {/* O VINCULO VEM DEPOIS DO ENDERECO, e a ordem e de frequencia:
                    endereco e trabalho de cadastro que quase toda linha precisa
                    uma vez; o vinculo e a pergunta que se faz sobre UMA linha,
                    quando o aviso de Pendencias a nomeia. Poe-lo em cima faria a
                    leitura do outro banco acontecer toda vez que alguem abrisse
                    uma linha para digitar um CEP. */}
                <hr style={{ border: 0, borderTop: '1px solid var(--borda-suave)', margin: '14px 0' }} />
                <VinculoComOutroSistema ucId={u.id} aoDestravar={() => ucs.recarregar()} />
              </td>
            </tr>
          )}
          </Fragment>
        ))}
      </Tabela>
      <p className="sub" style={{ marginTop: 12 }}>
        O que vale é o <strong>dia</strong>, e ele é o <strong>dia da distribuidora</strong> — não o
        dia em que queremos receber. A cobrança de um mês usa esse dia no <strong>mês seguinte</strong>,
        e o nosso boleto vence <strong>três dias antes</strong> dele: quem subtrai é o sistema.
        Digitar um dia já adiantado faz a conta ser feita duas vezes. Dia 29, 30 ou 31 em mês curto
        cai no último dia do mês, sem passar para o seguinte. E se os três dias caírem em
        <strong> sábado, domingo ou feriado nacional</strong>, o boleto vence no{' '}
        <strong>dia útil anterior</strong> — nunca no seguinte, que encurtaria a folga.
      </p>
      <p className="sub">
        A <strong>tarifa</strong> é o preço do kWh <strong>desta</strong> unidade, com até seis casas
        depois da vírgula. O preço varia de cliente para cliente, por isso ele é preenchido linha a
        linha e não uma vez para todos — e as casas extras não são exagero: arredondar em centavos
        cobraria alguns reais a mais por mês, sempre a mais. O sistema preenche sozinho quando o
        cadastro do cliente traz o consumo em kWh e em reais, e <strong>nunca apaga</strong> um valor
        digitado aqui.
      </p>
    </Pagina>
  );
}

/**
 * O ENDEREÇO DO PAGADOR, no painel recuado.
 *
 * É o endereço que vai no boleto — `repos/boleto.ts` monta o `pagador.endereco`
 * exatamente com estas sete colunas. Era o item 7 da `PENDENCIAS.md` §2.a, **0 de
 * 29**, e o único caminho era `npm run enderecos` de um Codespace.
 *
 * ELE NÃO TRAVA A EMISSÃO, e a tela diz isso em vez de fingir rigor: a guarda do
 * repositório recusa pagador sem CPF/CNPJ e **deixa o endereço passar**, porque o
 * que a Sicoob exige de fato PASSOU a ser medido em 28/08/2026 — ver `porta.ts`, que tem
 * dono e não é o implementador (regra 10). Recusar por um campo que talvez seja
 * opcional bloquearia boleto que sairia.
 *
 * OS SETE SOBEM JUNTOS, inclusive os vazios. Ver `salvarEndereco`: o painel mostra
 * o endereço inteiro, então apagar um campo aqui tem de apagar no banco. Mandar
 * só o que mudou faria "limpar o complemento" não ter efeito, em silêncio.
 */
function EnderecoDoPagador({ uc, ocupado, daConta, aoGravar }: {
  uc: UnidadeConsumidora;
  ocupado: boolean;
  /** O endereço que veio na conta lida desta unidade, quando existe uma. */
  daConta?: { endereco: string; competencia: string };
  aoGravar: (campos: Record<string, string>) => void;
}) {
  const [logradouro, setLogradouro] = useState(uc.endereco_logradouro ?? '');
  const [numero, setNumero] = useState(uc.endereco_numero ?? '');
  const [complemento, setComplemento] = useState(uc.endereco_complemento ?? '');
  const [bairro, setBairro] = useState(uc.endereco_bairro ?? '');
  const [municipio, setMunicipio] = useState(uc.endereco_municipio ?? '');
  const [uf, setUf] = useState(uc.endereco_uf ?? '');
  const [cep, setCep] = useState(uc.endereco_cep ?? '');

  const gravar = () => aoGravar({
    endereco_logradouro: logradouro, endereco_numero: numero,
    endereco_complemento: complemento, endereco_bairro: bairro,
    endereco_municipio: municipio, endereco_uf: uf, endereco_cep: cep,
  });

  /*
   * A OFERTA, e ela só aparece onde faz diferença: com o endereço já completo,
   * um botão que "preenche" seria um botão que não faz nada — e um botão que não
   * faz nada ensina a pessoa a não clicar em botão.
   */
  const atual = {
    endereco_logradouro: logradouro, endereco_numero: numero, endereco_complemento: complemento,
    endereco_bairro: bairro, endereco_municipio: municipio, endereco_uf: uf, endereco_cep: cep,
  };
  const proposta = daConta ? separarEndereco(daConta.endereco) : null;
  const faltamNela = proposta ? faltamNaProposta(proposta) : [];
  const ofertar = !!proposta && !enderecoEmiteBoleto(atual);

  const usarADaConta = () => {
    const j = completarVazios(atual, proposta!);
    setLogradouro(j.endereco_logradouro); setNumero(j.endereco_numero);
    setComplemento(j.endereco_complemento); setBairro(j.endereco_bairro);
    setMunicipio(j.endereco_municipio); setUf(j.endereco_uf); setCep(j.endereco_cep);
  };

  return (
    <div style={{ padding: '12px 4px', display: 'grid', gap: 10 }}>
      {ofertar && (
        <div className="cartao" style={{ margin: 0 }}>
          <strong>A conta da distribuidora trouxe este endereço</strong>
          <p style={{ margin: '4px 0 0' }}>
            «{daConta!.endereco}»{' '}
            <span className="fraco" style={{ fontSize: 12 }}>
              — da conta de {String(daConta!.competencia).slice(0, 7).split('-').reverse().join('/')}
            </span>
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <button onClick={usarADaConta} disabled={ocupado}>
              <Icone nome="enviar" tamanho={15} /> Preencher com este endereço
            </button>
            <span className="fraco" style={{ fontSize: 12.5 }}>
              {faltamNela.length === 0
                ? 'Preenche os cinco campos que o boleto exige — confira antes de gravar.'
                : `Preenche o que dá para reconhecer; ainda vai faltar ${faltamNela.join(', ')}.`}
            </span>
          </div>
          {/* O QUE ESTE BOTÃO NÃO FAZ, dito onde ele está: ele preenche o
              formulário e para. Nada é gravado sem alguém apertar «Gravar
              endereço» — e nada que já esteja escrito é substituído, porque quem
              abre esta linha costuma já ter começado a digitar. */}
          <p className="fraco" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            O endereço impresso na conta é o <strong>da instalação</strong>; o do boleto é o{' '}
            <strong>de quem paga</strong>. Quase sempre são o mesmo — por isso o sistema oferece e
            não preenche sozinho. Nada é gravado até você conferir e apertar «Gravar endereço», e o
            que já estiver escrito aqui não é substituído.
          </p>
        </div>
      )}
      <div className="campos">
        <Campo rotulo="Logradouro" porqueDe="endereco-unidade" valor={logradouro} ao={setLogradouro} dica="Rua, avenida, quadra" />
        <Campo rotulo="Número" porqueDe="endereco-unidade" valor={numero} ao={setNumero} dica="S/N quando não há" />
        <Campo rotulo="Complemento" porqueDe="endereco-unidade" valor={complemento} ao={setComplemento} dica="Opcional — não conta como pendência" />
      </div>
      <div className="campos">
        <Campo rotulo="Bairro" porqueDe="endereco-unidade" valor={bairro} ao={setBairro} />
        <Campo rotulo="Município" porqueDe="endereco-unidade" valor={municipio} ao={setMunicipio} />
        {/* A UF sobe como veio e o SERVIDOR maiusculiza (`uc.editar`), em vez de
            a tela fazer isso enquanto se digita: normalizar sob o cursor é o tipo
            de esperteza que atrapalha quem apaga uma letra para corrigir. */}
        <Campo rotulo="UF" porqueDe="endereco-unidade" valor={uf} ao={setUf} dica="Duas letras" />
        <Campo rotulo="CEP" porqueDe="endereco-unidade" valor={cep} ao={setCep} dica="00000-000" />
        <div style={{ alignSelf: 'end' }}>
          <button className="primario" disabled={ocupado} onClick={gravar}>
            <Icone nome="confirmar" tamanho={15} peso="bold" /> Gravar endereço
          </button>
        </div>
      </div>
      <span className="fraco" style={{ fontSize: 13 }}>
        É o endereço que sai impresso no boleto, e é <strong>da unidade</strong> — não do cliente,
        que pode ter várias. Sem logradouro, bairro, município, CEP e UF a{' '}
        <strong>emissão é recusada</strong>; o número é o único opcional.
        <DetalheTecnico>
          <p style={{ margin: 0 }}>
            Os cinco campos são obrigatórios no modelo <code>Boleto</code> da Sicoob, medido em
            28/08/2026 — o item (c) da <code>Q-PAGADOR-01</code> deixou de estar aberto. A recusa é{' '}
            <code>PagadorSemEndereco</code> (422), e a lista sai de <code>faltamNoEndereco</code>{' '}
            em <code>src/sicoob/porta.ts</code>. Para a carteira inteira de uma vez,{' '}
            <code>npm run enderecos</code> continua existindo.
          </p>
        </DetalheTecnico>
      </span>
    </div>
  );
}

/**
 * O VÍNCULO COM O OUTRO SISTEMA — a leitura acontece quando a linha abre.
 *
 * ⚠️ ESTA É A ÚNICA TELA QUE FAZ O SERVIDOR LER O OUTRO BANCO. Por isso ela é
 * preguiçosa duas vezes: só busca quando a linha está aberta, e o servidor só
 * abre conexão com o outro banco quando alguém pergunta. O sistema continua
 * subindo e operando com aquele banco fora do ar.
 *
 * A RECARGA DEPOIS DE DESTRAVAR NÃO MOSTRA O VÍNCULO NOVO, e a tela diz isso: o
 * botão solta o vínculo velho, e quem escreve o novo é a leitura automática, no
 * próximo ciclo. Uma tela que prometesse o resultado final aqui estaria
 * prometendo o trabalho de outro processo.
 */
function VinculoComOutroSistema({ ucId, aoDestravar }: { ucId: string; aoDestravar: () => void }) {
  const acao = useAcao();
  const vinculo = useDados<VinculoNaTela>(() => api.get(`/unidades-consumidoras/${ucId}/vinculo`), [ucId]);

  const destravar = async () => {
    if (!confirm(
      'Soltar o vínculo velho desta unidade?\n\n'
      + 'Isto registra que você decidiu qual leitura vale. A leitura automática do outro sistema '
      + 'grava o vínculo novo no próximo ciclo, em até 15 minutos.')) return;
    const ok = await acao.executar(() => api.post(`/unidades-consumidoras/${ucId}/destravar-vinculo`));
    if (ok) {
      acao.anunciar('Vínculo solto. A leitura automática grava o novo no próximo ciclo.');
      vinculo.recarregar();
      aoDestravar();
    }
  };

  return (
    <>
      {acao.erro && <Aviso tipo="erro">{acao.erro}</Aviso>}
      {acao.sucesso && <Aviso tipo="ok">{acao.sucesso}</Aviso>}
      <PainelDoVinculo dados={vinculo.dado} carregando={vinculo.carregando} erro={vinculo.erro}
                       destravar={() => void destravar()} ocupado={acao.ocupado} />
    </>
  );
}
