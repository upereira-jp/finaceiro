// QUEM E O "QUEM" DA TRILHA QUANDO NAO HA PESSOA. `ADR-0006`, Decisao 3.
//
// A Sicoob nao e usuario, nao tem `usuario_id` e nao tem papel - e as tres
// coisas sao exigidas: o contexto exige `usuarioId` em uuid, `liquidacao.baixar`
// exige `escrever_carteira`, e a regra 9 exige quem-quando-o-que. A ADR
// descartou as duas saidas faceis e escolheu a terceira:
//
//   A. reusar o auth_user_id de uma pessoa   descartada: a trilha passaria a
//      dizer que o dono baixou uma fatura as 3h da manha, e estaria MENTINDO.
//      Trilha que mente e pior que trilha ausente;
//   B. afrouxar o contexto para usuario nulo descartada: abre excecao no ponto
//      unico de emissao de contexto, que e a peca que o ADR-0003 existe para
//      manter sem excecao;
//   C. usuario de servico por tenant         escolhida. Sem caminho de login, e
//      com o papel MINIMO que faz `escrever_carteira` passar - `cobranca`, e
//      nao `admin`.
//
// COMO ELE E ENCONTRADO, sem coluna nova e sem migration: o `auth_user_id` do
// usuario de servico e DERIVADO do tenant, por UUIDv5 com o namespace fixo
// abaixo. Ninguem precisa guarda-lo em lugar nenhum - as duas pontas (este
// arquivo e `scripts/provisionar-servico-de-cobranca.sql`) chegam ao mesmo
// numero a partir do mesmo tenant.
//
// POR QUE ISSO NAO E UM CAMINHO DE LOGIN, que e a parte que a ADR fez questao de
// escrever: o uuid existe na NOSSA tabela `usuario` e **nao existe no Supabase
// Auth**. Ninguem consegue emitir um JWT com esse `sub`, porque nao ha conta.
// Ele e sujeito de trilha e de policy, e nao credencial: sozinho, nao autentica
// nada - quem autentica a chamada e o mTLS da Decisao 1.

import { createHash } from 'node:crypto';

/**
 * O NAMESPACE. Fixo para sempre: mudar este valor troca a identidade de todo
 * usuario de servico ja provisionado, e a trilha antiga passaria a apontar para
 * um usuario que ninguem mais deriva.
 *
 * Nao e segredo. Um uuid de namespace publicado nao autoriza nada - o que
 * autoriza e a linha em `usuario_tenant`, que so o provisionamento cria.
 */
export const NAMESPACE_SERVICO = '101813e3-e332-4708-b449-decd8fd9fadb';

const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehUuid = (v: string | undefined): boolean => !!v && EH_UUID.test(v);

/** UUID **v5** (SHA-1, RFC 4122). Escrito aqui em vez de vir de dependencia: sao
 *  dez linhas, e a alternativa era um pacote novo no caminho do dinheiro. */
export function uuidV5(nome: string, namespace: string): string {
  if (!EH_UUID.test(namespace)) throw new TypeError(`namespace nao e uuid: ${namespace}`);
  const bytesNs = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(bytesNs).update(Buffer.from(nome, 'utf8')).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // versao 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * O `auth_user_id` do usuario de servico de cobranca DESTE tenant.
 *
 * Deterministico de proposito: o webhook chega sabendo o tenant (pela URL,
 * `Q-WEBHOOK-TENANT-01`) e precisa chegar ao usuario **sem uma leitura fora de
 * contexto de tenant** - que e o que a R1-c reserva ao `resolver_login` e a mais
 * ninguem.
 */
export function authUserIdDeServico(tenantId: string): string {
  if (!EH_UUID.test(tenantId)) throw new TypeError(`tenant nao e uuid: ${tenantId}`);
  return uuidV5(`cobranca:${tenantId.toLowerCase()}`, NAMESPACE_SERVICO);
}

/** O e-mail e o nome sao os que o provisionamento grava, e existem para a trilha
 *  ser LEGIVEL: quem abrir a auditoria le "Conector de cobranca Sicoob" e nao um
 *  uuid. O dominio `invalido.` e reservado por RFC 6761 - nao ha caixa. */
export const nomeDoServico = 'Conector de cobranca Sicoob';
export const emailDoServico = (tenantId: string) => `cobranca+${tenantId}@servico.invalido`;
