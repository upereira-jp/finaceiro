// A PLANILHA DE ENDERECO DO PAGADOR, lida. Puro: texto entra, linhas saem.
//
// DE ONDE ISTO VEM, e nao e de auditoria. Medido em 05/08/2026 percorrendo a
// cadeia do BOLETO - que e outra cadeia que a da fatura, e foi por isso que
// ninguem tinha listado este insumo:
//
//   endereco_logradouro   NULL em 29 de 29 UCs faturaveis
//   endereco_municipio    NULL em 29 de 29
//   endereco_uf           NULL em 29 de 29
//   endereco_cep          NULL em 29 de 29
//   views do CRM com endereco   ZERO das 10 (conferido no catalogo do schema)
//
// `src/repos/boleto.ts` monta o pagador com os seis campos de endereco da UC, e
// eles saem vazios. E a MESMA forma da `Q-PAGADOR-01` na metade do documento: o
// dado nao esta no CRM e nao esta em nos, entao ele e coleta da operacao ou nao
// existe.
//
// O QUE ISTO NAO BLOQUEIA, e a distincao importa para nao inflar a fila: **nem a
// fatura, nem o Pix**. A triagem nao tem motivo de recusa por endereco e o BR
// Code do Pix estatico nao carrega endereco de pagador. Isto bloqueia o BOLETO,
// e so ele - por isso o modelo sai marcado e ninguem precisa preencher 41.
//
// O QUE A SICOOB PEDE, MEDIDO EM 05/08/2026 na documentacao publica da Cobranca
// Bancaria v3. A versao anterior deste comentario dizia que isto NAO estava
// medido e que exigir os seis era "a escolha conservadora". Estava medido errado
// por omissao - a documentacao e publica e ninguem tinha olhado. O objeto
// `pagador` da inclusao de boleto e:
//
//   numeroCpfCnpj   so digitos
//   nome
//   endereco        UMA STRING - "Rua 87 Quadra 1 Lote 1 casa 1"
//   bairro
//   cidade
//   cep             OITO DIGITOS, SEM MASCARA - "72320000"
//   uf              DUAS LETRAS - "DF"
//   email
//
// TRES CONSEQUENCIAS, e a primeira e a que muda este arquivo:
//
// 1. `endereco` e UM campo la e sao TRES aqui (`logradouro`, `numero`,
//    `complemento`). Nao ha campo de numero separado na Cobranca v3 - o numero
//    vai dentro da string. Entao exigir logradouro E numero continua certo, e
//    pela razao oposta a que estava escrita: nao e conservadorismo, e que os
//    dois ALIMENTAM a mesma string, e um endereco sem numero chega ao boleto
//    como um endereco incompleto de verdade. Quem concatena e o adaptador.
// 2. `cep` sem mascara e `uf` de duas letras batem EXATAMENTE com o que este
//    modulo ja normaliza. A coincidencia nao e sorte: as duas sao a forma
//    canonica do dado, e foi por isso que a mascara sai aqui.
// 3. `municipio` aqui e `cidade` la. E renome de adaptador, nao de coluna - o
//    GLOSSARIO manda o dominio em portugues e `municipio` e o termo do projeto.
//
// O QUE CONTINUA SEM MEDICAO: quais dos oito a API RECUSA por ausencia. A
// documentacao publica traz o exemplo completo e nao marca obrigatoriedade campo
// a campo, e sem credencial de sandbox (`Q-SICOOB-01`) nao da para provocar a
// recusa. Exigir os seis segue sendo a posicao, agora por um motivo medido.
//
// POR QUE PURO E SEPARADO DO SCRIPT. Regra 8, como nas outras quatro planilhas.
//
// ============================================================================
// O MODO DE FALHA QUE ESTE MODULO PERSEGUE
//
// Em tarifas e a ESCALA; em vencimentos, o dia curto; em documentos, a COLISAO;
// em contratos, a celula que muda quem recebe dinheiro. Aqui e o **preenchido
// que nao vale**: endereco e o unico insumo do projeto em que a celula errada
// nao tem consequencia nenhuma DESTE lado - nada valida, nada recusa, nada
// calcula - e a recusa vem do outro lado, da Sicoob, traduzida em 502, num ponto
// onde a mensagem util ja se perdeu.
//
// Entao o que da para conferir aqui e conferido aqui:
//
//   UF      lista FECHADA de 27. "GO" e "GOI" nao sao a mesma coisa, e o
//           segundo passaria por qualquer verificacao de tamanho generica
//   CEP     oito digitos depois de tirar a mascara, e "00000000" e recusado -
//           e ausencia disfarcada de preenchimento, que e pior que a ausencia
//   VAZIO   celula vazia e erro, nunca "sem endereco". Ausente nao e zero, e
//           aqui isso e literal: um pagador sem bairro nao e um pagador de
//           bairro vazio

/** Os 27, e a lista e fechada de proposito - nao ha "UF de duas letras". */
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type UF = typeof UFS[number];

const UF_VALIDA = new Set<string>(UFS);

export const ehUf = (s: string): s is UF => UF_VALIDA.has(s.trim().toUpperCase());

export type EnderecoDoPagador = {
  logradouro: string;
  numero: string;
  /** O UNICO campo opcional dos sete. Vazio vira `null`, nao string vazia:
   *  a coluna e nullable e `''` seria um complemento que existe e e branco. */
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: UF;
  /** So digitos, sem mascara - como `documento`. A mascara e apresentacao. */
  cep: string;
};

export type LinhaDeEndereco = EnderecoDoPagador & {
  /** 1-based e contando a linha do cabecalho, para bater com o Excel. */
  linha: number;
  numero_uc: string;
  /** O texto original do CEP, para o ensaio mostrar a mascara ao lado do que
   *  sera gravado - o mesmo recurso do importador de tarifas. */
  bruto: { cep: string };
};

export type ErroDeEndereco = { linha: number; motivo: string };

export type PlanilhaDeEnderecos = {
  linhas: LinhaDeEndereco[];
  erros: ErroDeEndereco[];
  vazias: number;
  cabecalho: boolean;
};

/** O separador e `;`, como nas outras quatro planilhas e em `web/src/csv.ts`. */
const SEP = ';';

const semAspas = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
};

/**
 * Le a celula do CEP e devolve os oito digitos.
 *
 * A mascara sai, como em `classificar` para CPF/CNPJ: "74000-000" e "74000000"
 * sao o mesmo CEP, e guardar a mascara faria a mesma cidade ter dois valores
 * conforme quem digitou.
 *
 * `00000000` E RECUSADO. Ele passa em qualquer verificacao de tamanho e nao e um
 * CEP - e o preenchimento que finge, que e pior que a celula vazia: a vazia o
 * relatorio acusa, e esta some no meio de 29 linhas certas.
 */
export function lerCep(bruto: string): string {
  const t = bruto.trim();
  if (t === '') throw new Error('a celula do CEP esta vazia. Ausente nao e "00000000"');

  const digitos = t.replace(/[.\-\s]/g, '');
  if (!/^\d{8}$/.test(digitos)) {
    throw new Error(
      `"${bruto}" nao e um CEP - sao oito digitos (${digitos.replace(/\D/g, '').length} uteis). ` +
      'Mascara pode: "74000-000" e "74000000" sao o mesmo');
  }
  if (digitos === '00000000') {
    throw new Error('"00000000" nao e um CEP. Ele passa em qualquer verificacao de tamanho e e ' +
                    'ausencia disfarcada de preenchimento - a celula vazia ao menos aparece no relatorio');
  }
  return digitos;
}

/**
 * Le a celula da UF contra a lista FECHADA de 27.
 *
 * Uma verificacao de "duas letras" aceitaria "XX" e recusaria nada de util;
 * uma de tamanho aceitaria "GOI". A lista e o unico criterio que separa os dois.
 */
export function lerUf(bruto: string): UF {
  const t = bruto.trim().toUpperCase();
  if (t === '') throw new Error('a celula da UF esta vazia');
  if (!ehUf(t)) {
    throw new Error(`"${bruto}" nao e uma UF. Sao 27, e a sigla tem duas letras - "GO", nao "GOI" nem "Goias"`);
  }
  return t as UF;
}

/**
 * Le o conteudo de um CSV de oito colunas:
 *
 *   numero_uc ; logradouro ; numero ; complemento ; bairro ; municipio ; uf ; cep
 *
 * A CHAVE E O `numero_uc`, pelo mesmo argumento das planilhas de vencimento,
 * tarifa e contrato: e o identificador que a operacao tem na mao, aparece na
 * fatura de energia, e `uc_numero_unico` e indice unico CHEIO - navegar por ele
 * nao esbarra na regra 11.
 *
 * O ENDERECO E DA UC E NAO DO CLIENTE, e nao e escolha deste modulo: as seis
 * colunas moram em `unidade_consumidora` desde a migration 1, e o boleto as le
 * de la (`src/repos/boleto.ts`). Faz sentido - o endereco que interessa a
 * cobranca e o do ponto de consumo, e um cliente com duas UCs tem dois.
 *
 * Colunas adicionais sao IGNORADAS, como nas outras quatro.
 */
export function lerPlanilhaDeEnderecos(conteudo: string): PlanilhaDeEnderecos {
  // BOM UTF-8: o Excel o escreve, e sem tirar aqui o primeiro `numero_uc` viria
  // com um caractere invisivel na frente e nao casaria com UC nenhuma.
  const texto = conteudo.replace(/^﻿/, '');
  const cruas = texto.split(/\r\n|\n|\r/);

  const linhas: LinhaDeEndereco[] = [];
  const erros: ErroDeEndereco[] = [];
  const vistas = new Map<string, number>();
  let vazias = 0;
  let cabecalho = false;

  cruas.forEach((crua, i) => {
    const numeroDaLinha = i + 1;
    if (crua.trim() === '') { vazias++; return; }

    if (!crua.includes(SEP)) {
      erros.push({
        linha: numeroDaLinha,
        motivo: 'nao ha ";" nesta linha - o arquivo precisa de oito colunas: numero da UC, ' +
                'logradouro, numero, complemento, bairro, municipio, UF e CEP',
      });
      return;
    }

    const campos = crua.split(SEP).map(semAspas);
    const uc = campos[0] ?? '';
    const logradouro = campos[1] ?? '';
    const numero = campos[2] ?? '';
    const complemento = campos[3] ?? '';
    const bairro = campos[4] ?? '';
    const municipio = campos[5] ?? '';
    const ufBruta = campos[6] ?? '';
    const cepBruto = campos[7] ?? '';

    /*
     * O CABECALHO PRECISA FALHAR NAS DUAS COLUNAS CONFERIVEIS - UF e CEP -, e so
     * na PRIMEIRA linha util. E o mesmo criterio do `planilha-contratos.ts`, e
     * pela mesma razao: reconhecer por UMA coluna faz a primeira linha de dado
     * com aquela celula errada SUMIR sem erro.
     *
     * Aqui as duas colunas conferiveis sao as duas ULTIMAS, o que e uma
     * propriedade util por acidente: um cabecalho de verdade falha nas duas, e
     * uma linha de dado com o CEP digitado errado ainda tem UF valida - entao
     * ela vira erro nomeado, com o numero da linha, em vez de desaparecer.
     */
    if (linhas.length === 0 && erros.length === 0 && !cabecalho) {
      const ufFalha = !ehUf(ufBruta);
      const cepFalha = (() => { try { lerCep(cepBruto); return false; } catch { return true; } })();
      if (ufFalha && cepFalha) { cabecalho = true; return; }
    }

    if (!uc) {
      erros.push({ linha: numeroDaLinha, motivo: 'o numero da UC esta vazio' });
      return;
    }

    /*
     * OS CINCO OBRIGATORIOS DE TEXTO. Celula vazia e erro, nunca "sem bairro" -
     * e a regra que vale para as cinco planilhas do projeto: ausente nao e zero.
     *
     * `complemento` fica de fora porque ele e genuinamente opcional: a maioria
     * dos enderecos nao tem, e exigi-lo produziria 29 celulas com "-" dentro,
     * que e ruido que ninguem le e que chegaria ao boleto impresso.
     */
    const faltando = ([
      ['logradouro', logradouro], ['numero', numero],
      ['bairro', bairro], ['municipio', municipio],
    ] as const).filter(([, v]) => v.trim() === '').map(([n]) => n);

    if (faltando.length > 0) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc}: ${faltando.join(', ')} ${faltando.length === 1 ? 'esta vazio' : 'estao vazios'}. ` +
                'Celula vazia nao e "sem endereco" - e arquivo pela metade, e o boleto sai com o ' +
                'campo em branco sem que nada deste lado recuse',
      });
      return;
    }

    let uf: UF;
    try {
      uf = lerUf(ufBruta);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }

    let cep: string;
    try {
      cep = lerCep(cepBruto);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }

    const antes = vistas.get(uc);
    if (antes !== undefined) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc} repetida - ja aparece na linha ${antes}. Escolher um dos dois enderecos ` +
                'seria escolher em silencio, e os dois sao plausiveis',
      });
      return;
    }

    vistas.set(uc, numeroDaLinha);
    linhas.push({
      linha: numeroDaLinha,
      numero_uc: uc,
      logradouro: logradouro.trim(),
      numero: numero.trim(),
      complemento: complemento.trim() === '' ? null : complemento.trim(),
      bairro: bairro.trim(),
      municipio: municipio.trim(),
      uf,
      cep,
      bruto: { cep: cepBruto },
    });
  });

  return { linhas, erros, vazias, cabecalho };
}

/** CEP em mascara, so para relatorio e para o boleto impresso. Nunca de volta
 *  para a coluna - o que se guarda sao os oito digitos. */
export const cepComMascara = (cep: string): string =>
  /^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;

/** O modelo que o `--modelo` imprime quando nao ha banco a consultar. Com banco,
 *  `npm run enderecos -- --modelo` sai preenchido com as UCs reais. */
export const MODELO_DE_ENDERECOS =
  'numero_uc;logradouro;numero;complemento;bairro;municipio;uf;cep;fatura;cliente\n' +
  '000406456101252;Rua das Flores;120;Apto 302;Setor Bueno;Goiania;GO;74210-030;sim;FULANO DE TAL\n' +
  '000407359701237;Avenida T-9;S/N;;Jardim America;Goiania;GO;74255-220;sim;BELTRANA DA SILVA\n';

// ============================================================================
// O MODELO PREENCHIDO
//
// A coluna `fatura` e a mesma decisao dos modelos de vencimento, documento e
// contrato, pela mesma razao medida: a UC cujo rateio nao esta ativado no CRM
// nao fatura hoje, e o endereco dela nao e trabalho pendente. Ela continua no
// arquivo, marcada e no fim.
//
// E ha uma segunda marca que so existe aqui: **`ja_tem`**. Endereco e o unico
// destes insumos que pode estar PARCIALMENTE preenchido - cinco campos e um
// vazio -, e uma UC assim nao e "pronta" nem "vazia". O modelo mostra o que ja
// existe em cada celula, entao a segunda passada e obviamente uma correcao e
// nao uma redigitacao.

export type LinhaDoModeloDeEndereco = {
  numero_uc: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  cliente: string;
  usina: string;
  /** Faturavel hoje: o mesmo predicado da triagem e da prontidao. */
  fatura: boolean;
  /** Os seis obrigatorios ja preenchidos - a linha nao e trabalho. */
  completo: boolean;
};

/** O `;` do CSV do Excel pt-BR, e o mesmo escape do `web/src/csv.ts`. */
const celula = (v: string): string =>
  /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * O CSV do modelo, montado. PURO de proposito (regra 8).
 *
 * A ordem e: incompleto primeiro, faturavel primeiro, depois usina e UC. Quem
 * abre a planilha comeca de cima e encontra exatamente o que falta, num bloco
 * continuo que acaba antes do que ja esta pronto.
 */
export function montarModeloDeEnderecos(linhas: LinhaDoModeloDeEndereco[]): string {
  const ordenadas = [...linhas].sort((a, b) =>
    (a.completo === b.completo ? 0 : a.completo ? 1 : -1) ||
    (a.fatura === b.fatura ? 0 : a.fatura ? -1 : 1) ||
    a.usina.localeCompare(b.usina) ||
    a.numero_uc.localeCompare(b.numero_uc));

  // BOM UTF-8 primeiro: sem ele o Excel pt-BR abre "GOIANIA" com acento quebrado.
  let csv = '﻿' +
    'numero_uc;logradouro;numero;complemento;bairro;municipio;uf;cep;fatura;cliente;usina\n';
  for (const l of ordenadas) {
    csv += [
      celula(l.numero_uc), celula(l.logradouro), celula(l.numero), celula(l.complemento),
      celula(l.bairro), celula(l.municipio), celula(l.uf), celula(l.cep),
      l.fatura ? 'sim' : 'NAO', celula(l.cliente), celula(l.usina),
    ].join(';') + '\n';
  }
  return csv;
}
