// AS DUAS FOLHAS COMPOSTAS. Puro, sem banco e sem rede.
// Uso: node --experimental-strip-types tests/folha-unificada.ts
//
// O QUE ESTE ARQUIVO PRENDE. `comporFolhas` nao faz aritmetica de dinheiro - quem
// faz e `calcular()` -, mas ela ESCOLHE o que imprimir, e escolha errada e o mesmo
// defeito visto de outro angulo: o cliente recebe um numero que nao fecha.
//
// As tres coisas que so podem ser pegas aqui, e nao em `fatura-unificada.ts`:
//
//   1. QUE AS TRES LINHAS IMPRESSAS SOMEM. `calcular` garante que os centavos
//      fecham; esta camada escolhe QUAIS centavos vao para cada linha. Foi
//      exatamente aqui que a referencia falhou: medido em 14/08, as tres linhas
//      dela nao somam em 229 de 900 casos.
//   2. QUE A AUSENCIA SEJA NOMEADA E NAO DESENHADA COM ZERO. Sem tarifa cheia nao
//      ha o que comparar, e um cartao dizendo "voce economizou R$ 0,00" e pior que
//      cartao nenhum.
//   3. QUE O QR E AS BARRAS FALHEM SEPARADO. Sao dois caminhos de pagamento; um
//      derrubar o outro tira do cliente a forma que ainda funcionava.

import { comporFolhas, BOLETO_VAZIO, type DadosDoBoleto } from '../src/dominio/folha-unificada.ts';
import { calcular, CAMPOS_VAZIOS, PARAMETROS_PADRAO, paraDecimal, decimalBr,
         type CamposDaFaturaUnificada } from '../src/dominio/fatura-unificada.ts';
import type { EmissorDaFatura } from '../src/dominio/folha-g3.ts';
import { crc16, crcConfere } from '../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const EMISSOR: EmissorDaFatura = {
  razao_social: 'Consórcio G3 Gestão de Energia Solar',
  cnpj: '12345678000195',
};

/** Uma fatura da Equatorial completa, com os numeros no formato que o leitor devolve. */
const COMPLETA: CamposDaFaturaUnificada = {
  ...CAMPOS_VAZIOS,
  cliente: 'Maria Aparecida de Souza',
  documento: '12345678901',
  endereco: 'Rua das Acácias, 148 — Setor Bueno, Goiânia/GO',
  unidade_consumidora: '10012345',
  classificacao: 'Residencial Trifásico',
  mes_referencia: '07/2026',
  data_emissao: '02/08/2026',
  leitura_anterior: '01/07/2026',
  leitura_atual: '31/07/2026',
  dias_faturados: '30',
  vencimento: '15/08/2026',
  energia_compensada_kwh: '480',
  tarifa_kwh: '1.185396',
  consumo_nao_compensado_kwh: '50',
  consumo_nao_compensado_valor: '59.27',
  iluminacao_publica: '44.00',
  bandeira_tarifaria: 'Amarela',
  bandeira_valor: '8.40',
  outros_encargos: '12.33',
  valor_total_equatorial: '124.00',
  historico_consumo: [
    { mes: 'AGO/25', kwh: '410' }, { mes: 'SET/25', kwh: '388' }, { mes: 'OUT/25', kwh: '502' },
    { mes: 'NOV/25', kwh: '541' }, { mes: 'DEZ/25', kwh: '603' }, { mes: 'JAN/26', kwh: '588' },
    { mes: 'FEV/26', kwh: '512' }, { mes: 'MAR/26', kwh: '470' }, { mes: 'ABR/26', kwh: '433' },
    { mes: 'MAI/26', kwh: '401' }, { mes: 'JUN/26', kwh: '442' }, { mes: 'JUL/26', kwh: '480' },
  ],
};

/** `R$ 1.234,56` -> `123456`. So para conferir a SOMA do que foi impresso. */
function centavosDoTexto(s: string): number {
  const m = /^-?R\$\s*([\d.]+),(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`nao e dinheiro impresso: ${JSON.stringify(s)}`);
  const n = Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]);
  return s.trim().startsWith('-') ? -n : n;
}

/** Uma linha digitavel real e valida - a mesma de `tests/linha-digitavel.ts`. */
const LINHA_BOA = '75691.50043 01727.686907 00000.130013 1 15410000059669';
/*
 * O `PIX_BOM` PASSOU A SER BOM DE VERDADE EM 17/08/2026, e a correcao vale
 * registro porque o defeito que ela expoe era de PRODUCAO, nao de teste.
 *
 * Ate aqui a constante terminava em `6304` — os literais do campo do CRC — e
 * **nao tinha os quatro digitos do CRC depois deles**. Era um payload truncado
 * chamado "BOM", e nenhuma verificacao percebia, porque a folha desenhava o QR
 * sem conferir integridade nenhuma: `svgDoBrCode` codifica o texto que receber.
 *
 * O que estava escondido atras disso e maior. `comporPagamento` limpava o payload
 * com `.replace(/\s+/g, '')`, e o nome do beneficiario tem espaco de verdade
 * dentro: `5910G3 SOLAR` virava `5910G3SOLAR` — um campo que declara 10
 * caracteres e entrega 9. Todo boleto real passava por essa limpeza, e o
 * resultado era um QR impresso, bonito, que o aplicativo do banco nao le. O
 * fixture truncado tornava o defeito invisivel: sem CRC valido para quebrar, nao
 * havia o que medir.
 *
 * Agora o CRC e CALCULADO aqui, sobre o mesmo texto — a constante nao pode
 * envelhecer errada de novo — e a F5g confere que ele fecha antes de qualquer
 * outra coisa.
 */
const PIX_SEM_CRC =
  '00020126360014BR.GOV.BCB.PIX0114123456780001955204000053039865802BR5910G3 SOLAR6006GOIANIA62070503***6304';
const PIX_BOM = `${PIX_SEM_CRC}${crc16(PIX_SEM_CRC)}`;

const boletoCom = (p: Partial<DadosDoBoleto>): DadosDoBoleto => ({ ...BOLETO_VAZIO, ...p });

const contaCompleta = calcular(COMPLETA, PARAMETROS_PADRAO);
const folhas = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
  boletoCom({ linha_digitavel: LINHA_BOA, pix_copia_e_cola: PIX_BOM, nosso_numero: '1-3',
              instrucoes: ['Não receber após 30 dias do vencimento.'] }));

// ------------------------------------ F1 os tres cartoes somam, e sao energia
{
  const c = folhas.folha1.cartoes!;
  chk('F1', c !== null, 'com tarifa cheia os tres cartoes existem');

  const sem = centavosDoTexto(c.sem_g3.valor);
  const desc = centavosDoTexto(c.desconto.valor);
  const com = centavosDoTexto(c.com_g3.valor);
  chk('F1b', sem - desc === com,
      `AS TRES LINHAS IMPRESSAS SOMAM: ${sem} - ${desc} = ${com}. E a verificacao que a `
      + 'referencia nao passa - ela desconta do produto NAO arredondado e imprime as tres '
      + 'arredondadas, e em 229 de 900 casos elas nao fecham na folha do cliente');

  chk('F1c', sem === contaCompleta.integral_centavos && com === contaCompleta.energia_g3_centavos,
      'o primeiro cartao e a ENERGIA integral e nao a conta inteira - a semantica de 13/08 '
      + '(Q-DOCG3-12): comparar energia com energia. A versao antiga diluia o desconto contra '
      + 'um total que inclui repasse sem desconto nenhum');

  chk('F1d', sem > com, 'e o "sem a G3" e MAIOR que o "com a G3", que e o que a folha afirma');
  chk('F1e', c.desconto.percentual === '20%',
      `o percentual sai inteiro e com o sinal: ${c.desconto.percentual}`);
}

// -------------------------------------------- F2 o detalhamento fecha sozinho
{
  const d = folhas.folha1.detalhamento!;
  const soma = d.repasses.linhas.reduce((a, l) => a + centavosDoTexto(l.valor), 0);
  chk('F2', soma === centavosDoTexto(d.repasses.subtotal),
      `as quatro linhas de repasse somam o subtotal impresso (${soma})`);

  chk('F2b', centavosDoTexto(d.energia.linhas[0].valor) + centavosDoTexto(d.repasses.subtotal)
             === centavosDoTexto(d.total.valor),
      'energia + repasses = TOTAL A PAGAR, tudo lido do que foi IMPRESSO e nao do objeto');

  chk('F2c', centavosDoTexto(d.total.valor) === centavosDoTexto(folhas.folha1.total.valor),
      'e o total do detalhamento e o MESMO da barra navy - dois lugares na mesma folha '
      + 'mostrando o valor a pagar, e eles nao podem discordar');

  chk('F2d', d.energia.linhas[0].valor_cheio !== undefined
          && d.energia.linhas[0].tarifa_cheia === decimalBr(paraDecimal(contaCompleta.tarifa_kwh), 6),
      'a linha de energia carrega o par tachado - tarifa cheia e valor cheio - e e assim que '
      + 'a folha mostra o desconto sem precisar da palavra');

  /*
   * ============================================================================
   * F2e  A FOLHA E BRASILEIRA, E O NUMERO DECIMAL TAMBEM.
   *
   * Ate 14/08 a folha imprimia a saida de `decimalParaTexto`, que usa PONTO
   * porque e a forma de TROCA - a que viaja em JSON e vai para `numeric`. Medido
   * numa folha composta, a mesma linha do detalhamento trazia:
   *
   *     Tarifa R$ 1.185396      Valor R$ 35,56
   *
   * Um cliente que le "1.185396" numa coluna de reais le mil cento e oitenta e
   * cinco - e essa e justamente a coluna que prova a tarifa cheia contra a com
   * desconto, que e o numero que ele confere na conta da distribuidora.
   *
   * A verificacao nao olha o valor: olha a PONTUACAO. Ela cai no dia em que
   * alguem ligar `decimalParaTexto` de volta na folha.
   */
  {
    const numericos = [
      d.energia.linhas[0]!.tarifa, d.energia.linhas[0]!.tarifa_cheia!,
      d.energia.linhas[0]!.kwh,
      folhas.folha1.cartoes!.desconto.percentual,
      folhas.folha2.indicadores.consumo.valor, folhas.folha2.indicadores.co2.valor,
    ];
    const comPontoDecimal = numericos.filter((t) => /\d\.\d/.test(t));
    chk('F2f', comPontoDecimal.length === 0,
        'nenhum numero da folha sai com PONTO decimal - a folha e brasileira e a vizinha da '
        + `coluna e "R$ 35,56" (achados: ${comPontoDecimal.join(', ') || 'nenhum'})`);
  }

  /* O RESIDUO E NOMEADO "demais encargos", e nao "outros encargos": ele e o que
   * SOBRA do total da Equatorial depois das tres parcelas conhecidas, e pode
   * divergir do que o extrator leu. */
  const demais = d.repasses.linhas.find((l) => l.descricao === 'Demais encargos e tributos')!;
  chk('F2e', centavosDoTexto(demais.valor) === contaCompleta.demais_centavos,
      'a quarta linha e o RESIDUO e nao o "outros encargos" lido - assim o subtotal fecha '
      + 'com o total que a Equatorial cobrou, que e o valor que a G3 vai pagar de verdade');
}

// --------------------------------- F3 sem tarifa cheia, a ausencia e NOMEADA
{
  const semTarifa = { ...COMPLETA, tarifa_kwh: '', energia_compensada_kwh: '' };
  const f = comporFolhas(semTarifa, calcular(semTarifa, PARAMETROS_PADRAO), EMISSOR, BOLETO_VAZIO);

  chk('F3', f.folha1.cartoes === null && f.folha1.detalhamento === null,
      'SEM TARIFA CHEIA nao ha o que comparar: os cartoes e o detalhamento saem da folha '
      + 'inteiros, em vez de aparecerem dizendo "voce economizou R$ 0,00"');

  chk('F3b', f.folha1.total.valor === 'R$ 124,00',
      'e a folha CONTINUA SAINDO - o valor a pagar e o repasse da Equatorial, que existe');

  chk('F3c', f.folha1.cliente.nome === COMPLETA.cliente && f.folha2.pagamento.titulo === 'Pagamento',
      'e as duas folhas continuam completas no resto');
}

// ------------------------------------------------ F4 o grafico e o historico
{
  const h = folhas.folha2.historico!;
  chk('F4', h !== null && folhas.folha2.historico_motivo === null,
      'historico plausivel vira grafico, e sem motivo a declarar');

  const maior = h.barras.reduce((a, b) => (b.altura_pct > a ? b.altura_pct : a), 0);
  chk('F4b', maior === 100, `a barra mais alta e 100% (${maior}) - a proporcao vem pronta do servidor`);

  chk('F4c', h.barras[h.barras.length - 1].atual
          && h.barras.filter((b) => b.atual).length === 1,
      'exatamente UMA barra e a do mes, e e a ultima');

  const muitos = { ...COMPLETA, historico_consumo: Array.from({ length: 20 }, (_, i) => ({
    mes: `M${i}`, kwh: String(300 + ((i * 37) % 400)),
  })) };
  const f = comporFolhas(muitos, calcular(muitos, PARAMETROS_PADRAO), EMISSOR, BOLETO_VAZIO);
  chk('F4d', f.folha2.historico!.barras.length === 13,
      'vinte meses lidos viram TREZE barras - e o que cabe na largura da folha, e sao os '
      + 'treze mais RECENTES');

  /* HISTORICO INVENTADO NAO VIRA GRAFICO. Um modelo de visao que nao acha a
   * tabela lateral produz uma progressao regular plausivel, e a folha do cliente
   * e o pior lugar do sistema para descobrir isso. */
  const reto = { ...COMPLETA, historico_consumo:
    Array.from({ length: 12 }, (_, i) => ({ mes: `M${i}`, kwh: '500' })) };
  const g = comporFolhas(reto, calcular(reto, PARAMETROS_PADRAO), EMISSOR, BOLETO_VAZIO);
  chk('F4e', g.folha2.historico === null && (g.folha2.historico_motivo ?? '').includes('oscilam'),
      'doze meses identicos NAO viram grafico, e o motivo e dito a quem opera: '
      + `"${g.folha2.historico_motivo}"`);

  const vazio = { ...COMPLETA, historico_consumo: [] };
  const v = comporFolhas(vazio, calcular(vazio, PARAMETROS_PADRAO), EMISSOR, BOLETO_VAZIO);
  chk('F4f', v.folha2.historico === null && (v.folha2.historico_motivo ?? '').includes('Sem histórico'),
      'e sem historico nenhum o motivo e outro - "nao veio" e "nao confio" sao coisas diferentes');
}

// ------------------------------- F5 o QR e as barras falham SEPARADO
{
  const so_boleto = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: LINHA_BOA, pix_copia_e_cola: '' }));
  chk('F5', so_boleto.folha2.pagamento.barras !== null && so_boleto.folha2.pagamento.qr === null,
      'sem Pix, o boleto sai igual - a folha vai com o caminho que existe');

  const so_pix = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: '', pix_copia_e_cola: PIX_BOM }));
  chk('F5b', so_pix.folha2.pagamento.qr !== null && so_pix.folha2.pagamento.barras === null,
      'e sem linha digitavel o QR sai igual - UM caminho de pagamento nao derruba o outro');

  chk('F5c', (so_pix.folha2.pagamento.barras_motivo ?? '').includes('Sem linha digitável'),
      `e a ausencia diz por que: "${so_pix.folha2.pagamento.barras_motivo}"`);

  /* A LINHA CORROMPIDA E O CASO QUE IMPORTA. Um digito trocado passa despercebido
   * a olho e o codigo de barras sai desenhado - e quem descobre e o caixa do
   * banco, com o cliente na frente. */
  const digitos = LINHA_BOA.replace(/\D/g, '');
  const trocado = `${digitos.slice(0, 3)}${(Number(digitos[3]) + 1) % 10}${digitos.slice(4)}`;
  const ruim = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: trocado, pix_copia_e_cola: PIX_BOM }));
  chk('F5d', ruim.folha2.pagamento.barras === null && ruim.folha2.pagamento.qr !== null,
      'UM DIGITO TROCADO no campo 1 e o codigo de barras NAO e desenhado - e o QR continua');
  chk('F5e', (ruim.folha2.pagamento.barras_motivo ?? '').includes('verificação'),
      `e o motivo nomeia a verificacao que caiu: "${ruim.folha2.pagamento.barras_motivo}"`);

  const curta = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: '7569150043' }));
  chk('F5f', (curta.folha2.pagamento.barras_motivo ?? '').includes('10 dígitos'),
      'linha incompleta diz QUANTOS digitos vieram - e o defeito mais comum de copiar do PDF');

  /* ------------------------------------------------------------------------
   * O PIX QUE NAO FECHA O PROPRIO VERIFICADOR - as tres verificacoes que o
   * defeito de 17/08 obrigou a existir. Ver a nota do `PIX_BOM` la em cima.
   */
  chk('F5g', crcConfere(PIX_BOM),
      'PRE-CONDICAO: o payload de referencia deste arquivo e integro de verdade');

  const nomeComposto = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: LINHA_BOA, pix_copia_e_cola: PIX_BOM }));
  chk('F5h', nomeComposto.folha2.pagamento.qr !== null
       && nomeComposto.folha2.pagamento.pix_texto === PIX_BOM,
      'o espaco DENTRO do nome do beneficiario sobrevive a limpeza - era ele que quebrava o CRC');

  /* Copiado de um PDF: o payload veio inteiro, com quebra de linha no meio. Isso
   * NAO e corrupcao, e a folha nao pode trata-lo como se fosse. */
  const colado = `${PIX_BOM.slice(0, 45)}\n   ${PIX_BOM.slice(45)}`;
  const doPdf = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: LINHA_BOA, pix_copia_e_cola: colado }));
  chk('F5i', doPdf.folha2.pagamento.qr !== null && doPdf.folha2.pagamento.pix_texto === PIX_BOM,
      'quebra de linha de quem copiou do PDF e desfeita, e o QR sai');

  const pixRuim = `${PIX_BOM.slice(0, -4)}0000`;
  const comPixRuim = comporFolhas(COMPLETA, contaCompleta, EMISSOR,
    boletoCom({ linha_digitavel: LINHA_BOA, pix_copia_e_cola: pixRuim }));
  chk('F5j', comPixRuim.folha2.pagamento.qr === null
       && (comPixRuim.folha2.pagamento.qr_motivo ?? '').includes('CRC'),
      'CRC que nao fecha NAO vira QR desenhado - um codigo que o banco nao le parece pagamento e nao e');
  chk('F5k', comPixRuim.folha2.pagamento.barras !== null,
      'e o boleto ao lado continua desenhado: o Pix quebrado nao derruba o caminho que funciona');
}

// ---------------------------------------- F6 identificacao, mascara e rodape
{
  chk('F6', folhas.numero_da_fatura === '10012345-202607',
      `o numero da fatura e {UC}-{AAAAMM}: ${folhas.numero_da_fatura}`);

  chk('F6b', folhas.folha1.cliente.documento.includes('*')
          && !folhas.folha1.cliente.documento.includes('12345678901'),
      `o CPF sai mascarado (${folhas.folha1.cliente.documento}) - a folha viaja por e-mail e `
      + 'WhatsApp, e o documento inteiro impresso nela e dado pessoal a mais do que o necessario');

  chk('F6c', folhas.folha1.rodape.paginacao === 'Fatura 10012345-202607 · página 1 de 2',
      'a paginacao diz DE QUANTAS - uma folha que chega sozinha se denuncia');

  chk('F6d', folhas.folha2.pagamento.beneficiario === folhas.folha1.cabecalho.emissor
          && String(folhas.folha1.cabecalho.emissor).includes('12.345.678/0001-95'),
      'o beneficiario da faixa e o MESMO texto do cabecalho, com CNPJ formatado - e a isso '
      + 'que o aviso contra o golpe do boleto amarra');

  chk('F6e', folhas.folha2.rodape.informacoes.some((t) => t.includes('golpe do boleto')),
      'e o aviso esta no rodape da folha 2');

  const anonimo = comporFolhas(COMPLETA, contaCompleta, { razao_social: null, cnpj: null },
                               boletoCom({ linha_digitavel: LINHA_BOA }));
  chk('F6f', anonimo.folha1.cabecalho.emissor === null
          && !anonimo.folha2.rodape.informacoes.some((t) => t.includes('golpe do boleto')),
      'SEM EMISSOR CADASTRADO a linha nao sai, e o aviso contra o golpe SOME junto: '
      + '"confira se o beneficiario e —" treinaria exatamente o comportamento que ele impede');
}

// ------------------------------------------- F7 os indicadores da folha 2
{
  const i = folhas.folha2.indicadores;
  chk('F7', i.economia.valor === folhas.folha1.cartoes!.desconto.valor,
      'sem economia acumulada informada, o indicador e o desconto DESTA fatura');
  chk('F7b', i.economia.nota.includes('Primeira fatura'),
      'e a nota diz que e a primeira, em vez de afirmar um acumulado que ninguem somou');

  const comHistorico = comporFolhas(COMPLETA, contaCompleta, EMISSOR, BOLETO_VAZIO,
    { economia_acumulada_centavos: 250000, desde: 'março de 2026' });
  chk('F7c', comHistorico.folha2.indicadores.economia.valor === 'R$ 2.500,00'
          && comHistorico.folha2.indicadores.economia.nota.includes('março de 2026'),
      'com o acumulado vindo de fora, o indicador o usa e datou a serie');

  chk('F7d', i.consumo.valor === `${decimalBr(paraDecimal(contaCompleta.consumo_do_mes_kwh), 0)} kWh`
          && i.co2.valor === `${decimalBr(paraDecimal(contaCompleta.co2_kg), 1)} kg`,
      'consumo e CO2 saem com UNIDADE e vem prontos da conta - grandeza fisica nunca vira centavo');
}

console.log();
if (falhas > 0) { console.log(`--- folhas unificadas: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- as duas folhas compostas: 35 verificacoes, 0 falhas');
