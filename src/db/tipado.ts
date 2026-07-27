// O UNICO arquivo do sistema que conhece o client gerado.
//
// POR QUE ELE EXISTE. contexto.ts declara `ClientTx` com index signature
// `[modelo: string]: any` - de proposito, porque aquele modulo cuida do ciclo de
// vida da transacao e nao deve conhecer os 17 modelos. O preco e que
// `db().cliente.create({ data: { nome_erradoo: 'x' } })` COMPILA, antes e depois
// do `prisma generate`. Os tipos gerados nunca chegariam ao repositorio.
//
// Uma indirecao de uma linha resolve os dois lados: contexto.ts segue agnostico,
// e os repositorios ganham os 17 modelos.
//
// Se o `generate` mudar o caminho ou o nome do namespace, e aqui - e so aqui -
// que se conserta. O caminho vem de `output` no generator do schema.prisma
// ('../src/generated/prisma', relativo a prisma/).
import type { Prisma } from '../generated/prisma/client.ts';
import { db } from './contexto.ts';

/**
 * O client de transacao da unidade de trabalho corrente, TIPADO.
 *
 * Lanca SemContextoDeTenant fora de withTenant(), igual ao db() cru: sem
 * contexto, toda leitura devolveria zero sem erro.
 */
export const dbt = (): Prisma.TransactionClient => db() as Prisma.TransactionClient;
