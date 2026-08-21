/*
 * A JUNCAO: a conta unificada lida virando fatura cobravel, liquidavel e
 * repartivel. As decisoes de `src/dominio/fatura-do-registro.ts`.
 *
 * PURO E SEM BANCO, de proposito, e aqui isso vale mais do que de costume: esta
 * e a primeira peca do caminho do dinheiro escrita DEPOIS da `Q-CICLO-01`, e ela
 * nao pode ser exercitada de ponta a ponta hoje - producao tem **zero contratos**
 * e `fatura.contrato_id` e NOT NULL. Enquanto o cadastro nao fechar, o que prova
 * esta peca sao estas verificacoes.
 *
 * O que elas prendem, e cada uma nomeia o que quebraria se caisse:
 *
 *   J1  o MAPA de um para um entre a conta lida e a fatura
 *   J2  a ORDEM da triagem (ordem de utilidade do diagnostico)
 *   J3  cada recusa, uma a uma, com a faixa de CHECK que a motiva
 *   J4  o vencimento e as suas DUAS fontes
 *   J5  a conferencia da alocacao, exata e sem float
 *   J6  alerta nao e recusa
 *
 * Rodar: node --experimental-strip-types tests/fatura-do-registro.ts
 */
import {
  triarRegistro, conferirAlocacao, vencimentoEscolhido,
  EXPLICACAO_DO_REGISTRO,
  type LinhaDoRegistro, type MotivoDeRecusaDoRegistro,
} from '../src/dominio/fatura-do-registro.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

/** Uma linha COMPLETA e faturavel. Cada caso abaixo estraga um campo so - assim
 *  o que a verificacao mede e o campo, e nao o resto da fixture. */
const base = (): LinhaDoRegistro => ({
  registro_id: 'r-1',
  numero_uc: '3001234',
  competencia: dia('2026-06-01'),

  fatura_id: null,
  compensada_kwh: '480.0000',
  tarifa_kwh: '1.185396',
  energia_g3_centavos: 45538,
  total_equatorial_centavos: 12750,
  vencimento_da_conta: dia('2026-07-15'),

  unidade_consumidora_id: 'uc-1',
  usina_id: 'us-1',
  percentual_rateio: '4.7500',
  data_vencimento: dia('2026-01-10'),
  rateio_situacao: 'ativado',
  crm_usina_cliente_id: 'crm-1',
  contrato_id: 'k-1',
  data_fechamento: dia('2026-03-15'),
  geracao_kwh: '10299.0000',
  dono_usina_id: 'd-1',
  uc_ja_tem_fatura: false,
});

const com = (p: Partial<LinhaDoRegistro>): LinhaDoRegistro => ({ ...base(), ...p });

/** Atalho: o motivo da recusa, ou `null` quando a linha fatura. */
const motivo = (l: LinhaDoRegistro): MotivoDeRecusaDoRegistro | null => {
  const c = triarRegistro(l);
  return c.faturar ? null : c.motivo;
};

// ===========================================================================
// J1 - O MAPA. A conta lida vira fatura sem que nenhum numero seja recalculado.
// ===========================================================================

const ok = triarRegistro(base());
chk('J1a', ok.faturar === true, 'a linha completa fatura');

if (ok.faturar) {
  /* AS DUAS PARCELAS QUE O SPLIT CONSOME. Se uma destas cair, o motor de split
   * passa a repartir sobre outro numero - sem erro, sem log, e com o dono da
   * usina recebendo o valor errado. E o modo de falha mais caro do sistema. */
  chk('J1b', ok.valor_consumo_centavos === 45538,
      'energia_g3_centavos -> valor_consumo_centavos (base da comissao e do repasse)');
  chk('J1c', ok.valor_tarifas_concessionaria_centavos === 12750,
      'total_equatorial_centavos -> valor_tarifas_concessionaria_centavos (repasse PURO)');

  /* O total da fatura e coluna GERADA no banco: consumo + concessionaria + juros.
   * Com juros zero na emissao, ele TEM de bater com o total do registro, que o
   * CHECK `registro_total_fecha` ja garantiu do outro lado. Se esta cair, o
   * cliente recebe uma folha com um valor e um boleto com outro. */
  chk('J1d', ok.valor_consumo_centavos + ok.valor_tarifas_concessionaria_centavos === 58288,
      'os dois somam o total do registro - a folha e o boleto dizem o mesmo numero');

  chk('J1e', ok.consumo_kwh === '480.0000' && ok.tarifa_reais_por_kwh === '1.185396',
      'kWh compensado e tarifa CHEIA viajam como STRING, com as seis casas intactas');

  /* Congelados: a UC pode ser remanejada amanha, e a fatura de junho tem de
   * continuar dizendo de qual usina veio aquele credito. */
  chk('J1f', ok.geracao_kwh === '10299.0000' && ok.percentual_rateio === '4.7500',
      'geracao e percentual sao CONGELADOS na fatura, mesmo nao calculando o valor');

  chk('J1g', ok.contrato_id === 'k-1' && ok.usina_id === 'us-1' && ok.unidade_consumidora_id === 'uc-1',
      'contrato, usina e UC vem do cadastro local - a conta lida nao os tem');

  /* Contrato fechado em 15/03 cobre junho do primeiro ao ultimo dia. */
  chk('J1h', ok.flag_fatura_cheia === true,
      'flag_fatura_cheia sai de ehFaturaCheia() - nao ha segunda implementacao da regra');
}

/* Fechado DENTRO da competencia: junho pela metade nao e cheia, nao avanca o
 * contador e nao paga comissao (PRD 5.4). */
const meiaComp = triarRegistro(com({ data_fechamento: dia('2026-06-10') }));
chk('J1i', meiaComp.faturar && meiaComp.flag_fatura_cheia === false,
    'contrato fechado no meio da competencia produz fatura NAO cheia');

// ===========================================================================
// J2 - A ORDEM da triagem. Ordem de utilidade do diagnostico, e nao de campo.
// ===========================================================================

/* Ja faturado vence TUDO: se a conta ja virou fatura, o que falta nao falta
 * mais, e nenhuma outra informacao e acionavel. */
chk('J2a', motivo(com({ fatura_id: 'f-1', unidade_consumidora_id: null, contrato_id: null }))
           === 'registro_ja_faturado',
    'registro ja faturado vence todas as outras recusas');

/* UC ausente vence contrato ausente: mandar preencher o contrato de uma UC que
 * nao existe e mandar trabalhar no lugar errado. */
chk('J2b', motivo(com({ unidade_consumidora_id: null, contrato_id: null, geracao_kwh: null }))
           === 'sem_uc_cadastrada',
    'sem UC cadastrada vence sem contrato e sem geracao');

/* Contrato vence rateio e geracao: sem contrato nao ha o que faturar de todo
 * jeito - a mesma ordem que `triar()` ja usava no caminho contratual. */
chk('J2c', motivo(com({ contrato_id: null, usina_id: null, geracao_kwh: null }))
           === 'sem_contrato_vigente',
    'sem contrato vence sem rateio e sem geracao');

/* Ja faturada por outro caminho vence rateio nao ativado: "nao ativado" numa UC
 * ja faturada mandaria procurar problema onde nao ha acao possivel. */
chk('J2d', motivo(com({ uc_ja_tem_fatura: true, rateio_situacao: 'nao_ativado' }))
           === 'uc_ja_faturada',
    'UC ja faturada vence rateio nao ativado');

/* Vencimento e a ULTIMA: e o que impede de cobrar, nao de existir. */
chk('J2e', motivo(com({ vencimento_da_conta: null, data_vencimento: null, geracao_kwh: null }))
           === 'sem_geracao_lancada',
    'sem geracao vence sem vencimento - vencimento e o ultimo da ordem');

// ===========================================================================
// J3 - CADA RECUSA, e a faixa de CHECK que a motiva
// ===========================================================================

chk('J3a', motivo(com({ contrato_id: null })) === 'sem_contrato_vigente',
    'sem contrato_id recusa');
chk('J3b', motivo(com({ data_fechamento: null })) === 'sem_contrato_vigente',
    'contrato sem data_fechamento recusa junto - sem ela nao ha como decidir se e cheia');
chk('J3c', motivo(com({ usina_id: null })) === 'sem_rateio', 'sem usina recusa');
chk('J3d', motivo(com({ percentual_rateio: null })) === 'sem_rateio', 'sem percentual recusa');

/* O ZERO e o caso que a coluna separa e o registro nao: a fatura tem
 * `CHECK (percentual_rateio_aplicado > 0)`. Deixar passar trocaria uma recusa
 * nomeada por um 23514 cru vindo do banco, longe de quem clicou. */
chk('J3e', motivo(com({ percentual_rateio: '0.0000' })) === 'sem_rateio',
    'percentual ZERO recusa como sem_rateio - a fatura exige > 0 (CHECK da migration 17)');

chk('J3f', motivo(com({ geracao_kwh: null })) === 'sem_geracao_lancada',
    'sem geracao lancada recusa - e o caso das usinas 0003 e 04 (Q-GERACAO-USINA-01)');

/* Geracao ZERO nao e ausencia de geracao: e uma usina que mediu zero naquele
 * mes, e a coluna aceita (`CHECK >= 0`). Ausencia de medicao nao e medicao de
 * ausencia - a mesma distincao que a prontidao faz entre `nao_medido` e `pendente`. */
chk('J3g', motivo(com({ geracao_kwh: '0.0000' })) === null,
    'geracao ZERO fatura - ausencia de medicao nao e medicao de ausencia');

/* A tarifa e a assimetria oposta: o registro aceita `>= 0`, a fatura exige `> 0`. */
chk('J3h', motivo(com({ tarifa_kwh: '0' })) === 'sem_tarifa_na_conta',
    'tarifa ZERO na conta recusa - a fatura exige tarifa positiva');
chk('J3i', motivo(com({ tarifa_kwh: '0.000001' })) === null,
    'a menor tarifa positiva representavel passa - o corte e no zero, nao numa faixa inventada');

chk('J3j', motivo(com({ rateio_situacao: 'nao_ativado' })) === 'rateio_nao_ativado',
    'rateio nao ativado no CRM recusa');
chk('J3k', motivo(com({ rateio_situacao: null })) === 'rateio_nao_ativado',
    'situacao VAZIA tambem recusa quando a UC e espelhada - o conector ainda nao a leu');

/* A GUARDA QUE IMPEDE UM DEFEITO: UC criada a mao nunca tera situacao no CRM,
 * porque o CRM nao sabe dela. Sem esta condicao ela ficaria nao faturavel PARA
 * SEMPRE, sem erro e sem log. E a mesma guarda de `triar()`. */
chk('J3l', motivo(com({ crm_usina_cliente_id: null, rateio_situacao: null })) === null,
    'UC cadastrada A MAO fatura sem opiniao do CRM - regra de fonte externa so vale sobre o que vem dela');

/* Toda recusa tem texto, e o texto diz a saida. Recusa sem explicacao e beco. */
const motivos: MotivoDeRecusaDoRegistro[] = [
  'registro_ja_faturado', 'sem_uc_cadastrada', 'sem_contrato_vigente', 'uc_ja_faturada',
  'rateio_nao_ativado', 'sem_rateio', 'sem_geracao_lancada', 'sem_tarifa_na_conta', 'sem_vencimento',
];
chk('J3m', motivos.every((m) => (EXPLICACAO_DO_REGISTRO[m] ?? '').length > 40),
    'os nove motivos tem explicacao, e ela diz o que fazer - recusa e ponteiro, nao beco');

// ===========================================================================
// J4 - O VENCIMENTO e as suas duas fontes
// ===========================================================================

const daConta = triarRegistro(base());
chk('J4a', daConta.faturar && daConta.vencimento_de === 'conta'
        && daConta.vencimento.toISOString().slice(0, 10) === '2026-07-15',
    'com vencimento na conta lida, e ele que vale - e a data que o cliente ja tem no papel');

/* Sem a conta, o cadastro. `vencimentoDaFatura` projeta o DIA no mes seguinte ao
 * da competencia, que e o que a competencia de junho exige: a geracao so e
 * medida depois de o mes virar. */
const doCadastro = triarRegistro(com({ vencimento_da_conta: null }));
chk('J4b', doCadastro.faturar && doCadastro.vencimento_de === 'cadastro'
        && doCadastro.vencimento.toISOString().slice(0, 10) === '2026-07-10',
    'sem data na conta, o dia do cadastro e projetado no mes seguinte (junho -> 10/07)');

chk('J4c', motivo(com({ vencimento_da_conta: null, data_vencimento: null })) === 'sem_vencimento',
    'sem nenhuma das duas fontes, recusa - nao ha default e nao vai haver (regra 10)');

/* A ORDEM DAS FONTES importa e nao e arbitraria: a conta e mais especifica,
 * porque diz o vencimento DAQUELE mes. O cadastro diz um dia fixo. */
chk('J4d', vencimentoEscolhido({
      vencimento_da_conta: dia('2026-07-15'),
      data_vencimento: dia('2026-01-28'),
      competencia: dia('2026-06-01'),
    })?.de === 'conta',
    'com as DUAS fontes, a conta ganha - ela e a mais especifica');

/* Dia 31 em mes curto cai no ultimo dia, nunca transborda: transbordar mudaria a
 * competencia de vencimento de parte da carteira quatro vezes por ano. */
chk('J4e', triarRegistro(com({
      vencimento_da_conta: null, data_vencimento: dia('2026-01-31'), competencia: dia('2026-01-01'),
    })).faturar
    && (triarRegistro(com({
      vencimento_da_conta: null, data_vencimento: dia('2026-01-31'), competencia: dia('2026-01-01'),
    })) as any).vencimento.toISOString().slice(0, 10) === '2026-02-28',
    'dia 31 em fevereiro cai no ultimo dia do mes, e nao transborda para marco');

// ===========================================================================
// J5 - A CONFERENCIA DA ALOCACAO. Exata, sem float, e informativa.
// ===========================================================================

/* 10299.0000 x 4.7500 / 100 = 489.2025. Em float, `10299 * 4.75 / 100` da
 * 489.20250000000004 - e este numero vai para a tela de quem confere a usina. */
const c1 = conferirAlocacao('10299.0000', '4.7500', '480.0000');
chk('J5a', c1.alocado_kwh === '489.2025',
    'a alocacao e exata: 10299,0000 x 4,7500 / 100 = 489,2025 (em float daria ...0000004)');
chk('J5b', c1.compensado_kwh === '480.0000', 'o compensado sai da conta lida, intacto');
chk('J5c', c1.diferenca_kwh === '9.2025',
    'a diferenca e alocado - compensado: a usina reservou 9,2025 kWh a mais do que foi abatido');

/* NEGATIVO E LEGITIMO: o cliente compensou mais do que a usina reservou para
 * ele. E uma pergunta de negocio, nao um erro - por isso a conferencia devolve o
 * numero e nao um booleano. */
const c2 = conferirAlocacao('10000.0000', '1.0000', '150.0000');
chk('J5d', c2.diferenca_kwh === '-50.0000',
    'diferenca NEGATIVA sai com sinal - o cliente compensou mais do que lhe foi alocado');

chk('J5e', conferirAlocacao('0.0000', '4.7500', '0.0000').diferenca_kwh === '0.0000',
    'usina que mediu zero e cliente que compensou zero fecham em zero, sem -0');

/* A conferencia acompanha a fatura, e nao e um sinal booleano de proposito: as
 * duas grandezas quase nunca sao iguais, e um `divergiu` seria verdadeiro em
 * toda fatura - ruido, pelo criterio da R25. */
chk('J5f', ok.faturar && ok.conferencia.alocado_kwh === '489.2025'
        && ok.conferencia.compensado_kwh === '480.0000',
    'a conferencia viaja junto com a candidata - quem fatura ve os dois numeros');

// ===========================================================================
// J6 - ALERTA NAO E RECUSA
// ===========================================================================

const semDono = triarRegistro(com({ dono_usina_id: null }));
chk('J6a', semDono.faturar === true,
    'usina SEM DONO nao impede faturar - a cobranca ao cliente nao depende disso');
chk('J6b', semDono.faturar && semDono.alertas.includes('usina_sem_dono'),
    'mas levanta alerta: a R12 bloqueia o repasse quando ela for paga, e o dinheiro acumula sem destino');
chk('J6c', ok.faturar && ok.alertas.length === 0,
    'com dono cadastrado, nenhum alerta');

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
