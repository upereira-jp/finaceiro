// Cadastro dos originadores, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run --silent originadores -- --modelo > originadores.json
//        o `--silent` NAO e enfeite: sem ele o npm escreve o proprio cabecalho
//        no stdout e o arquivo sai com JSON invalido na primeira linha.
//   npm run originadores -- --ensaio  --auth-user <uuid> --arquivo originadores.json
//   npm run originadores -- --valendo --auth-user <uuid> --arquivo originadores.json
//
// POR QUE A LISTA VEM DE ARQUIVO, e nao esta escrita aqui dentro.
//
// O `cadastrar-usinas.ts` traz as quatro usinas no corpo do arquivo porque elas
// sao QUATRO CODIGOS lidos da gestao do CRM e conferidos pelo dono. Originador e
// outra coisa: `documento` e NOT NULL e e CPF ou CNPJ de pessoa real, e `tipo` e
// classificacao COMERCIAL - qual dos cinco a pessoa e decide quanto ela recebe.
// Nada disso e derivavel de nada que o sistema tenha.
//
// MEDIDO EM 29/07 contra o CRM: `financeiro.parceiros` tem 9 linhas e expoe
// `partner_id, nome, email, status, aprovado_em, revogado_em, lead_origem_id,
// lead_origem_codigo, created_at`. Nao ha documento em coluna nenhuma, 2 das 9
// tem nome e 4 tem e-mail. O CRM NAO e fonte deste cadastro, e a regra 4 impede
// consertar isso de la.
//
// POR QUE SCRIPT, e nao INSERT no psql: `repos/originador.criar()` chama
// `exigir('escrever_cadastro')`, e a escrita passa pela policy WITH CHECK e pelo
// gatilho de auditoria. Um INSERT direto pularia a matriz de papeis e a regra 9,
// que manda gravar quem, quando, antes e depois.
//
// A GUARDA QUE ESTE SCRIPT ACRESCENTA AO REPOSITORIO. `classificar()` NAO recusa
// documento com digito errado - devolve `documento_validado: false` e grava.
// Isso e certo para `cliente`, onde a R9 fecha a porta no `podeAtivarContrato`.
// Para originador nao ha porta equivalente: um CPF com um digito trocado entra,
// fica ativo, e a comissao dele sai calculada para um documento que nao existe.
// Entao aqui o lote inteiro e conferido ANTES de qualquer escrita, e um digito
// que nao fecha aborta tudo, nomeando a linha.

import { readFileSync } from 'node:fs';
import { iniciar, encerrarApp } from '../src/app.ts';
import { criar, porDocumento } from '../src/repos/originador.ts';
import { classificar } from '../src/dominio/documento.ts';
import type { NovoOriginador } from '../src/repos/originador.ts';

/** Os cinco do enum `originador_tipo`. Cada um tem alíquota propria em
 *  `regra_comissao` (PRD §5.4), e o tipo CONGELA no fechamento do contrato
 *  (R20-b) - trocar o cadastro depois nao reprecifica contrato nenhum. */
const TIPOS = [
  'vendedor_g3', 'terceirizado', 'parceiro_indicador',
  'parceiro_captador', 'parceiro_captador_senior',
] as const;

const NATUREZAS = ['pf', 'pj'] as const;
const CHAVES_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] as const;
const TIPOS_CONTA = ['corrente', 'poupanca'] as const;

const MODELO = [
  {
    nome: '<nome completo, como no documento>',
    natureza: 'pf',
    tipo: 'parceiro_captador',
    documento: '<CPF ou CNPJ - com ou sem pontuacao>',
    email: null,
    telefone: null,
    crm_partner_id: null,
    chave_pix: null,
    tipo_chave_pix: null,
    banco: null,
    agencia: null,
    conta: null,
    tipo_conta: null,
  },
];

type Entrada = {
  nome?: unknown; natureza?: unknown; tipo?: unknown; documento?: unknown;
  email?: unknown; telefone?: unknown; crm_partner_id?: unknown;
  chave_pix?: unknown; tipo_chave_pix?: unknown;
  banco?: unknown; agencia?: unknown; conta?: unknown; tipo_conta?: unknown;
};

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
};

/**
 * Confere o lote INTEIRO antes de escrever qualquer coisa. Devolve a lista de
 * problemas, cada um nomeando a posicao no arquivo - um lote de dez com a linha
 * 7 errada precisa dizer "linha 7", nao "documento invalido".
 */
function conferir(entradas: Entrada[]): { erros: string[]; prontos: NovoOriginador[] } {
  const erros: string[] = [];
  const prontos: NovoOriginador[] = [];
  const documentosVistos = new Map<string, number>();

  entradas.forEach((e, i) => {
    const onde = `linha ${i + 1}`;
    const nome = texto(e.nome);
    const natureza = texto(e.natureza);
    const tipo = texto(e.tipo);
    const bruto = texto(e.documento);

    if (!nome) erros.push(`${onde}: "nome" e obrigatorio.`);
    if (!natureza || !NATUREZAS.includes(natureza as any)) {
      erros.push(`${onde}: "natureza" deve ser ${NATUREZAS.join(' ou ')} (veio ${JSON.stringify(e.natureza)}).`);
    }
    if (!tipo || !TIPOS.includes(tipo as any)) {
      erros.push(`${onde}: "tipo" deve ser um de ${TIPOS.join(', ')} (veio ${JSON.stringify(e.tipo)}).`);
    }

    if (!bruto) {
      erros.push(`${onde}: "documento" e obrigatorio - a coluna e NOT NULL e nao ha default.`);
    } else {
      const d = classificar(bruto, 'coleta_local');
      if (!d.documento) {
        erros.push(`${onde}: "documento" ficou vazio depois de normalizar (${JSON.stringify(bruto)}).`);
      } else if (!d.digito_confere) {
        // A guarda do cabecalho: o repositorio gravaria isto com
        // documento_validado=false, e ninguem olharia de novo.
        erros.push(`${onde}: o digito verificador de ${d.documento} NAO fecha (${d.documento_tipo ?? 'tipo indefinido'}). ` +
                   'Conferir o documento - nao ha caminho que aceite este valor.');
      } else {
        const antes = documentosVistos.get(d.documento);
        if (antes !== undefined) {
          erros.push(`${onde}: documento ${d.documento} repetido - ja aparece na linha ${antes}. ` +
                     'O indice (tenant_id, documento) e unico CHEIO.');
        } else {
          documentosVistos.set(d.documento, i + 1);
        }
      }
    }

    // Os dois enums opcionais de repasse. Errados, o banco recusaria a linha no
    // meio do lote - conferir aqui e a diferenca entre um erro nomeado e um
    // lote que para na oitava.
    const chave = texto(e.tipo_chave_pix);
    if (chave && !CHAVES_PIX.includes(chave as any)) {
      erros.push(`${onde}: "tipo_chave_pix" deve ser um de ${CHAVES_PIX.join(', ')} (veio ${JSON.stringify(e.tipo_chave_pix)}).`);
    }
    const conta = texto(e.tipo_conta);
    if (conta && !TIPOS_CONTA.includes(conta as any)) {
      erros.push(`${onde}: "tipo_conta" deve ser ${TIPOS_CONTA.join(' ou ')} (veio ${JSON.stringify(e.tipo_conta)}).`);
    }

    // Coerencia entre natureza e tipo do documento: nao e constraint do banco,
    // e e o erro de digitacao mais provavel num lote de pessoas e empresas.
    if (bruto && natureza) {
      const t = classificar(bruto, 'coleta_local').documento_tipo;
      if (t === 'cpf' && natureza === 'pj') erros.push(`${onde}: natureza "pj" com CPF.`);
      if (t === 'cnpj' && natureza === 'pf') erros.push(`${onde}: natureza "pf" com CNPJ.`);
    }

    prontos.push({
      nome: nome ?? '',
      natureza: natureza as NovoOriginador['natureza'],
      tipo: tipo as NovoOriginador['tipo'],
      documento_bruto: bruto ?? '',
      documento_origem: 'coleta_local',
      crm_partner_id: texto(e.crm_partner_id),
      email: texto(e.email),
      telefone: texto(e.telefone),
      chave_pix: texto(e.chave_pix),
      tipo_chave_pix: texto(e.tipo_chave_pix) as NovoOriginador['tipo_chave_pix'],
      banco: texto(e.banco),
      agencia: texto(e.agencia),
      conta: texto(e.conta),
      tipo_conta: texto(e.tipo_conta) as NovoOriginador['tipo_conta'],
    });
  });

  return { erros, prontos };
}

async function main(): Promise<void> {
  if (tem('modelo')) {
    console.log(JSON.stringify(MODELO, null, 2));
    return;
  }

  const ensaio = tem('ensaio'), valendo = tem('valendo');
  if (ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    process.exit(2);
  }
  const authUserId = arg('auth-user');
  if (!authUserId) { console.error('ERRO: --auth-user <uuid> e obrigatorio.'); process.exit(2); }
  const caminho = arg('arquivo');
  if (!caminho) {
    console.error('ERRO: --arquivo <caminho.json> e obrigatorio. `--modelo` imprime o formato.');
    process.exit(2);
  }
  const tenantProposto = arg('tenant');

  let entradas: Entrada[];
  try {
    const cru = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!Array.isArray(cru)) throw new Error('o arquivo precisa ser uma LISTA de objetos.');
    entradas = cru;
  } catch (e) {
    console.error(`ERRO ao ler ${caminho}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  if (entradas.length === 0) { console.error('ERRO: a lista esta vazia.'); process.exit(2); }

  // CONFERENCIA ANTES DE QUALQUER ESCRITA. Um lote meio gravado exigiria saber
  // quais entraram, e o banco nao guarda o arquivo.
  const { erros, prontos } = conferir(entradas);
  if (erros.length > 0) {
    console.error(`\n== ${erros.length} problema(s) no arquivo. NADA foi gravado. ==\n`);
    for (const e of erros) console.error(`  ${e}`);
    console.error('');
    process.exit(1);
  }
  console.log(`\n== ${prontos.length} entrada(s) conferida(s): documento com digito valido, tipo e natureza coerentes ==`);
  console.log(`== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`${sessao.nome} <${sessao.email}>, papel=${sessao.tenants.map((t) => t.papel).join(',')}\n`);

  const trabalho = async () => {
    const feitos: string[] = [];
    for (const o of prontos) {
      // Idempotente por documento, como o de usinas e por codigo: reexecutar
      // depois de uma falha parcial nao duplica e nao exige lembrar quem entrou.
      const existente = await porDocumento(o.documento_bruto);
      if (existente) {
        console.log(`  ${o.nome.padEnd(32)} ja existe (tipo=${existente.tipo}, doc=${existente.documento})`);
        continue;
      }
      const novo = await criar(o);
      console.log(`  ${o.nome.padEnd(32)} criado  id=${novo.id}  tipo=${novo.tipo}  doc=${novo.documento}`);
      feitos.push(o.nome);
    }
    return feitos;
  };

  let feitos: string[] = [];
  try {
    feitos = await a.withTenant(sessao, tenantProposto, async () => {
      const f = await trabalho();
      if (ensaio) throw new RollbackDoEnsaio(f);
      return f;
    }) as string[];
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) feitos = e.valor as string[];
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${feitos.length} teriam sido criados. Nada foi gravado. ==`
    : `\n== COMMIT. ${feitos.length} originador(es) criado(s). ==`);

  if (!ensaio && feitos.length > 0) {
    console.log('\n   O tipo CONGELA no contrato (R20-b): a partir daqui, todo contrato');
    console.log('   fechado guarda o tipo de HOJE, e promover a pessoa depois nao');
    console.log('   reprecifica o que ja foi fechado. Ver Q-ORIGINADOR-01.');
  }
  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
