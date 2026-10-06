// ANEXO — o comprovante de uma despesa como ARQUIVO (migration 44, ADR-0009).
//
// DE ONDE ISTO VEM: a planilha tinha «COMPROVANTE (link)», e o sistema copiou o
// link em 02/10 (`conta_pagar.comprovante_url`). Link quebra: a pasta muda de
// dono, o arquivo é apagado, e o comprovante some sem ninguém saber. Para o
// controle que o dono pediu em 06/10 — e para o cartão e o reembolso das etapas 2
// e 3, onde o comprovante é obrigatório — o arquivo passa a morar aqui.
//
// ONDE O ARQUIVO MORA: no próprio Postgres (`anexo_conteudo`), e não no Storage
// (ADR-0009). Os bytes ficam numa tabela à parte, um por sha256 no tenant — o
// mesmo PDF anexado duas vezes é guardado uma —, e o tipo, o tamanho e o sha256
// são carimbados pelo GATILHO, a partir dos bytes. O link continua aceito ao lado.
//
// O QUE NÃO EXISTE: apagar. Desvincular marca o vínculo, e o arquivo continua no
// banco e na trilha (pelo sha256, sem os bytes).

import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.ts';
import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';

const erro = (status: number, mensagem: string) => Object.assign(new Error(mensagem), { status });

/** Os tipos que o gatilho aceita. GIF não: comprovante é PDF ou foto. */
export const TIPOS_DE_ANEXO = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
/** O teto do banco (CHECK `anexo_conteudo_teto`), o mesmo da leitura de fatura. */
export const TETO_DO_ANEXO = 8 * 1024 * 1024;

export type AnexoNaLista = {
  id: string;
  nome_arquivo: string;
  enviado_em: Date;
  tipo: string;
  tamanho_bytes: number;
};

/** O nome que aparece: sem caminho, sem caractere de controle, até 200. */
function nomeDoArquivo(v: unknown): string {
  const t = typeof v === 'string' ? v.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f]/g, '').trim() : '';
  if (!t) throw erro(422, 'O anexo precisa de um nome de arquivo.');
  return t.slice(0, 200);
}

/**
 * Anexa um arquivo a uma conta a pagar (despesa, repasse ou comissão — o
 * comprovante do Pix ao dono da usina também é prova). Devolve o vínculo.
 *
 * O conteúdo entra uma vez por sha256: se o mesmo arquivo já está no tenant, só
 * nasce o vínculo novo. O INSERT é SQL direto porque o sha, o tipo e o tamanho são
 * do gatilho — o Prisma exigiria os três no `create`.
 */
export async function anexar(contaPagarId: string, e: { nome_arquivo: unknown; conteudo: Uint8Array }) {
  await exigir('escrever_corporativo');
  const nome_arquivo = nomeDoArquivo(e.nome_arquivo);
  if (!e.conteudo?.length) throw erro(422, 'O arquivo veio vazio.');
  if (e.conteudo.length > TETO_DO_ANEXO) {
    throw erro(413, `O arquivo tem ${Math.round(e.conteudo.length / 1024 / 1024)} MB e o teto é 8 MB. Uma foto do comprovante reduzida tem centenas de KB.`);
  }
  const conta = await dbt().conta_pagar.findFirst({ where: { id: contaPagarId }, select: { id: true } });
  if (!conta) throw erro(404, 'Conta a pagar não encontrada.');

  const tenant = tenantCorrente();
  const bytes = Buffer.from(e.conteudo);
  const sha = createHash('sha256').update(bytes).digest('hex');
  let conteudoId: string;
  try {
    const [novo] = await dbt().$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO anexo_conteudo (tenant_id, conteudo) VALUES (${tenant}::uuid, ${bytes})
      ON CONFLICT (tenant_id, sha256) DO NOTHING
      RETURNING id`);
    if (novo) conteudoId = novo.id;
    else {
      const ja = await dbt().anexo_conteudo.findFirst({ where: { sha256: sha }, select: { id: true } });
      if (!ja) throw erro(500, 'O arquivo já existia e não foi encontrado — tente de novo.');
      conteudoId = ja.id;
    }
  } catch (x: any) {
    /* 23514 do gatilho (tipo pelos bytes) ou do CHECK do teto: vira a frase da tela. */
    const codigo = x?.meta?.code ?? x?.code ?? x?.cause?.code;
    if (codigo === '23514' || /PDF, PNG, JPEG nem WEBP|anexo_conteudo_teto/.test(String(x?.message))) {
      throw erro(422, 'O comprovante precisa ser PDF ou foto (PNG, JPEG ou WEBP), de até 8 MB — conferido pelos bytes do arquivo, não pelo nome.');
    }
    throw x;
  }
  const a = await dbt().anexo.create({
    data: { tenant_id: tenant, conteudo_id: conteudoId, conta_pagar_id: contaPagarId, nome_arquivo },
    select: { id: true, nome_arquivo: true, enviado_em: true, anexo_conteudo: { select: { tipo: true, tamanho_bytes: true } } },
  });
  return { id: a.id, nome_arquivo: a.nome_arquivo, enviado_em: a.enviado_em, ...a.anexo_conteudo } satisfies AnexoNaLista;
}

/** Os anexos vivos de uma conta, sem os bytes. */
export async function daConta(contaPagarId: string): Promise<AnexoNaLista[]> {
  await exigir('ler_corporativo');
  const linhas = await dbt().anexo.findMany({
    where: { conta_pagar_id: contaPagarId, desvinculado_em: null },
    select: { id: true, nome_arquivo: true, enviado_em: true, anexo_conteudo: { select: { tipo: true, tamanho_bytes: true } } },
    orderBy: [{ enviado_em: 'asc' }],
  });
  return linhas.map((a) => ({ id: a.id, nome_arquivo: a.nome_arquivo, enviado_em: a.enviado_em, ...a.anexo_conteudo }));
}

/** O arquivo, para abrir ou baixar. O sha256 serve de ETag: não muda nunca. */
export async function baixar(id: string) {
  await exigir('ler_corporativo');
  const a = await dbt().anexo.findFirst({
    where: { id },
    select: { nome_arquivo: true, anexo_conteudo: { select: { tipo: true, sha256: true, conteudo: true } } },
  });
  if (!a) throw erro(404, 'Anexo não encontrado.');
  return {
    nome_arquivo: a.nome_arquivo,
    tipo: a.anexo_conteudo.tipo,
    sha256: a.anexo_conteudo.sha256,
    conteudo: a.anexo_conteudo.conteudo as Uint8Array,
  };
}

/**
 * Tira o anexo da despesa (anexou o arquivo errado). NÃO apaga: o vínculo fica
 * marcado com quem e quando, e o arquivo continua no banco. O banco só deixa
 * mudar essas duas colunas (GRANT por coluna, migration 44).
 */
export async function desvincular(id: string) {
  await exigir('escrever_corporativo');
  const n = await dbt().$executeRaw(Prisma.sql`
    UPDATE anexo SET desvinculado_em = now(), desvinculado_por = app.current_usuario_id()
     WHERE id = ${id}::uuid AND desvinculado_em IS NULL`);
  if (n === 0) {
    const a = await dbt().anexo.findFirst({ where: { id }, select: { id: true } });
    throw a ? erro(409, 'Este anexo já foi tirado da despesa.') : erro(404, 'Anexo não encontrado.');
  }
}
