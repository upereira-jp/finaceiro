// PERGUNTAS AO CATALOGO DO POSTGRES, respondidas em RUNTIME e nao por constante.
//
// POR QUE ISTO E UM MODULO PROPRIO. A pergunta "o indice X ainda existe?" nasceu
// dentro de `src/crm/sincronizacao.ts`, para o conector se autodesligar no dia em
// que a migration 33 rodasse. Ela funcionou: o ciclo seguinte semeou os
// documentos sozinho, sem deploy e sem mudanca de codigo.
//
// So que a migration derrubou o indice para TODO MUNDO, e quem nao fazia a
// pergunta ficou guardando um portao que nao existe mais. Medido em 21/08/2026,
// um dia depois da migration: `importar-documentos.ts --ensaio` recusou 4 de 18
// linhas citando `cliente_documento_unico`, com o catalogo respondendo que o
// indice ja tinha sido dropado. As 4 eram as 4 pessoas com duas UCs - exatamente
// o caso que a migration 33 foi criada para permitir.
//
// A licao e a que o proprio comentario do conector ja dizia: guarda que depende
// de DDL tem de perguntar ao banco, nao lembrar. Estando aqui, quem precisar da
// resposta a encontra sem importar a camada do CRM para dentro de um repositorio.

import { dbt } from './tipado.ts';

/*
 * Cacheado por processo: o catalogo nao muda no meio de um lote, e um ciclo tem
 * dez. Um processo que suba antes da migration e continue vivo depois responderia
 * o valor velho - e responderia para o lado seguro (ver o catch abaixo), que e
 * contar em vez de escrever.
 */
let _travaConhecida: boolean | null = null;

/**
 * O indice `cliente_documento_unico` ainda existe neste banco?
 *
 * Era UNIQUE parcial sobre (tenant_id, documento) WHERE documento IS NOT NULL.
 * A migration 33 o dropou em 20/08/2026, mantendo `uc_numero_unico`, porque a
 * regra de negocio e assimetrica: **o documento pode repetir** (mais de uma
 * pessoa pode responder por uma UC, e uma pessoa pode ter duas UCs), **a UC
 * nao**.
 */
export async function indiceDeDocumentoExiste(): Promise<boolean> {
  if (_travaConhecida !== null) return _travaConhecida;
  try {
    const linhas: any[] = await dbt().$queryRaw`
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'cliente_documento_unico'`;
    _travaConhecida = linhas.length > 0;
  } catch {
    /* Sem resposta do catalogo, assume que a trava existe: errar para o lado de
     * contar em vez de escrever nunca derruba lote. */
    _travaConhecida = true;
  }
  return _travaConhecida;
}

/** So para teste: esquece a resposta cacheada. Nao usar em runtime - a resposta
 *  real muda uma vez na vida do banco, e no meio de um lote ela nao muda. */
export function esquecerCacheDoCatalogo(): void {
  _travaConhecida = null;
}
