// O ENTRYPOINT. O processo que atende requisicao.
//
// POR QUE ELE FALTAVA ATE 28/07, e o buraco e o mesmo que este projeto ja pegou
// duas vezes. `iniciarServidor()` existia em `src/http/servidor.ts`, exportado e
// testado por 22 verificacoes — e NINGUEM o chamava. As 78 rotas nunca tinham
// rodado como processo, so dentro da suite, que sobe o servidor com um
// autenticador falso na porta 0.
//
// E exatamente o que o cabecalho de `scripts/ciclo-crm.ts` registrou em 27/07
// sobre o conector: "as tres pecas existiam e eram testadas isoladamente, e nada
// as juntava. Peca testada que ninguem consegue executar nao e sistema."
//
// USO
//   npm start                      (producao: as variaveis vem do ambiente)
//   npm run servir                 (local: carrega o .env)
//
// AS TRES COISAS QUE ESTE ARQUIVO DECIDE, e sao as unicas:
//   1. QUEM autentica  - `autenticadorDoAmbiente()`, o JWT do Supabase Auth do
//      projeto do financeiro. A MT-06 foi decidida em 27/07 e o servidor recebe
//      o autenticador por parametro justamente para a decisao ficar visivel aqui,
//      e nao enterrada dentro dele.
//   2. ONDE estao os estaticos - `web/dist`, se existir. Sem o build, o processo
//      sobe como API pura em vez de recusar: em desenvolvimento o Vite serve o
//      front na porta dele, e um servidor que exigisse o build para arrancar
//      obrigaria a buildar o front para mexer no back.
//   3. COMO ele morre - SIGTERM fecha o servidor e devolve as conexoes do pool
//      antes de sair. Sem isso, um deploy derruba requisicao em voo e deixa
//      transacao aberta segurando linha no banco ate o timeout.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { iniciar, encerrarApp, app } from '../src/app.ts';
import { TETO_DO_ARQUIVO } from '../src/http/rotas.ts';
import { iniciarServidor } from '../src/http/servidor.ts';
import { autenticadorDoAmbiente } from '../src/auth/autenticador.ts';

const raiz = path.resolve(import.meta.dirname, '..');

async function main(): Promise<void> {
  // iniciar() confere a role ANTES de servir a primeira requisicao: subir
  // primeiro e conferir depois deixaria uma janela em que o processo aceita
  // requisicao conectado por uma role com BYPASSRLS.
  await iniciar();

  const dist = path.join(raiz, 'web', 'dist');
  const estaticos = existsSync(path.join(dist, 'index.html')) ? dist : undefined;
  if (!estaticos) {
    console.log('[financeiro] sem web/dist - subindo como API pura. Rode `npm run web:build` para servir a SPA.');
  }

  const servidor = await iniciarServidor({
    app: app(),
    autenticador: autenticadorDoAmbiente(),
    estaticos,
    porta: Number(process.env.PORT ?? 3000),
    /*
     * O CORPO CABE O ARQUIVO, e ate 14/08 nao cabia. O teto do servidor era o
     * default de 1 MB e o teto de arquivo escrito em `rotas.ts` dizia 32 MB -
     * dois numeros que nunca se falaram. Base64 infla 4/3 e o envelope JSON leva
     * o resto; 64 KB de folga cobrem os 21 campos e a moldura.
     */
    maxCorpoBytes: Math.ceil(TETO_DO_ARQUIVO * 4 / 3) + 64 * 1024,
    // O detalhe do 500 vai para o log do processo e NUNCA para a resposta -
    // src/http/erros.ts garante o outro lado.
    log: (m, e) => console.error(m, e),
  });

  /*
   * ENCERRAMENTO ORDENADO, e ele importa mais aqui do que parece: a unidade de
   * trabalho e uma transacao, entao matar o processo no meio de uma requisicao
   * deixa transacao aberta segurando linha ate o timeout do banco. Em deploy,
   * isso e uma janela de bloqueio a cada publicacao.
   */
  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    console.log(`\n[financeiro] ${sinal} recebido, encerrando`);
    await new Promise<void>((r) => servidor.close(() => r()));
    await encerrarApp();
    process.exit(0);
  };
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
}

main().catch(async (e) => {
  console.error('[financeiro] falha no arranque:', e?.message ?? e);
  await encerrarApp().catch(() => {});
  process.exit(1);
});
