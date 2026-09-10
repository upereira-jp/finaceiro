// A LEITURA DO CRM DENTRO DO PROCESSO WEB — uma conexao so, aberta na primeira
// pergunta e nunca por requisicao.
//
// ============================================================================
// POR QUE ISTO NASCEU EM 10/09/2026, e a medicao veio do journal
//
// Ate hoje o unico processo que falava com o CRM era o ciclo (`scripts/`). O
// servidor HTTP nunca abriu conexao com ele: varredura de 10/09 achou ZERO
// ocorrencias de `crm/conexao` em `rotas.ts`. Isso estava certo enquanto tudo
// que se fazia com o CRM fosse LER EM LOTE, de 15 em 15 minutos.
//
// O que mudou foi uma medicao: a UC `000091762801211` esta sendo RECUSADA pelo
// conector a cada 15 minutos **desde 04/09/2026 as 18h** — 519 recusas em seis
// dias, sempre a mesma. E o caso da `Q-UCMUDOU-01`: um contrato de rateio que
// mudou de UC no CRM, e a R23 manda o conector recusar em vez de escolher. A
// recusa esta certa. O que faltava era o caminho de SAIDA: quem opera adjudica
// — diz qual das duas leituras vale — e o ponteiro velho e apagado.
//
// Esse caminho existia so como `npm run destravar-uc`, no terminal, como root.
// Enquanto ele mora la, "o sistema roda sozinho" e falso por uma UC.
//
// ============================================================================
// POR QUE UM POOL PROPRIO, E POR QUE ELE E PREGUICOSO
//
// O SERVIDOR NAO PODE PASSAR A DEPENDER DO CRM PARA SUBIR. Hoje o financeiro
// arranca e opera com o CRM fora do ar — o espelho envelhece e nada mais. Se a
// conexao fosse feita no arranque, uma indisponibilidade do outro banco viraria
// um sistema que nao abre, e a troca seria pessima: o CRM esta fora do caminho
// do dinheiro.
//
// Entao: abre na PRIMEIRA pergunta, e so para quem perguntar. Quem nunca clicar
// em "conferir o vinculo" nunca abre conexao nenhuma.
//
// A GUARDA DA REGRA 4 RODA JUNTO, e uma vez so. `conferirRoleDeLeitura` e a
// versao em runtime da regra "o financeiro nunca escreve no CRM": ela recusa
// role com SUPERUSER ou BYPASSRLS. Rodar a cada requisicao seria uma ida ao
// catalogo por clique; nao rodar seria transformar a regra em comentario. Roda
// na abertura, e o resultado fica preso ao pool — trocar a credencial exige
// reiniciar o servico, que e exatamente quando ela deve ser conferida de novo.

import type { Pool } from 'pg';
import { crmDoAmbiente, conferirRoleDeLeitura } from './conexao.ts';

let pool: Pool | undefined;
let abrindo: Promise<Pool> | undefined;

/**
 * O pool de leitura do CRM deste processo.
 *
 * ⚠️ A PROMESSA E MEMOIZADA, e nao so o pool. Duas requisicoes simultaneas na
 * primeira pergunta abririam DOIS pools, e o segundo ficaria orfao — sem
 * `end()`, segurando conexoes do outro banco ate o processo morrer. Guardar a
 * promessa faz a segunda esperar a primeira.
 */
export async function poolDoCrm(): Promise<Pool> {
  if (pool) return pool;
  if (!abrindo) {
    abrindo = (async () => {
      const p = crmDoAmbiente();
      try {
        await conferirRoleDeLeitura(p);   // regra 4, antes de qualquer leitura
      } catch (e) {
        /* Falhou a guarda: o pool NAO fica pendurado. Sem isto, uma credencial
         * insegura deixaria conexoes abertas para um banco que nao vamos usar, e
         * a proxima tentativa abriria mais um. */
        await p.end().catch(() => {});
        abrindo = undefined;
        throw e;
      }
      pool = p;
      return p;
    })();
  }
  return abrindo;
}

/** Fecha o que estiver aberto. Chamado no encerramento ordenado do processo — o
 *  mesmo lugar que fecha os pools do banco proprio. */
export async function encerrarPoolDoCrm(): Promise<void> {
  const p = pool;
  pool = undefined;
  abrindo = undefined;
  if (p) await p.end().catch(() => {});
}
