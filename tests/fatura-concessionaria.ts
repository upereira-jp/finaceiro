// A FATURA DA CONCESSIONARIA LIDA, e as duas portas. Puro, sem banco, sem rede.
// Uso: node --experimental-strip-types tests/fatura-concessionaria.ts
//
// O MODO DE FALHA QUE ESTA SUITE PERSEGUE nao e a fatura ilegivel - essa
// aparece. Sao os tres numeros da mesma pagina que PARECEM todos certos:
//
//     total a pagar            R$ 412,90    <- o numero grande e visivel
//     fio B + COSIP + encargos R$  88,15    <- o unico que vai para a coluna
//     consumo compensado       R$ 324,75    <- o que a G3 cobra, e ja esta na fatura
//
// Ler o primeiro no lugar do segundo nao produz erro nenhum: produz uma fatura
// da G3 com repasse a mais, comissao calculada sobre base errada (`PRD` 5.4, que
// EXCLUI esta parcela) e split errado. Aparece na conta de alguem, meses depois.
// Por isso a maior parte dos casos aqui e sobre QUAL numero, e nao sobre entrada
// invalida.
//
// A SEGUNDA COISA QUE ELA PRENDE e que a fatura lida e a planilha de tarifas
// convertem reais do MESMO jeito. As duas alimentam a mesma coluna por caminhos
// diferentes; se "1.234" valesse coisas diferentes nas duas, o mesmo numero
// significaria duas coisas no mesmo sistema. O caso F11 compara saida com saida
// em vez de com constante - o mesmo formato do V4 de `planilha-tarifas`.

import {
  lerFaturaDaConcessionaria, lerLoteDeFaturas, DIGITOS_DA_UC,
  type CamposDaFatura,
} from '../src/dominio/fatura-concessionaria.ts';
import { lerPlanilhaDeTarifas } from '../src/dominio/planilha-tarifas.ts';
import { ColetaFalsa, LeituraFalsa } from '../src/concessionaria/falso.ts';
import {
  SemFaturaNaCompetencia, CredencialRecusadaPeloPortal, PortalBloqueouAColeta,
  COLETA_NAO_CONFIGURADA, LEITURA_NAO_CONFIGURADA,
} from '../src/concessionaria/porta.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = async (f: () => unknown): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

/** Uma fatura que le inteira. Os casos partem daqui mudando um campo so. */
const BOA: CamposDaFatura = {
  numero_uc: '000000013290060',
  competencia: '06/2026',
  fio_b: 'R$ 52,40',
  iluminacao_publica: 'R$ 18,75',
  encargos: 'R$ 17,00',
  total_a_pagar: 'R$ 412,90',
  consumo_kwh: '1.240,50',
  energia_compensada_kwh: '1.100,00',
};

// ================================================== F1. ausente nao e zero
{
  for (const campo of ['fio_b', 'iluminacao_publica', 'encargos'] as const) {
    const r = lerFaturaDaConcessionaria({ ...BOA, [campo]: null });
    chk(`F1${campo[0]}`, r.ok === false && r.erros.some((e) => e.campo === campo),
        `a parcela \`${campo}\` ausente RECUSA a leitura com erro nomeado - nao vira R$ 0,00 `
        + 'silencioso, que e o que faria a coluna sair menor sem ninguem perceber');
  }
  const r = lerFaturaDaConcessionaria({ ...BOA, fio_b: '' });
  chk('F1d', r.ok === false && /ausente nao e zero/.test(r.erros[0]!.motivo),
      'celula vazia e tratada como ausente, e o motivo DIZ a regra - a mesma de `planilha-tarifas`');
}

// ============================ F2. o total NAO e o valor. E o caso que paga a suite
{
  const r = lerFaturaDaConcessionaria(BOA);
  chk('F2a', r.ok === true, 'a fatura boa le inteira');
  if (r.ok) {
    chk('F2b', r.leitura.tarifas_concessionaria_centavos === 5240 + 1875 + 1700,
        `a coluna recebe a SOMA EXPLICITA das tres parcelas do \`PRD\` 5.1 (R$ 88,15), `
        + 'e nao o total da pagina');
    chk('F2c', r.leitura.tarifas_concessionaria_centavos !== r.leitura.total_a_pagar_centavos,
        'o valor da coluna e DIFERENTE do total a pagar (R$ 412,90) - se algum dia estes dois '
        + 'forem iguais por construcao, esta verificacao cai e o defeito aparece aqui em vez de na fatura');
    chk('F2d', r.leitura.total_a_pagar_centavos === 41290,
        'o total e lido e GUARDADO, porque conferencia precisa do numero - so nao e a fonte');
  }
}

// ---- F2e: sem o total, a leitura vale igual. O total nao e insumo de nada.
{
  const { total_a_pagar, ...semTotal } = BOA;
  const r = lerFaturaDaConcessionaria(semTotal as CamposDaFatura);
  const comTotal = lerFaturaDaConcessionaria(BOA);
  chk('F2e', r.ok === true && comTotal.ok === true
      && r.leitura.tarifas_concessionaria_centavos === comTotal.leitura.tarifas_concessionaria_centavos,
      'sem `total_a_pagar` a leitura vale exatamente o mesmo - a prova de que ele nao entra no calculo '
      + 'por caminho nenhum');
}

// ---- F2f: total ilegivel e AVISO, nao erro. A conferencia nao pode derrubar o dado.
{
  const r = lerFaturaDaConcessionaria({ ...BOA, total_a_pagar: 'ilegivel' });
  chk('F2f', r.ok === true && r.leitura.total_a_pagar_centavos === null
      && r.leitura.avisos.some((a) => a.campo === 'total_a_pagar'),
      'total ilegivel vira AVISO e a leitura passa - recusar por causa da conferencia seria perder '
      + 'as tres parcelas que foram lidas certo');
}

// ================================================== F3. a conferencia que conta e nao decide
{
  const r = lerFaturaDaConcessionaria({ ...BOA, total_a_pagar: 'R$ 10,00' });
  chk('F3a', r.ok === true && r.leitura.avisos.some((a) => /MENOR que a soma/.test(a.observacao)),
      'total menor que a soma das partes vira AVISO nomeado - e sinal de extracao errada, e a '
      + 'conferencia nao sabe qual dos dois lados errou');
  chk('F3b', r.ok === true && r.leitura.tarifas_concessionaria_centavos === 8815,
      'e o aviso NAO altera o valor. Conta e nao decide - o precedente e `prontidao` e `conferirTarifas`');
}

// ================================================== F4. o zero a esquerda
{
  const r = lerFaturaDaConcessionaria({ ...BOA, numero_uc: '13290060' });
  chk('F4a', r.ok === true && r.leitura.numero_uc === '000000013290060',
      `UC sem os zeros a esquerda e restaurada para ${DIGITOS_DA_UC} digitos - medido em 07/08: as 41 `
      + 'UCs de producao tem zero a esquerda, e todo caminho por planilha ou OCR os perde');

  const r2 = lerFaturaDaConcessionaria({ ...BOA, numero_uc: '0000000132900601234' });
  chk('F4b', r2.ok === false && /nao e zero a esquerda perdido/.test(r2.erros[0]!.motivo),
      'UC com MAIS digitos que o formato e RECUSADA - truncar produziria uma UC valida e errada');

  const r3 = lerFaturaDaConcessionaria({ ...BOA, numero_uc: ' 132.900-60 ' });
  chk('F4c', r3.ok === true && r3.leitura.numero_uc === '000000013290060',
      'pontuacao de apresentacao - ponto, hifen, barra, espaco - e removida, porque nenhuma delas '
      + 'pode ser um digito mal lido');

  /*
   * ESTE PAR ERA UM CASO SO, E ELE ESTAVA ERRADO. A primeira versao mandava
   * `UC 132.900-60` e esperava que passasse: o rotulo "UC" e apresentacao, afinal.
   * So que aceita-lo exige decidir que ALGUMAS letras sao rotulo e outras sao
   * digito mal lido - e distinguir "UC" de "O" e exatamente a adivinhacao que
   * este modulo recusa. O `O` no lugar do zero e o erro classico de OCR, e ele
   * produz uma UC de 15 digitos plausivel e inexistente.
   *
   * Entao a regra e uma so e sem excecao: QUALQUER letra recusa. Custa ao
   * extrator entregar o campo limpo, que e trabalho dele.
   */
  const r4 = lerFaturaDaConcessionaria({ ...BOA, numero_uc: '13290O60' });
  chk('F4d', r4.ok === false && /nao e digito/.test(r4.erros[0]!.motivo),
      'a letra O no lugar do zero - o erro classico de OCR - e RECUSADA e nao adivinhada');

  const r5 = lerFaturaDaConcessionaria({ ...BOA, numero_uc: 'UC 132.900-60' });
  chk('F4e', r5.ok === false,
      'e o rotulo "UC" tambem RECUSA, pela mesma regra - aceitar letra de rotulo obrigaria a '
      + 'decidir quais letras sao rotulo e quais sao zero mal lido, e essa e a adivinhacao que F4d proibe');
}

// ================================================== F5. kWh nao e dinheiro (regra 1)
{
  const r = lerFaturaDaConcessionaria(BOA);
  chk('F5a', r.ok === true && r.leitura.consumo_kwh === '1240.50',
      'kWh mantem escala decimal e sai como texto normalizado - regra 1: grandeza fisica nunca '
      + 'converte para centavos');
  chk('F5b', r.ok === true && r.leitura.consumo_kwh !== '124050',
      'e explicitamente NAO virou 124050 centavos - a verificacao afirma o sentido perigoso de proposito');
  const semKwh = lerFaturaDaConcessionaria({ ...BOA, consumo_kwh: null, energia_compensada_kwh: null });
  chk('F5c', semKwh.ok === true && semKwh.leitura.consumo_kwh === null,
      'kWh ausente NAO recusa a leitura: ele nao alimenta coluna de dinheiro nenhuma, ao contrario '
      + 'das tres parcelas');
}

// ================================================== F6. negativo
{
  const r = lerFaturaDaConcessionaria({ ...BOA, encargos: '-10,00' });
  chk('F6a', r.ok === false && /negativo/.test(r.erros[0]!.motivo),
      'parcela negativa e recusada - repasse a distribuidora nao e credito, e um sinal trocado '
      + 'diminuiria a coluna sem erro');
}

// ================================================== F7. competencia
{
  const a = lerFaturaDaConcessionaria({ ...BOA, competencia: '06/2026' });
  const b = lerFaturaDaConcessionaria({ ...BOA, competencia: '2026-06' });
  const c = lerFaturaDaConcessionaria({ ...BOA, competencia: '2026-06-15' });
  chk('F7a', a.ok === true && b.ok === true && c.ok === true
      && a.leitura.competencia === '2026-06-01'
      && b.leitura.competencia === '2026-06-01'
      && c.leitura.competencia === '2026-06-01',
      'os tres formatos convergem para `AAAA-MM-01`, que e o que `fatura.competencia` guarda');
  const d = lerFaturaDaConcessionaria({ ...BOA, competencia: '13/2026' });
  chk('F7b', d.ok === false, 'mes 13 e recusado');

  /*
   * F7c NASCEU DE UM DEFEITO, e ele so apareceu porque o dono trouxe o PDF em
   * vez de descreve-lo. A primeira versao aceitava `MM/AAAA` e `AAAA-MM` — e a
   * fatura REAL da Equatorial, medida em 08/08/2026, escreve `FEV/2026`.
   * Ou seja: o modulo teria recusado TODA fatura da distribuidora, com erro
   * nomeado e honesto, e ninguem saberia por que ate abrir um documento.
   */
  const e = lerFaturaDaConcessionaria({ ...BOA, competencia: 'FEV/2026' });
  chk('F7c', e.ok === true && e.leitura.competencia === '2026-02-01',
      '`FEV/2026` — o formato que a fatura REAL da Equatorial usa — vira 2026-02-01. A versao '
      + 'anterior recusava, e teria recusado todas');

  const f = lerFaturaDaConcessionaria({ ...BOA, competencia: 'DEZ/2025' });
  const g = lerFaturaDaConcessionaria({ ...BOA, competencia: 'XYZ/2026' });
  chk('F7d', f.ok === true && f.leitura.competencia === '2025-12-01' && g.ok === false,
      'os doze meses por extenso valem, e um mes que nao existe continua sendo RECUSADO em vez de '
      + 'virar janeiro por descuido');
}

// ================================================== F8. todos os erros, nao o primeiro
{
  const r = lerFaturaDaConcessionaria({ numero_uc: null, competencia: null, fio_b: null, iluminacao_publica: null, encargos: null });
  chk('F8a', r.ok === false && r.erros.length === 5,
      `uma extracao que errou 5 campos devolve os 5 (veio ${r.ok === false ? r.erros.length : 0}) - `
      + 'devolver so o primeiro faria alguem consertar cinco vezes');
  chk('F8b', r.ok === false && new Set(r.erros.map((e) => e.campo)).size === 5,
      'e cada erro NOMEIA o seu campo');
}

// ================================================== F9. o lote fecha a soma
{
  const r = lerLoteDeFaturas([
    { origem: 'uc-1.pdf', campos: BOA },
    { origem: 'uc-2.pdf', campos: { ...BOA, numero_uc: '000000013290061' } },
    { origem: 'uc-3.pdf', campos: { ...BOA, fio_b: null } },
  ]);
  chk('F9a', r.lidas.length + r.recusadas.length === 3,
      `lidas (${r.lidas.length}) + recusadas (${r.recusadas.length}) === 3 entradas - a mesma `
      + 'invariante do `lote-de-documentos`: contagem que perde item parece completa');
  chk('F9b', r.recusadas.length === 1 && r.recusadas[0]!.origem === 'uc-3.pdf',
      'a recusada carrega a ORIGEM, porque quem for conferir tem um arquivo na mao e nao um indice');
}

// ================================================== F10. duplicata nao e soma
{
  const r = lerLoteDeFaturas([
    { origem: 'primeira-via.pdf', campos: BOA },
    { origem: 'segunda-via.pdf', campos: BOA },
  ]);
  chk('F10a', r.duplicadas.length === 1 && r.duplicadas[0]!.origens.length === 2,
      'a mesma UC na mesma competencia duas vezes e NOMEADA como duplicata, com os dois arquivos');
  chk('F10b', r.lidas.length === 2,
      'e as duas continuam em `lidas` - somar produziria o dobro do repasse sem erro nenhum, e '
      + 'descartar uma seria este modulo escolhendo qual vale');
}

// ============ F11. a fatura lida e a planilha convertem reais do MESMO jeito
{
  const casos = ['1.234', '1.234,56', '0,07', '19,99', '1234.56'];
  let divergiu = 0;
  for (const bruto of casos) {
    const pelaFatura = lerFaturaDaConcessionaria({ ...BOA, fio_b: bruto, iluminacao_publica: '0,00', encargos: '0,00' });
    const pelaPlanilha = lerPlanilhaDeTarifas(`numero_uc;valor\n000000013290060;${bruto}`);
    const a = pelaFatura.ok ? pelaFatura.leitura.componentes.fio_b : null;
    const b = pelaPlanilha.linhas[0]?.centavos ?? null;
    if (a !== b) divergiu++;
  }
  chk('F11a', divergiu === 0,
      `os ${casos.length} formatos ambiguos dao o MESMO centavo pelos dois caminhos que alimentam a `
      + 'mesma coluna - comparado saida com saida, e nao contra constante escrita a mao');

  const so088 = lerFaturaDaConcessionaria({ ...BOA, fio_b: 'R$ 1.234', iluminacao_publica: '0,00', encargos: '0,00' });
  chk('F11b', so088.ok === true && so088.leitura.componentes.fio_b === 123400,
      '"R$ 1.234" e mil duzentos e trinta e quatro reais, e nao um real e 234 centavos - o `R$` e '
      + 'removido aqui e a AMBIGUIDADE continua sendo resolvida por `reaisParaCentavos`, uma vez so');
}

// ================================================== P. as portas
{
  const portal = new ColetaFalsa({}, new Date('2026-08-07T12:00:00Z'));
  portal.publicar('000000013290060', '2026-06-01', { campos: BOA });

  const d1 = await portal.coletar({ credencialRef: 'ref-1', numeroUC: '000000013290060', competencia: '2026-06-01' });
  const d2 = await portal.coletar({ credencialRef: 'ref-1', numeroUC: '000000013290060', competencia: '2026-06-01' });
  chk('P1a', d1.sha256 === d2.sha256,
      'coletar duas vezes a mesma fatura da o MESMO sha256 - sem isso a deduplicacao passa no teste '
      + 'e falha no portal, e cada rodada vira registro novo na trilha');
  chk('P1b', d1.coletado_em.toISOString() === '2026-08-07T12:00:00.000Z',
      'o relogio e injetado, entao o teste AFIRMA a data em vez de tolerar');
  chk('P1c', !JSON.stringify(d1.proveniencia).includes('ref-1'),
      'a proveniencia que vai para a trilha NAO carrega a credencial - regra 5 no caminho de escrita');

  const semFatura = await lancou(() => portal.coletar({ credencialRef: 'r', numeroUC: '000000013290099', competencia: '2026-06-01' }));
  chk('P2a', semFatura instanceof SemFaturaNaCompetencia,
      'UC sem fatura na competencia e recusa NOMEADA, e nao documento vazio - documento vazio viraria '
      + '"ausente nao e zero" tres camadas adiante, longe da causa');

  portal.credenciaisRecusadas.add('000000013290060');
  const recusada = await lancou(() => portal.coletar({ credencialRef: 'r', numeroUC: '000000013290060', competencia: '2026-06-01' }));
  chk('P2b', recusada instanceof CredencialRecusadaPeloPortal && recusada.status === 502,
      'credencial recusada pelo portal e 502 e nao 503 - "nao ha credencial" e trabalho nosso, '
      + '"a credencial nao serve" e trabalho de quem tem a conta');
  portal.credenciaisRecusadas.clear();

  portal.bloquearProximaColeta = 'HTTP 403, cookie visid_incap_*';
  const bloqueada = await lancou(() => portal.coletar({ credencialRef: 'r', numeroUC: '000000013290060', competencia: '2026-06-01' }));
  chk('P2c', bloqueada instanceof PortalBloqueouAColeta,
      'protecao de bot tem erro proprio - medido em 07/08, o portal responde 403 com `x-iinfo`, e o '
      + 'modo de falha e devolver PAGINA valida que alguem extrairia como se fosse fatura');

  // --- o caminho inteiro: coletar -> extrair -> ler
  const extrator = new LeituraFalsa();
  const doc = await portal.coletar({ credencialRef: 'r', numeroUC: '000000013290060', competencia: '2026-06-01' });
  const ex = await extrator.extrair(doc);
  chk('P3a', typeof ex.campos.fio_b === 'string' && ex.campos.fio_b.includes('R$'),
      'o extrator devolve TEXTO CRU, com `R$` e tudo - se devolvesse numero limpo, a regra de "1.234" '
      + 'viveria dentro do adaptador, fora do alcance destes testes');
  chk('P3b', ex.trechos?.fio_b === 'R$ 52,40',
      'e preserva o trecho original de cada campo, que e o que o ensaio imprime ao lado da '
      + 'interpretacao - a licao do `importar-tarifas`');
  const lida = lerFaturaDaConcessionaria(ex.campos);
  chk('P3c', lida.ok === true && lida.leitura.tarifas_concessionaria_centavos === 8815,
      'e o caminho ponta a ponta - portal, extrator, dominio - chega em R$ 88,15 sem rede nenhuma');

  extrator.omitirProximoCampo = 'iluminacao_publica';
  const ex2 = await extrator.extrair(doc);
  const lida2 = lerFaturaDaConcessionaria(ex2.campos);
  chk('P3d', lida2.ok === false && lida2.erros.some((e) => e.campo === 'iluminacao_publica'),
      'e um extrator que PERDE um campo produz recusa nomeada, nao uma fatura R$ 18,75 menor');
}

// ================================================== P4. os padroes que recusam
{
  const c = await lancou(() => COLETA_NAO_CONFIGURADA.coletar({ credencialRef: 'r', numeroUC: '1', competencia: '2026-06-01' }));
  const l = await lancou(() => LEITURA_NAO_CONFIGURADA.extrair({ conteudo: new Uint8Array(), tipo: '', sha256: '', coletado_em: new Date(0), proveniencia: {} }));
  chk('P4a', c?.status === 503 && l?.status === 503,
      'sem credencial e sem extrator, as duas portas recusam com 503 NOMEADO - o adaptador padrao e o '
      + 'que recusa, nunca um que finge, e todo o resto do faturamento segue funcionando sem portal');
}

console.log(falhas === 0 ? '\nTODAS PASSARAM' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
