// O RUNNER DO TESTE DE RENDERIZACAO.
// Uso: node --experimental-strip-types web/tests/render.ts
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE, e por que ele nao e o teste
//
// O runner do `web/` e `node --experimental-strip-types`, que TIRA TIPOS e nao
// entende JSX — `const x = <div/>` morre com `SyntaxError: Unexpected token '<'`.
// E essa limitacao que fez o projeto inteiro empurrar regra para fora do `.tsx`
// (`navegacao.ts`, `destino-da-camada.ts`, os `*-regras.ts`): o que precisa de
// teste sai da tela, porque a tela e inalcancavel.
//
// So que "a tela e inalcancavel" era uma restricao da FERRAMENTA, e ela ja
// estava paga: o `esbuild` vem dentro do Vite, que e dependencia de
// desenvolvimento desde o primeiro dia. Este arquivo o usa para compilar
// `caso-render.tsx` e roda o resultado. **Nenhuma dependencia nova.**
//
// O QUE ISSO DESTRAVOU: pela primeira vez ha prova de que um componente MONTA e
// de que o texto certo CHEGA no HTML. Ate 21/08/2026 nenhuma suite deste
// repositorio tinha renderizado uma linha de React.
//
// ============================================================================
// AS TRES ESCOLHAS DA COMPILACAO
//
//   `bundle: true`     o caso importa `ajuda-corpo.tsx`, que importa `ui.tsx`,
//                      que importa os icones. Compilar arquivo por arquivo
//                      exigiria resolver isso a mao;
//   react EXTERNO      `react` e `react-dom/server` ficam de fora do pacote e
//                      sao resolvidos pelo Node em tempo de execucao. Empacota-
//                      los criaria uma SEGUNDA copia do React no processo, e o
//                      teste passaria a medir essa copia em vez da que a
//                      aplicacao usa;
//   saida DENTRO de    e a consequencia da escolha de cima, e custou uma
//   `web/node_modules` tentativa: com o pacote em `/tmp`, o Node procura
//                      `react-dom` a partir de `/tmp` e nao acha
//                      (`ERR_MODULE_NOT_FOUND`). Gerado sob `web/node_modules/`,
//                      a subida normal de diretorios encontra as dependencias da
//                      propria aplicacao — que e exatamente o que se quer medir.
//                      `node_modules` ja e ignorado pelo git, entao o pacote nao
//                      entra no repositorio. E apagado no fim de qualquer forma,
//                      inclusive quando o teste falha.

import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

const tmp = await mkdtemp(resolve(AQUI, '..', 'node_modules', '.render-'));
const saida = join(tmp, 'caso.mjs');

try {
  await build({
    entryPoints: [join(AQUI, 'caso-render.tsx')],
    outfile: saida,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    jsx: 'automatic',
    // `.ts` no `resolveExtensions` porque os imports do projeto escrevem a
    // extensao real (`./ajuda.ts`), como o runner de tipos exige.
    resolveExtensions: ['.tsx', '.ts', '.mjs', '.js'],
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
    logLevel: 'warning',
  });

  const mod = await import(pathToFileURL(saida).href);
  const { falhas, feitas } = mod.resultado();

  console.log();
  if (falhas > 0) {
    console.log(`--- render: ${falhas} FALHA(S)`);
    process.exitCode = 1;
  } else {
    console.log(`--- render (o painel de ajuda, montado de verdade): ${feitas} verificacoes, 0 falhas`);
  }
} finally {
  // Mesmo quando falha: um /tmp cheio de pacotes de teste e lixo que ninguem
  // varre, e o proximo a rodar aqui nao vai saber que sao meus.
  await rm(tmp, { recursive: true, force: true });
}
