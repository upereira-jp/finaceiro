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
// O endereco NAO trava nada hoje, e isso e deliberado: `repos/boleto.ts` recusa
// pagador sem CPF/CNPJ e nao recusa por endereco, porque o que a Sicoob exige de
// fato esta em aberto no item (c) da `Q-PAGADOR-01`. A tela conta e nao decide.

import { Fragment, useState } from 'react';
import { api, type UnidadeConsumidora, type Usina } from '../api.ts';
import { useAcao, useDados } from '../dados.ts';
import {
  Pagina, Aviso, Tabela, Busca, Campo, Ferramentas, Filtro, ThOrd, Marca, BotaoDeIcone,
  CampoData, Icone, useOrdenacao, ordenar, contem, rotulo,
} from '../ui.tsx';
import {
  situacaoDaUc, ehFaturavel, contarSituacoes,
  ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, ICONE_DA_SITUACAO,
  situacaoDoEndereco, camposDoEnderecoPreenchidos, enderecoNumaLinha,
  CAMPOS_DO_ENDERECO, ROTULO_DO_ENDERECO, TOM_DO_ENDERECO,
  type SituacaoDaUc,
} from '../unidades-regras.ts';
import { decimalTexto } from '../dinheiro.ts';
import { FILTROS_DA_TELA, filtroDaConsulta } from '../destino-da-camada.ts';

export function TelaUnidades() {
  const ucs = useDados<UnidadeConsumidora[]>(() => api.get('/unidades-consumidoras?limite=500'));
  const usinas = useDados<Usina[]>(() => api.get('/usinas'));
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
      (pendencia !== 'sem_endereco' || situacaoDoEndereco(u) !== 'completo')),
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
  const semEndereco = todas.filter((u) => situacaoDoEndereco(u) !== 'completo' && ehFaturavel(u)).length;
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
      {semEndereco > 0 && (
        /* ALERTA E NAO ERRO, e a diferenca e a regra 10. Nenhum campo de endereco
           recusa boleto hoje: `repos/boleto.ts` para o pagador sem CPF/CNPJ e
           deixa o endereco passar, porque o que a Sicoob exige de fato nao foi
           medido — item (c) da `Q-PAGADOR-01`. Pintar de vermelho seria a tela
           afirmando uma exigencia que ninguem verificou. */
        <Aviso tipo="alerta">
          {semEndereco} unidade(s) faturável(is) <strong>sem endereço completo do pagador</strong>.
          É o endereço que vai no boleto, e ele se preenche aqui desde 17/08 — antes disso só por{' '}
          <code>npm run enderecos</code>. <strong>Ele não bloqueia a emissão</strong>: quanto de
          endereço a Sicoob realmente exige é o item (c) da <code>Q-PAGADOR-01</code>, que está
          aberto e tem dono — por isso a contagem avisa em vez de recusar.
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
                <Marca tom={TOM_DO_ENDERECO[situacaoDoEndereco(u)]}>
                  {situacaoDoEndereco(u) === 'parcial'
                    ? `${camposDoEnderecoPreenchidos(u)} de ${CAMPOS_DO_ENDERECO.length}`
                    : ROTULO_DO_ENDERECO[situacaoDoEndereco(u)]}
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
                                   aoGravar={(campos) => void salvarEndereco(u, campos)} />
              </td>
            </tr>
          )}
          </Fragment>
        ))}
      </Tabela>
      <p className="sub" style={{ marginTop: 12 }}>
        O que vale é o <strong>dia</strong>: a cobrança de um mês vence no <strong>mês seguinte</strong>,
        nesse mesmo dia. Dia 29, 30 ou 31 em mês curto cai no último dia do mês, sem passar para o
        seguinte.
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
 * que a Sicoob exige de fato não foi medido — item (c) da `Q-PAGADOR-01`, que tem
 * dono e não é o implementador (regra 10). Recusar por um campo que talvez seja
 * opcional bloquearia boleto que sairia.
 *
 * OS SETE SOBEM JUNTOS, inclusive os vazios. Ver `salvarEndereco`: o painel mostra
 * o endereço inteiro, então apagar um campo aqui tem de apagar no banco. Mandar
 * só o que mudou faria "limpar o complemento" não ter efeito, em silêncio.
 */
function EnderecoDoPagador({ uc, ocupado, aoGravar }: {
  uc: UnidadeConsumidora;
  ocupado: boolean;
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

  return (
    <div style={{ padding: '12px 4px', display: 'grid', gap: 10 }}>
      <div className="campos">
        <Campo rotulo="Logradouro" valor={logradouro} ao={setLogradouro} dica="Rua, avenida, quadra" />
        <Campo rotulo="Número" valor={numero} ao={setNumero} dica="S/N quando não há" />
        <Campo rotulo="Complemento" valor={complemento} ao={setComplemento} dica="Opcional — não conta como pendência" />
      </div>
      <div className="campos">
        <Campo rotulo="Bairro" valor={bairro} ao={setBairro} />
        <Campo rotulo="Município" valor={municipio} ao={setMunicipio} />
        {/* A UF sobe como veio e o SERVIDOR maiusculiza (`uc.editar`), em vez de
            a tela fazer isso enquanto se digita: normalizar sob o cursor é o tipo
            de esperteza que atrapalha quem apaga uma letra para corrigir. */}
        <Campo rotulo="UF" valor={uf} ao={setUf} dica="Duas letras" />
        <Campo rotulo="CEP" valor={cep} ao={setCep} dica="00000-000" />
        <div style={{ alignSelf: 'end' }}>
          <button className="primario" disabled={ocupado} onClick={gravar}>
            <Icone nome="confirmar" tamanho={15} peso="bold" /> Gravar endereço
          </button>
        </div>
      </div>
      <span className="fraco" style={{ fontSize: 13 }}>
        É o endereço do <strong>pagador no boleto</strong>, e é da unidade consumidora — não do
        cliente, que pode ter várias. Ele <strong>não impede a emissão</strong>: o que a Sicoob
        exige de endereço ainda não foi medido (<code>Q-PAGADOR-01</code>, item c). Para a
        carteira inteira de uma vez, <code>npm run enderecos</code> continua existindo.
      </span>
    </div>
  );
}
