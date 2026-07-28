// Repositorio de dono de usina - para quem vai o repasse, o maior fluxo de
// dinheiro do sistema (70% do consumo, PRD 5.3).
//
// POR QUE ELE FALTAVA ATE AGORA e por que entra junto com a F3: a entrega
// nomeada "cadastros" da F1 estava em 6 repositorios para 11 modelos, e este era
// um dos que faltavam. Nao ter faltado por acaso: sem split, ninguem precisava
// dele. Com o split existindo, a R12 passa a ser bloqueio real - "dono_usina_id
// nulo nao bloqueia o cadastro da usina, mas BLOQUEIA a execucao de repasse" -,
// e hoje o campo e nulo em 3 de 3 usinas (AUD-08).
//
// A CHAVE PIX MORA AQUI, e por isso a tabela entrou na lista de auditoria da
// migration 10. Trocar a chave PIX do dono de uma usina e mudar para onde o
// dinheiro sai; a regra 9 quer quem, quando, o que, antes e depois, e o gatilho
// grava sem depender de ninguem lembrar.
//
// DADO BANCARIO NAO E SEGREDO DA REGRA 5. A regra fala de credencial de
// integracao - certificado, client_id, token. Conta e chave PIX sao dado de
// negocio: aparecem no comprovante, o beneficiario as informa por escrito, e
// cifra-las impediria a conferencia que a operacao faz antes de pagar.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { classificar, type OrigemDocumento } from '../dominio/documento.ts';
import type {
  natureza_pessoa as NaturezaPessoa, tipo_conta_bancaria as TipoConta,
  tipo_chave_pix as TipoChavePix,
} from '../generated/prisma/enums.ts';

export type NovoDonoDeUsina = {
  nome: string;
  natureza: NaturezaPessoa;
  /** Obrigatorio: a coluna e NOT NULL, como em originador. */
  documento_bruto: string;
  documento_origem?: OrigemDocumento;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: TipoConta | null;
  chave_pix?: string | null;
  tipo_chave_pix?: TipoChavePix | null;
  telefone?: string | null;
  email?: string | null;
};

export type EdicaoDonoDeUsina = Partial<NovoDonoDeUsina>;

export class DocumentoDeDonoJaExiste extends Error {
  readonly status = 409;
  constructor(doc: string) {
    super(`Ja existe dono de usina com o documento ${doc} neste tenant.`);
    this.name = 'DocumentoDeDonoJaExiste';
  }
}

export class DonoSemFormaDeReceber extends Error {
  readonly status = 422;
  constructor() {
    super(
      'O dono da usina precisa de chave PIX ou de conta bancaria completa (banco, agencia e ' +
      'conta). Sem uma das duas, o repasse e calculado e nao tem para onde ir - e o passivo ' +
      'aparece so quando alguem tenta pagar.'
    );
    this.name = 'DonoSemFormaDeReceber';
  }
}

const limpar = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

/**
 * Ou chave PIX, ou conta completa. Conferido no CADASTRO e nao no pagamento,
 * porque no pagamento e tarde: o repasse ja foi calculado, ja entrou no split, e
 * a invariante do centavo ja fechou sobre um beneficiario que ninguem consegue
 * pagar. Cadastro e o momento em que a correcao e barata.
 */
function conferirFormaDeReceber(e: { chave_pix?: string | null; banco?: string | null; agencia?: string | null; conta?: string | null }) {
  const pix = limpar(e.chave_pix);
  const contaCompleta = limpar(e.banco) && limpar(e.agencia) && limpar(e.conta);
  if (!pix && !contaCompleta) throw new DonoSemFormaDeReceber();
}

export async function criar(e: NovoDonoDeUsina) {
  await exigir('escrever_cadastro');
  const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');
  if (d.documento === null || d.documento_tipo === null) {
    throw Object.assign(new TypeError('Dono de usina exige documento: a coluna e NOT NULL no schema.'), { status: 422 });
  }
  conferirFormaDeReceber(e);

  try {
    return await dbt().dono_usina.create({
      data: {
        tenant_id: tenantCorrente(),
        nome: e.nome.trim(),
        natureza: e.natureza,
        documento: d.documento,
        documento_tipo: d.documento_tipo,
        documento_validado: d.documento_validado,   // R8: semente do CRM entra FALSE
        banco: limpar(e.banco),
        agencia: limpar(e.agencia),
        conta: limpar(e.conta),
        tipo_conta: e.tipo_conta ?? null,
        chave_pix: limpar(e.chave_pix),
        tipo_chave_pix: e.tipo_chave_pix ?? null,
        telefone: limpar(e.telefone),
        email: limpar(e.email)?.toLowerCase() ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') throw new DocumentoDeDonoJaExiste(d.documento);
    throw err;
  }
}

export async function editar(id: string, e: EdicaoDonoDeUsina) {
  await exigir('escrever_cadastro');
  const atual = await porId(id);
  if (!atual) throw Object.assign(new Error('Dono de usina nao encontrado.'), { status: 404 });

  const dados: Record<string, unknown> = {};
  if (e.nome !== undefined)      dados.nome = e.nome.trim();
  if (e.natureza !== undefined)  dados.natureza = e.natureza;
  if (e.banco !== undefined)     dados.banco = limpar(e.banco);
  if (e.agencia !== undefined)   dados.agencia = limpar(e.agencia);
  if (e.conta !== undefined)     dados.conta = limpar(e.conta);
  if (e.tipo_conta !== undefined) dados.tipo_conta = e.tipo_conta ?? null;
  if (e.chave_pix !== undefined) dados.chave_pix = limpar(e.chave_pix);
  if (e.tipo_chave_pix !== undefined) dados.tipo_chave_pix = e.tipo_chave_pix ?? null;
  if (e.telefone !== undefined)  dados.telefone = limpar(e.telefone);
  if (e.email !== undefined)     dados.email = limpar(e.email)?.toLowerCase() ?? null;
  if (e.documento_bruto !== undefined) {
    const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');
    if (d.documento === null) throw Object.assign(new TypeError('documento invalido'), { status: 422 });
    dados.documento = d.documento;
    dados.documento_tipo = d.documento_tipo;
    dados.documento_validado = d.documento_validado;
  }
  if (Object.keys(dados).length === 0) return atual;

  // Confere o estado RESULTANTE, nao o pedaco enviado: apagar a chave PIX de
  // quem so tinha PIX passaria numa checagem que olhasse so o patch.
  conferirFormaDeReceber({ ...atual, ...dados } as any);

  try {
    const r = await dbt().dono_usina.updateMany({ where: { id }, data: dados });
    if (r.count === 0) throw Object.assign(new Error('Dono de usina nao encontrado.'), { status: 404 });
    return porId(id);
  } catch (err: any) {
    if (err?.code === 'P2002') throw new DocumentoDeDonoJaExiste(String(dados.documento));
    throw err;
  }
}

/** `dono_usina_documento_unico` e unique CHEIO - documento e NOT NULL aqui.
 *  findUnique legitimo, ao contrario de cliente, onde o indice e parcial. */
export async function porDocumento(bruto: string | null | undefined) {
  await exigir('ler');
  const { documento } = classificar(bruto, 'coleta_local');
  if (documento === null) return null;
  return dbt().dono_usina.findUnique({
    where: { tenant_id_documento: { tenant_id: tenantCorrente(), documento } },
  });
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().dono_usina.findFirst({ where: { id } });
}

export async function listar(opcoes: { ativo?: boolean; limite?: number } = {}) {
  await exigir('ler');
  return dbt().dono_usina.findMany({
    where: opcoes.ativo === undefined ? {} : { ativo: opcoes.ativo },
    orderBy: [{ nome: 'asc' }],
    take: Math.min(opcoes.limite ?? 100, 500),
  });
}

/**
 * Baixa logica. Nao apaga: ha split_item apontando para ele, e apagar
 * beneficiario de repasse ja pago quebraria o extrato de uma competencia
 * fechada. A FK composta recusaria de qualquer forma - isto e o caminho que
 * responde antes.
 */
export async function desativar(id: string) {
  await exigir('escrever_cadastro');
  const usinas = await dbt().usina.count({ where: { dono_usina_id: id, status: { not: 'encerrada' } } });
  if (usinas > 0) {
    throw Object.assign(
      new Error(`Este dono ainda responde por ${usinas} usina(s) nao encerrada(s). Troque o dono delas antes.`),
      { status: 409 });
  }
  const r = await dbt().dono_usina.updateMany({ where: { id, ativo: true }, data: { ativo: false } });
  if (r.count === 0) throw Object.assign(new Error('Dono de usina ativo nao encontrado.'), { status: 404 });
}

/** AUD-08: `usinas.dono_lead_id` nulo em 3 de 3. Do nosso lado o efeito e a R12,
 *  e esta consulta e a fila de trabalho dela - as usinas que nao vao conseguir
 *  repassar quando a primeira fatura delas for paga. */
export async function usinasSemDono() {
  await exigir('ler');
  return dbt().usina.findMany({
    where: { dono_usina_id: null, status: { not: 'encerrada' } },
    orderBy: [{ codigo_geradora: 'asc' }],
  });
}
