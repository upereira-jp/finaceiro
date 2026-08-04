// A PLANILHA DE CPF/CNPJ DOS CLIENTES, lida. Puro: texto entra, linhas saem.
//
// DE ONDE ISTO VEM, e nao e de auditoria. Medido em 04/08/2026 contra producao,
// ao percorrer o caminho para a primeira fatura:
//
//   cliente.documento    NULL em 45 de 45 linhas ativas
//   documento_validado   false nas 29 UCs faturaveis
//
// e `contrato.ativar()` chama `podeAtivarContrato()`, que e a R9: **contrato so
// vai para `ativo` com documento VALIDADO do cliente**. Nao ha outro caminho -
// `renovar()` chama `rascunhar()` + `ativar()`, e as rotas nao expoem terceira
// porta. Entao digitar os 29 contratos hoje produz 29 rascunhos e 29 recusas
// 422, uma a uma, depois do trabalho de digitar.
//
// A `Q-PAGADOR-01` ja tinha medido o mesmo NULL em 03/08 e concluiu "nao bloqueia
// hoje, porque o caminho que funciona e Pix estatico + baixa manual, que nao
// pedem pagador". Isso vale para o BOLETO e nao vale para a FATURA: sem contrato
// ativo a triagem recusa por `sem_contrato_vigente`, que e a primeira da ordem, e
// nao existe fatura nenhuma para cobrar por Pix.
//
// POR QUE PURO E SEPARADO DO SCRIPT. Regra 8, e a mesma razao do
// `planilha-vencimentos.ts` e do `planilha-tarifas.ts`: o que decide um valor que
// vai para o banco tem de ser exercitavel sem banco, sem arquivo e sem `--valendo`.
//
// ============================================================================
// O MODO DE FALHA QUE ESTE MODULO PERSEGUE, e ele nao e o das outras duas
//
// Em tarifas o risco e ler CERTO o numero ERRADO ("1.234" valendo R$ 1,23). Em
// vencimentos o numero e pequeno e o intervalo e curto. Aqui o risco e OUTRO, e
// tem nome e medicao propria: **a colisao no meio da digitacao**.
//
// `cliente_documento_unico` e UNIQUE (tenant_id, documento) WHERE documento IS
// NOT NULL, e a `Q-CLIENTEDUP-01` mediu **45 linhas ativas para 36 nomes
// distintos**. Duas linhas da mesma pessoa recebendo o mesmo CPF violam o indice
// - e num lote gravado linha a linha isso acontece NO MEIO, com metade escrita e
// sem nada que diga quais metades. Por isso:
//
//   - o arquivo INTEIRO e conferido antes de qualquer escrita;
//   - documento repetido DENTRO do arquivo e recusa nomeada, com as duas linhas;
//   - documento que ja pertence a OUTRO cliente e recusa nomeada, com o nome de
//     quem o tem (isso o banco sabe e o arquivo nao - fica no repositorio).
//
// E o terceiro erro, que e o silencioso: **digito que nao fecha**. Ele nao
// bloqueia o cadastro (R9 e explicita: o sistema nasce sobre dado incompleto),
// entao `classificar()` grava `documento_validado = false` sem reclamar - e o
// contrato continua sem ativar, agora com um CPF na tela dando a impressao de
// que o campo foi resolvido. Aqui isso e recusa de linha: o unico proposito
// deste arquivo e destravar a R9, e documento que nao valida nao a destrava.

import { classificar, type TipoDocumento } from './documento.ts';

export type LinhaDeDocumento = {
  /** 1-based e contando a linha do cabecalho, para bater com o que a pessoa ve
   *  aberto no Excel. */
  linha: number;
  cliente_id: string;
  /** Normalizado: sem mascara, maiusculo. E o que vai para a coluna. */
  documento: string;
  documento_tipo: TipoDocumento;
  /** O texto original da celula, para o relatorio do ensaio mostrar a mascara
   *  que a pessoa digitou ao lado do que sera gravado. */
  bruto: string;
};

export type ErroDeDocumento = { linha: number; motivo: string };

export type PlanilhaDeDocumentos = {
  linhas: LinhaDeDocumento[];
  erros: ErroDeDocumento[];
  vazias: number;
  cabecalho: boolean;
};

/** O separador e `;`, como nas outras duas planilhas e em `web/src/csv.ts`. */
const SEP = ';';

const semAspas = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
};

/** A forma do uuid, e so a forma - quem existe de verdade e o banco que diz. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehUuid = (s: string): boolean => UUID.test(s.trim());

/**
 * Le o conteudo de um CSV de duas colunas: id do cliente e CPF/CNPJ.
 *
 * POR QUE A CHAVE E O `cliente_id` E NAO ALGO LEGIVEL. As duas alternativas
 * foram medidas e as duas falham:
 *
 *   `lead.codigo` do CRM   INSTAVEL. A `Q-CRMCODIGO-01` mediu 76 merges de lead
 *                          em 30/07 renumerando 39 dos 41 codigos. Casar por ele
 *                          e casar por um numero que muda sozinho
 *   o nome                 NAO E UNICO. 45 linhas ativas para 36 nomes
 *                          distintos (`Q-CLIENTEDUP-01`), e o CPF errado numa
 *                          homonima e exatamente o erro que ninguem revisa
 *
 * O uuid e feio na planilha e e a unica chave que nao mente. O modelo sai com
 * nome, telefone e as UCs ao lado justamente para a pessoa saber qual linha e
 * qual sem precisar ler o uuid.
 *
 * Colunas adicionais sao IGNORADAS, como nas outras duas planilhas: obrigar a
 * apaga-las seria pedir uma edicao a mais no arquivo que nao pode ter erro.
 */
export function lerPlanilhaDeDocumentos(conteudo: string): PlanilhaDeDocumentos {
  // BOM UTF-8: o Excel o escreve, e sem tirar aqui o primeiro `cliente_id` viria
  // com um caractere invisivel na frente e nao casaria com uuid nenhum.
  const texto = conteudo.replace(/^﻿/, '');
  const cruas = texto.split(/\r\n|\n|\r/);

  const linhas: LinhaDeDocumento[] = [];
  const erros: ErroDeDocumento[] = [];
  const clientesVistos = new Map<string, number>();
  const documentosVistos = new Map<string, number>();
  let vazias = 0;
  let cabecalho = false;

  cruas.forEach((crua, i) => {
    const numeroDaLinha = i + 1;
    if (crua.trim() === '') { vazias++; return; }

    if (!crua.includes(SEP)) {
      erros.push({
        linha: numeroDaLinha,
        motivo: 'nao ha ";" nesta linha - o arquivo precisa de duas colunas: id do cliente e CPF/CNPJ',
      });
      return;
    }

    const campos = crua.split(SEP).map(semAspas);
    const id = campos[0] ?? '';
    const valor = campos[1] ?? '';

    /*
     * O CABECALHO SE RECONHECE PELA PRIMEIRA COLUNA NAO TER FORMA DE UUID, e
     * este criterio e DIFERENTE do das outras duas planilhas de proposito.
     *
     * La o cabecalho se reconhece pela segunda coluna nao ser um valor valido, e
     * isso carrega um risco conhecido: a primeira linha de dado com o valor
     * digitado errado e engolida como "cabecalho" e some sem erro. Aquelas duas
     * convivem com o risco porque a chave delas (numero de UC) nao tem forma
     * conferivel.
     *
     * Aqui a chave TEM forma. Cabecalho e a linha cuja coluna 1 nao e uuid - e
     * fora da primeira linha isso deixa de ser cabecalho e vira erro nomeado,
     * entao nenhuma linha desaparece em silencio.
     */
    if (!ehUuid(id)) {
      if (linhas.length === 0 && erros.length === 0 && !cabecalho) { cabecalho = true; return; }
      erros.push({
        linha: numeroDaLinha,
        motivo: `"${id}" nao e um id de cliente. A primeira coluna e o uuid que o --modelo escreve - ` +
                'nome e codigo de lead nao servem de chave (Q-CLIENTEDUP-01 e Q-CRMCODIGO-01)',
      });
      return;
    }

    if (valor.trim() === '') {
      erros.push({
        linha: numeroDaLinha,
        motivo: 'a celula do CPF/CNPJ esta vazia. Apague a linha inteira se este cliente ainda nao tem ' +
                'documento - deixar em branco nao e "sem documento", e arquivo pela metade',
      });
      return;
    }

    /*
     * `coleta_local` E A ORIGEM, SEMPRE, e nao e escolha desta planilha - e o
     * que ela E. R8: documento vindo do CRM entra com `documento_validado =
     * false` mesmo com digito correto, porque semente nao e confirmacao. Uma
     * pessoa digitando a planilha ESTA confirmando; e esse ato que a R9 exige.
     */
    const d = classificar(valor, 'coleta_local');
    if (!d.digito_confere || d.documento === null || d.documento_tipo === null) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `"${valor}" nao e um CPF nem um CNPJ valido (${d.documento?.length ?? 0} caracteres uteis). ` +
                'Digito que nao fecha NAO bloqueia o cadastro (R9), e por isso e recusado aqui: ele ' +
                'gravaria `documento_validado = false` sem reclamar, e o contrato continuaria sem ativar ' +
                'com o campo parecendo preenchido',
      });
      return;
    }

    const clienteAntes = clientesVistos.get(id);
    if (clienteAntes !== undefined) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `o cliente ${id} ja aparece na linha ${clienteAntes}. Escolher um dos dois documentos ` +
                'seria escolher em silencio, e os dois sao plausiveis',
      });
      return;
    }

    /*
     * DOCUMENTO REPETIDO E A `Q-CLIENTEDUP-01` CHEGANDO, e e a razao de este
     * arquivo ser conferido inteiro antes de escrever. 45 linhas ativas para 36
     * nomes: quem preencher o CPF da mesma pessoa nas duas linhas dela viola
     * `cliente_documento_unico` - e gravando linha a linha, viola no MEIO.
     *
     * A recusa aqui nomeia as DUAS linhas, porque o conserto nao e obvio: pode
     * ser duplicata de cadastro (funde-se) ou pode ser CPF digitado na pessoa
     * errada (corrige-se), e as duas leituras produzem um arquivo plausivel.
     */
    const docAntes = documentosVistos.get(d.documento);
    if (docAntes !== undefined) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `o documento ${d.documento} ja aparece na linha ${docAntes}, em outro cliente. ` +
                '`cliente_documento_unico` recusaria a segunda escrita - e as duas linhas podem ser a ' +
                'mesma pessoa duplicada (Q-CLIENTEDUP-01) ou um documento digitado na linha errada',
      });
      return;
    }

    clientesVistos.set(id, numeroDaLinha);
    documentosVistos.set(d.documento, numeroDaLinha);
    linhas.push({
      linha: numeroDaLinha,
      cliente_id: id.toLowerCase(),
      documento: d.documento,
      documento_tipo: d.documento_tipo,
      bruto: valor,
    });
  });

  return { linhas, erros, vazias, cabecalho };
}

/** O modelo que o `--modelo` imprime quando nao ha banco a consultar. Com banco,
 *  `npm run documentos -- --modelo` sai preenchido com os clientes reais. */
export const MODELO_DE_DOCUMENTOS =
  'cliente_id;documento;fatura;nome;ucs\n' +
  '7f1c6d2e-0000-4000-8000-000000000001;529.982.247-25;sim;FULANO DE TAL;000406456101252\n' +
  '7f1c6d2e-0000-4000-8000-000000000002;11.222.333/0001-81;sim;BELTRANA LTDA;000407359701237\n';

// ============================================================================
// O MODELO PREENCHIDO
//
// A coluna `fatura` e a mesma decisao do modelo de vencimentos, pela mesma razao
// medida: o cliente cuja UNICA UC tem o rateio nao ativado no CRM nao fatura
// hoje, e o CPF dele nao e trabalho pendente. Ele continua no arquivo, marcado e
// no fim - sete das doze UCs nao ativadas estao em troca de titularidade e
// voltam, e esconde-las faria o documento ser procurado uma segunda vez la na
// frente por alguem que nao vai lembrar.
//
// A DIFERENCA para o de vencimentos e o UNIVERSO: la a linha e a UC, aqui e a
// PESSOA. Um cliente com duas UCs aparece UMA vez, e as duas UCs vao na mesma
// celula - pedir o mesmo CPF duas vezes seria fabricar a colisao que a
// `Q-CLIENTEDUP-01` descreve, dentro do arquivo que existe para evita-la.

export type LinhaDoModeloDeDocumento = {
  cliente_id: string;
  /** O documento que o cliente ja tem, ou vazio. Vem preenchido para a segunda
   *  passada ser obviamente vazia. */
  documento_atual: string;
  /** `true` quando o que ele ja tem ja destrava a R9. Marcado a parte de
   *  `documento_atual` porque semente do CRM com digito certo preenche a celula
   *  e NAO destrava nada (R8). */
  validado: boolean;
  nome: string;
  telefone: string;
  /** As UCs da pessoa, ja juntas. E o que permite reconhecer quem e a linha sem
   *  ler o uuid. */
  ucs: string;
  /** Tem ao menos uma UC faturavel hoje - mesmo predicado da triagem. */
  fatura: boolean;
};

/** O `;` do CSV do Excel pt-BR, e o mesmo escape do `web/src/csv.ts`. */
const celula = (v: string): string =>
  /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * O CSV do modelo, montado. PURO de proposito (regra 8): o que decide a ORDEM e
 * a MARCA das linhas e o que a pessoa vai ler.
 *
 * A ordem e: quem fatura primeiro; dentro disso, quem AINDA NAO destrava a R9
 * primeiro. A segunda metade e o ponto - quem abre a planilha comeca de cima e
 * encontra exatamente as linhas que faltam, num bloco continuo.
 */
export function montarModeloDeDocumentos(linhas: LinhaDoModeloDeDocumento[]): string {
  const ordenadas = [...linhas].sort((a, b) =>
    (a.fatura === b.fatura ? 0 : a.fatura ? -1 : 1) ||
    (a.validado === b.validado ? 0 : a.validado ? 1 : -1) ||
    a.nome.localeCompare(b.nome, 'pt-BR'));

  // BOM UTF-8 primeiro: sem ele o Excel pt-BR abre "GABRIELLA" com acento quebrado.
  let csv = '﻿' + 'cliente_id;documento;fatura;ja_validado;nome;telefone;ucs\n';
  for (const l of ordenadas) {
    csv += [
      celula(l.cliente_id), celula(l.documento_atual), l.fatura ? 'sim' : 'NAO',
      l.validado ? 'sim' : 'NAO', celula(l.nome), celula(l.telefone), celula(l.ucs),
    ].join(';') + '\n';
  }
  return csv;
}
