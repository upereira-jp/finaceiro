// O LAYOUT do documento de cobranca. Puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types tests/layout-do-documento.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. A decisao 2 da `Q-DOCFATURA-01` foi layout
// CONFIGURAVEL por tenant, e o risco que eu tinha nomeado ao recomendar o
// contrario era "campo inexistente vira fatura errada". Metade disso morreu no
// banco, pelo enum `campo_de_fatura`. A outra metade e aqui: ORDEM, ROTULO e
// FORMATACAO - e os tres saem num documento que vai para o cliente.
//
// Duas coisas que este arquivo existe para impedir:
//
//   - VAZIO VIRANDO NUMERO. Um total desconhecido impresso como "R$ 0,00" e
//     defeito silencioso, e `valor_total_centavos` E nulavel - medido, e a
//     primeira versao do codigo afirmava o contrario.
//   - CONFIGURACAO PERDENDO PARA O PADRAO. Um campo que o tenant ESCONDEU nao
//     pode reaparecer no dia em que o padrao ganhar um item novo.

import { emReais } from '../src/dominio/centavos.ts';
import {
  linhasDoDocumento, PADRAO, dataBr, competenciaBr,
  type DadosDaFatura, type ConfiguracaoDeCampo,
} from '../src/dominio/layout-do-documento.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const fatura: DadosDaFatura = {
  competencia: '2026-07-01', vencimento: '2026-08-10',
  numero_uc: '000406456101252', distribuidora: 'Equatorial',
  cliente_nome: 'Maria da Conceição', cliente_documento: '52998224725',
  usina_codigo_geradora: '401269001287',
  geracao_kwh_competencia: '10250.500', percentual_rateio_aplicado: '9.50',
  consumo_kwh: '1026.0', tarifa_reais_por_kwh: '0.986412',
  valor_consumo_centavos: 81244, valor_tarifas_concessionaria_centavos: 1050,
  valor_juros_multa_centavos: 0, valor_total_centavos: 82294,
  flag_fatura_cheia: true,
};

// ------------------------------------------------ D1 dinheiro e data por texto
{
  chk('D1', emReais(82294) === 'R$ 822,94', 'centavos viram reais com virgula');
  chk('D1b', emReais(123456789) === 'R$ 1.234.567,89', 'milhar com ponto, em qualquer tamanho');
  chk('D1c', emReais(8) === 'R$ 0,08' && emReais(0) === 'R$ 0,00',
      'oito centavos nao vira "R$ 0,8" e zero e "R$ 0,00"');
  chk('D1d', dataBr('2026-08-10') === '10/08/2026' && competenciaBr('2026-07-01') === '07/2026',
      'data por RECORTE de string: `new Date` aplicaria fuso e a competencia viraria junho de madrugada');

  /*
   * O QUE O COLAPSO DE 14/08 GANHOU. Ate essa data este arquivo tinha `emReais`
   * PROPRIA - copia comportamental da de `centavos.ts`, medida identica em 4.042
   * casos, e a copia era a SEM validacao: aceitava `number` cru. Colapsadas numa
   * so, o documento do cliente passou a recusar o que nao e centavo inteiro em vez
   * de formatar em silencio. E a regra 1 chegando ate o papel.
   */
  const recusa = (v: unknown) => {
    try { emReais(v as number); return false; } catch { return true; }
  };
  chk('D1e', recusa(12.5) && recusa(NaN) && recusa('82294') && recusa(Infinity),
      'valor que NAO e centavo inteiro e recusado com nome - nao formatado por aproximacao');
  chk('D1f', !recusa(0) && !recusa(-1) && !recusa(82294),
      'zero, negativo e inteiro comum continuam passando - a recusa e do nao-inteiro, nao do incomum');
}

// --------------------------------------- D2 sem configuracao, vale o PADRAO
{
  const l = linhasDoDocumento(fatura, []);
  chk('D2', l.length === PADRAO.length,
      `configuracao VAZIA devolve o padrao inteiro (${PADRAO.length} linhas) - vazio no banco nao e documento vazio`);
  chk('D2b', l[0].campo === 'competencia' && l[l.length - 1].campo === 'vencimento',
      'a ordem do padrao e preservada: competencia primeiro, vencimento por ultimo');
  chk('D2c', l.some((x) => x.campo === 'valor_total_centavos' && x.valor === 'R$ 822,94'),
      'o total sai formatado');
  chk('D2d', l.some((x) => x.campo === 'tarifa_reais_por_kwh' && x.valor === '0.986412'),
      'a tarifa sai com as SEIS casas, como veio do banco - nao passou por Number()');
  chk('D2e', !l.some((x) => x.campo === 'flag_fatura_cheia'),
      '`flag_fatura_cheia` NAO entra por padrao: e estado interno, ruim numa fatura que vai ao cliente');
}

// --------------------------------- D3 a configuracao VENCE, e vence por completo
{
  const cfg: ConfiguracaoDeCampo[] = [
    { campo: 'valor_total_centavos', rotulo: 'Total do mês', ordem: 0, visivel: true },
    { campo: 'numero_uc', rotulo: null, ordem: 1, visivel: true },
  ];
  const l = linhasDoDocumento(fatura, cfg);
  chk('D3', l.length === 2,
      'configuracao com 2 campos devolve 2 linhas - nao ha mistura com o padrao');
  chk('D3b', l[0].campo === 'valor_total_centavos' && l[0].rotulo === 'Total do mês',
      'o rotulo do tenant vence o do padrao');
  chk('D3c', l[1].rotulo === 'Unidade consumidora',
      'rotulo NULO cai no padrao - a migration nao poe default na coluna, e o default vive no codigo');
  // O SENTIDO QUE IMPORTA: esconder e uma decisao, e ela tem de sobreviver a uma
  // atualizacao que acrescente campos ao padrao.
  chk('D3d', !l.some((x) => x.campo === 'cliente_nome'),
      'campo fora da configuracao NAO aparece, mesmo estando no padrao');
  chk('D3e', linhasDoDocumento(fatura, [{ campo: 'numero_uc', rotulo: null, ordem: 0, visivel: false }]).length === 0,
      '`visivel: false` some da lista - e o unico jeito de o tenant tirar um campo');
}

// ------------------------------------------------------- D4 a ordem, e o empate
{
  const cfg: ConfiguracaoDeCampo[] = [
    { campo: 'vencimento', rotulo: null, ordem: 5, visivel: true },
    { campo: 'competencia', rotulo: null, ordem: 1, visivel: true },
    { campo: 'numero_uc', rotulo: null, ordem: 3, visivel: true },
  ];
  const l = linhasDoDocumento(fatura, cfg).map((x) => x.campo);
  chk('D4', JSON.stringify(l) === JSON.stringify(['competencia', 'numero_uc', 'vencimento']),
      'a ordem e a coluna `ordem`, nao a ordem de insercao');

  // A migration 19 nao poe UNIQUE em `ordem` de proposito - trocar duas linhas de
  // lugar violaria a constraint no meio da transacao. O empate e resolvido AQUI, e
  // tem de ser estavel: sem isso a mesma fatura sairia com campos alternando de
  // posicao entre duas impressoes.
  const empate: ConfiguracaoDeCampo[] = [
    { campo: 'vencimento', rotulo: null, ordem: 2, visivel: true },
    { campo: 'competencia', rotulo: null, ordem: 2, visivel: true },
  ];
  const a = linhasDoDocumento(fatura, empate).map((x) => x.campo);
  const b = linhasDoDocumento(fatura, [...empate].reverse()).map((x) => x.campo);
  chk('D4b', JSON.stringify(a) === JSON.stringify(b),
      'empate de `ordem` desempata pelo NOME e e ESTAVEL - a mesma fatura nao troca de layout entre impressoes');
}

// ---------------------------------- D5 ausente NAO e zero, e vale para dinheiro
{
  const semDados: DadosDaFatura = {
    ...fatura,
    consumo_kwh: null, tarifa_reais_por_kwh: null, numero_uc: null,
    valor_total_centavos: null,
  };
  const l = linhasDoDocumento(semDados, []);
  const de = (c: string) => l.find((x) => x.campo === c)!;

  chk('D5', de('consumo_kwh').valor === '—' && de('consumo_kwh').ausente === true,
      'kWh nulo sai "—" e marcado como ausente - nao "0 kWh" num documento que o cliente recebe');
  chk('D5b', de('valor_total_centavos').valor === '—' && de('valor_total_centavos').ausente === true,
      'TOTAL nulo sai "—", nao "R$ 0,00": `valor_total_centavos` e GENERATED ALWAYS e aceita nulo (medido em 30/07)');
  chk('D5c', de('numero_uc').valor === '—',
      'texto nulo tambem sai "—", nao string vazia que parece campo esquecido');
  chk('D5d', de('valor_juros_multa_centavos').valor === 'R$ 0,00'
          && de('valor_juros_multa_centavos').ausente === false,
      'e ZERO DE VERDADE continua "R$ 0,00": juros e NOT NULL, entao zero ali e informacao, nao ausencia');
}

// ------------------------------------------------------------ D6 tipo por linha
{
  const l = linhasDoDocumento(fatura, []);
  const de = (c: string) => l.find((x) => x.campo === c)!;
  chk('D6', de('valor_total_centavos').tipo === 'dinheiro'
         && de('consumo_kwh').tipo === 'decimal'
         && de('vencimento').tipo === 'data'
         && de('competencia').tipo === 'competencia'
         && de('cliente_nome').tipo === 'texto',
      'cada linha carrega o TIPO - a tela alinha e destaca por ele, sem reconhecer campo por nome');
  chk('D6b', linhasDoDocumento(fatura, [{ campo: 'flag_fatura_cheia', rotulo: null, ordem: 0, visivel: true }])[0].valor === 'sim',
      'booleano sai "sim"/"não", e nao "true" - o documento e para uma pessoa ler');
}

console.log();
if (falhas > 0) { console.log(`--- layout: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- layout do documento: 24 verificacoes, 0 falhas');
