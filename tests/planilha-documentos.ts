// A LEITURA da planilha de CPF/CNPJ dos clientes, sem banco.
// Uso: node --experimental-strip-types tests/planilha-documentos.ts
//
// O QUE ESTA SUITE PERSEGUE, e nao e o mesmo das outras duas planilhas.
//
// Em tarifas o modo de falha e a ESCALA ("1.234" valendo R$ 1,23). Em
// vencimentos e o dia curto. Aqui sao tres, e o primeiro e o unico dos tres
// planilhas do projeto que o BANCO recusaria no meio do lote:
//
//   COLISAO      duas linhas com o mesmo documento. `cliente_documento_unico`
//                recusa a segunda, e gravando linha a linha a recusa chega com
//                metade escrita. Medido: 45 linhas ativas para 36 nomes
//                distintos (Q-CLIENTEDUP-01)
//   DIGITO       CPF que nao fecha NAO bloqueia o cadastro (R9 e explicita), e
//                por isso e recusado aqui: gravado, ele preenche a tela e deixa
//                `documento_validado = false`, e o contrato segue sem ativar com
//                o campo parecendo resolvido
//   CHAVE        o casamento e por uuid, e as duas chaves legiveis foram medidas
//                e descartadas - `lead.codigo` e instavel (Q-CRMCODIGO-01, 76
//                merges renumeraram 39 de 41) e o nome nao e unico
//
// E o circuito fechado, que e o que amarra os dois lados: o arquivo que o
// `--modelo` escreve tem de passar pelo leitor que o `--ensaio` usa.

import {
  lerPlanilhaDeDocumentos, montarModeloDeDocumentos, MODELO_DE_DOCUMENTOS,
  type LinhaDoModeloDeDocumento,
} from '../src/dominio/planilha-documentos.ts';
import { classificar, podeAtivarContrato } from '../src/dominio/documento.ts';
import { ehUuid } from '../src/dominio/csv.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

// CPFs e CNPJs de digito correto, para nao inventar numero no meio do teste.
const CPF_1 = '52998224725';
const CPF_2 = '11144477735';
const CNPJ  = '11222333000181';
const ID_1 = '7f1c6d2e-0000-4000-8000-000000000001';
const ID_2 = '7f1c6d2e-0000-4000-8000-000000000002';
const ID_3 = '7f1c6d2e-0000-4000-8000-000000000003';

const CAB = 'cliente_id;documento\n';

// ==================================================== P1 o caminho inteiro
{
  const p = lerPlanilhaDeDocumentos(
    CAB
    + `${ID_1};529.982.247-25\n`      // com mascara, como o Excel devolve
    + `${ID_2};${CPF_2}\n`            // sem mascara
    + `${ID_3};11.222.333/0001-81\n`  // CNPJ
  );

  chk('P1a', p.erros.length === 0 && p.linhas.length === 3 && p.cabecalho,
      `tres linhas lidas e o cabecalho reconhecido (l=${p.linhas.length} e=${p.erros.length})`);
  chk('P1b', p.linhas[0]!.documento === CPF_1 && p.linhas[2]!.documento === CNPJ,
      'a mascara sai e o que fica e o que vai para a coluna - ponto, barra e traco nao sao dado');
  chk('P1c', p.linhas[0]!.documento_tipo === 'cpf' && p.linhas[2]!.documento_tipo === 'cnpj',
      'o tipo vem do comprimento, e e ele que a coluna `documento_tipo` guarda');
  chk('P1d', p.linhas[0]!.bruto === '529.982.247-25',
      'o texto ORIGINAL sobrevive para o ensaio poder mostrar o que a pessoa digitou ao lado do que sera gravado');
  chk('P1e', p.linhas[0]!.linha === 2,
      `a numeracao conta o cabecalho, para bater com o que a pessoa ve aberto no Excel (veio ${p.linhas[0]!.linha})`);
}

// ==================================================== P2 o digito que nao fecha
//
// A verificacao que da sentido a todas as outras: o proposito deste arquivo e
// destravar a R9, e documento que nao valida NAO a destrava. Recusar na leitura
// e a diferenca entre "o arquivo tem um erro" e "o contrato nao ativa e ninguem
// sabe por que".
{
  const p = lerPlanilhaDeDocumentos(CAB + `${ID_1};52998224724\n`);
  chk('P2a', p.linhas.length === 0 && p.erros.length === 1,
      'CPF com o ultimo digito trocado e RECUSADO na linha, e nao vira linha para gravar');
  chk('P2b', /NAO bloqueia o cadastro \(R9\)/.test(p.erros[0]!.motivo),
      'e a recusa diz POR QUE recusa algo que o cadastro aceitaria - senao parece rigor gratuito');

  // O par mudo: gravar o invalido produziria exatamente o estado inutil.
  const invalido = classificar('52998224724', 'coleta_local');
  chk('P2c', invalido.documento !== null && !invalido.documento_validado && !podeAtivarContrato(invalido),
      'o que seria gravado: coluna PREENCHIDA, `documento_validado` false, e a R9 continuando fechada - '
      + 'o campo parece resolvido na tela e o contrato nao ativa');

  const p2 = lerPlanilhaDeDocumentos(CAB + `${ID_1};11111111111\n`);
  chk('P2d', p2.erros.length === 1 && p2.linhas.length === 0,
      'o placeholder 111.111.111-11 passa no modulo 11 e e recusado - e o valor que alguem digita para "preencher"');

  const p3 = lerPlanilhaDeDocumentos(CAB + `${ID_1};123456\n`);
  chk('P3a', p3.erros.length === 1 && /6 caracteres uteis/.test(p3.erros[0]!.motivo),
      'documento de comprimento errado diz QUANTOS caracteres uteis tinha - "invalido" sozinho nao ajuda a achar o erro de digitacao');
}

// ==================================================== P4 a colisao
//
// O motivo de o arquivo ser conferido INTEIRO antes de qualquer escrita.
{
  const p = lerPlanilhaDeDocumentos(CAB + `${ID_1};${CPF_1}\n` + `${ID_2};529.982.247-25\n`);
  chk('P4a', p.linhas.length === 1 && p.erros.length === 1,
      'o mesmo documento em dois clientes: a primeira linha vale, a segunda e recusa - e nao ha lote pela metade');
  chk('P4b', /linha 2/.test(p.erros[0]!.motivo) && /Q-CLIENTEDUP-01/.test(p.erros[0]!.motivo),
      'a recusa nomeia a OUTRA linha e a questao - o conserto nao e obvio, e as duas leituras produzem arquivo plausivel');
  chk('P4c', p.erros[0]!.motivo.includes(CPF_1) && !p.erros[0]!.motivo.includes('529.982.247-25'),
      'e a colisao e detectada sobre o documento NORMALIZADO: "529.982.247-25" e "52998224725" sao o mesmo CPF, '
      + 'e comparar o texto cru deixaria as duas passarem para o banco recusar no meio do lote');

  const p2 = lerPlanilhaDeDocumentos(CAB + `${ID_1};${CPF_1}\n` + `${ID_1};${CPF_2}\n`);
  chk('P4d', p2.linhas.length === 1 && p2.erros.length === 1 && /ja aparece na linha 2/.test(p2.erros[0]!.motivo),
      'o mesmo cliente duas vezes com documentos diferentes tambem para - escolher um dos dois seria escolher em silencio');
}

// ==================================================== P5 a chave, e o cabecalho
//
// O criterio de cabecalho aqui e DIFERENTE do das outras duas planilhas, e a
// diferenca e deliberada: la o cabecalho se reconhece pelo VALOR da segunda
// coluna nao ser valido, e isso engole em silencio a primeira linha de dado com
// o valor digitado errado. Aqui a chave tem FORMA, entao o criterio e a forma - e
// fora da primeira linha, forma errada vira erro nomeado em vez de sumico.
{
  chk('P5a', ehUuid(ID_1) && !ehUuid('G3-0078') && !ehUuid('cliente_id'),
      'a forma do uuid e o criterio - e nem o codigo de lead nem o rotulo do cabecalho a tem');

  const p = lerPlanilhaDeDocumentos(CAB + `${ID_1};${CPF_1}\n` + `GABRIELLA;${CPF_2}\n`);
  chk('P5b', p.linhas.length === 1 && p.erros.length === 1 && p.erros[0]!.linha === 3,
      'nome no lugar do id NAO some como "cabecalho" - vira erro na linha 3, com o numero da linha');
  chk('P5c', /Q-CRMCODIGO-01/.test(p.erros[0]!.motivo),
      'e a recusa diz por que a chave nao e legivel: o codigo de lead foi MEDIDO instavel (76 merges renumeraram 39 de 41)');

  // Sem cabecalho nenhum: a primeira linha ja e dado, e tem de ser lida.
  const p2 = lerPlanilhaDeDocumentos(`${ID_1};${CPF_1}\n`);
  chk('P5d', p2.cabecalho === false && p2.linhas.length === 1,
      'arquivo sem cabecalho e lido inteiro - o criterio de forma nao consome a primeira linha de dado');

  const p3 = lerPlanilhaDeDocumentos(CAB + `${ID_1.toUpperCase()};${CPF_1}\n`);
  chk('P5e', p3.linhas.length === 1 && p3.linhas[0]!.cliente_id === ID_1,
      'uuid em maiuscula casa e sai minusculo - o Excel maiusculiza celula por conta propria e o banco compara exato');
}

// ==================================================== P6 a celula vazia
{
  const p = lerPlanilhaDeDocumentos(CAB + `${ID_1};\n`);
  chk('P6a', p.erros.length === 1 && p.linhas.length === 0,
      'celula vazia e ERRO, nunca "este cliente nao tem documento" - ausente nao e zero, aqui tambem');
  chk('P6b', /Apague a linha inteira/.test(p.erros[0]!.motivo),
      'e a recusa diz o que fazer: apagar a linha e diferente de deixar em branco, e so uma das duas e um arquivo intencional');

  const p2 = lerPlanilhaDeDocumentos(CAB + `${ID_1};${CPF_1}\n\n\n`);
  chk('P6c', p2.vazias === 3 && p2.linhas.length === 1 && p2.erros.length === 0,
      `linha em branco no fim do arquivo e contada e ignorada, nunca erro (v=${p2.vazias}) - todo Excel escreve pelo menos uma`);

  const p3 = lerPlanilhaDeDocumentos(CAB + `${ID_1} ${CPF_1}\n`);
  chk('P6d', p3.erros.length === 1 && /nao ha ";"/.test(p3.erros[0]!.motivo),
      'arquivo salvo com o separador errado e recusado dizendo qual e o separador - o Excel en-US salva com ","');
}

// ==================================================== M o modelo preenchido
{
  const cli = (id: string, nome: string, fatura: boolean, validado = false): LinhaDoModeloDeDocumento => ({
    cliente_id: id, documento_atual: validado ? CPF_1 : '', validado,
    nome, telefone: '5562999999999', ucs: '000406456101252', fatura,
  });

  // --------------------------------------------- M1 a ordem e a marca
  {
    const csv = montarModeloDeDocumentos([
      cli(ID_1, 'ZULMIRA', false),          // nao fatura -> ultimo
      cli(ID_2, 'BRUNA', true, true),       // fatura e JA validado -> depois de quem falta
      cli(ID_3, 'ANDRE', true, false),      // fatura e falta -> primeiro
    ]);
    const corpo = csv.replace(/^﻿/, '').split('\n').filter((l) => l !== '');
    const nomes = corpo.slice(1).map((l) => l.split(';')[4]);

    chk('M1a', nomes.join(',') === 'ANDRE,BRUNA,ZULMIRA',
        `quem fatura e ainda NAO destrava a R9 vem primeiro (veio ${nomes.join(',')}) - `
        + 'e o bloco continuo que a pessoa encontra ao abrir a planilha');
    chk('M1b', corpo[1]!.split(';')[2] === 'sim' && corpo[3]!.split(';')[2] === 'NAO',
        'a coluna `fatura` marca cada linha, e o NAO e maiusculo porque e o que se procura');
    chk('M1c', corpo[1]!.split(';')[3] === 'NAO' && corpo[2]!.split(';')[3] === 'sim',
        '`ja_validado` e coluna SEPARADA de `documento`: pela R8 a semente do CRM preenche o documento e nao valida nada');
    chk('M1d', corpo.length === 4,
        `ninguem e escondido: 3 clientes entram, 3 saem (veio ${corpo.length - 1})`);
  }

  // --------------------------------------------- M2 o que o Excel precisa
  {
    const csv = montarModeloDeDocumentos([{
      ...cli(ID_1, 'SILVA; FILHO "JR"', true), ucs: '000406456101252 000407359701237',
    }]);
    chk('M2a', csv.startsWith('﻿'),
        'o BOM UTF-8 abre o arquivo - sem ele o Excel pt-BR quebra o acento de "GABRIELLA"');
    chk('M2b', /"SILVA; FILHO ""JR"""/.test(csv),
        'o `;` e a aspa dentro do nome sao escapados, senao a linha ganha uma coluna e o CSV desalinha');
    // Sem `split(';')` aqui de proposito: o nome desta linha CONTEM `;` e esta
    // entre aspas, e partir por `;` daria a coluna errada - que e exatamente o
    // desalinhamento que a M2b prende.
    chk('M2c', csv.trimEnd().endsWith(';000406456101252 000407359701237'),
        'as DUAS UCs da pessoa vao na MESMA celula, a ultima: uma linha por PESSOA, porque pedir o mesmo CPF '
        + 'duas vezes fabricaria dentro do arquivo a colisao que ele existe para evitar');
  }

  // --------------------------------------------- M3 o circuito fechado
  //
  // O modelo que o `--modelo` escreve tem de passar pelo leitor que o `--ensaio`
  // usa. Um modelo que o proprio importador recusa e a pior instrucao possivel.
  {
    const csv = montarModeloDeDocumentos([cli(ID_1, 'ANDRE', true), cli(ID_2, 'BRUNA', false)]);
    const vazio = lerPlanilhaDeDocumentos(csv);
    chk('M3a', vazio.cabecalho && vazio.linhas.length === 0 && vazio.erros.length === 2,
        `o modelo em branco e recusado linha a linha, com o cabecalho reconhecido (e=${vazio.erros.length})`);

    // E como volta do Excel: a coluna 2 preenchida, o resto intacto.
    const docs = [CPF_1, CPF_2];
    const preenchido = csv.split('\n').map((l, i) => {
      if (i === 0 || l === '') return l;
      const c = l.split(';'); c[1] = docs[i - 1]!; return c.join(';');
    }).join('\n');
    const p = lerPlanilhaDeDocumentos(preenchido);
    chk('M3b', p.erros.length === 0 && p.linhas.length === 2,
        `preenchido, o modelo passa inteiro pelo leitor (l=${p.linhas.length} e=${p.erros.length})`);
    chk('M3c', p.linhas[0]!.cliente_id === ID_1 && p.linhas[0]!.documento === CPF_1,
        'o id continua na PRIMEIRA coluna e o documento na segunda - o leitor le 1 e 2 e ignora as cinco seguintes');

    // E o modelo de exemplo, o que sai sem banco, tambem.
    const ex = lerPlanilhaDeDocumentos(MODELO_DE_DOCUMENTOS);
    chk('M3d', ex.cabecalho && ex.erros.length === 0 && ex.linhas.length === 2,
        `o MODELO_DE_DOCUMENTOS passa pelo proprio leitor (l=${ex.linhas.length} e=${ex.erros.length})`);
  }
}

// ==================================================== P7 depois da migration 33
//
// O MESMO ARQUIVO, E A RESPOSTA MUDA - porque quem responde e o catalogo.
//
// Ate 20/08/2026 `cliente_documento_unico` estava no ar e documento repetido era
// escrita IMPOSSIVEL: a recusa do P4 so anunciava, antes, o que o banco faria no
// meio do lote. A migration 33 dropou esse indice e manteve `uc_numero_unico`,
// atendendo o dono da regra - "os documentos podem se repetir (...) entretanto,
// nao podem existir mais de uma UC".
//
// Medido em 21/08/2026, um dia depois: com o indice ja dropado, o `--ensaio`
// recusou 4 de 18 linhas citando o indice que nao existia mais. As 4 eram as 4
// pessoas com duas UCs - o caso exato que a migration foi criada para permitir.
//
// A repeticao nao vira SILENCIO, e este e o ponto da suite: par legitimo e CPF
// digitado na linha errada produzem o mesmo arquivo, entao o achado sai em
// `repeticoes` para uma pessoa olhar - o que ele perde e so o poder de abortar.
{
  const arquivo = CAB + `${ID_1};${CPF_1}\n` + `${ID_2};529.982.247-25\n`;

  const antes = lerPlanilhaDeDocumentos(arquivo);
  chk('P7a', antes.linhas.length === 1 && antes.erros.length === 1 && antes.repeticoes.length === 0,
      'sem opcao nenhuma o comportamento e o historico: recusa. Quem esquecer de perguntar ao catalogo '
      + 'recusa em vez de gravar, e errar para o lado de recusar nunca corrompeu banco');

  const depois = lerPlanilhaDeDocumentos(arquivo, { documentoPodeRepetir: true });
  chk('P7b', depois.erros.length === 0 && depois.linhas.length === 2,
      `com o indice dropado as DUAS linhas valem (l=${depois.linhas.length} e=${depois.erros.length}) `
      + '- e a pessoa com duas UCs tem duas linhas de cliente e um CPF so');
  chk('P7c', depois.repeticoes.length === 1 && depois.repeticoes[0]!.linha === 3
             && depois.repeticoes[0]!.linha_anterior === 2,
      'e o par continua nomeado, com as DUAS linhas - grava, mas nao em silencio');
  chk('P7d', depois.repeticoes[0]!.documento === CPF_1,
      'a repeticao e vista sobre o documento NORMALIZADO: "529.982.247-25" e "52998224725" sao o mesmo CPF, '
      + 'e comparar texto cru nao veria o par nem para recusar nem para relatar');

  // O MESMO CLIENTE duas vezes continua sendo erro, e nao tem nada com o indice:
  // duas linhas dando documentos diferentes para uma pessoa nao e regra de banco,
  // e arquivo ambiguo - escolher um dos dois seria escolher em silencio.
  const mesmoCliente = lerPlanilhaDeDocumentos(
    CAB + `${ID_1};${CPF_1}\n` + `${ID_1};${CPF_2}\n`, { documentoPodeRepetir: true });
  chk('P7e', mesmoCliente.linhas.length === 1 && mesmoCliente.erros.length === 1,
      'o mesmo cliente_id duas vezes segue recusado mesmo com repeticao liberada - a migration 33 '
      + 'falou sobre documento repetido, e nao sobre arquivo ambiguo');

  // Tres linhas do mesmo documento: `linha_anterior` aponta sempre para a
  // PRIMEIRA, e nao para a de cima. Le-se como um grupo em vez de uma corrente.
  const tres = lerPlanilhaDeDocumentos(
    CAB + `${ID_1};${CPF_1}\n` + `${ID_2};${CPF_1}\n` + `${ID_3};${CPF_1}\n`,
    { documentoPodeRepetir: true });
  chk('P7f', tres.linhas.length === 3 && tres.repeticoes.length === 2
             && tres.repeticoes.every((x) => x.linha_anterior === 2),
      'com tres iguais as duas repeticoes apontam para a mesma origem (linha 2), e nao uma para a outra');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
