// FERRAMENTA DE OLHO, e nao de teste: monta o painel de ajuda em HTML estatico
// com o CSS de verdade, para ser aberto num navegador sem subir o servidor nem
// fazer login. Nao entra no `test:web` e nao afirma nada — quem afirma e
// `caso-render.tsx`. O porque de ela existir esta em `caso-previa.tsx`.
//
// Uso: npm run --silent previa -- /caminho/de/saida
//
// A MECANICA E EMPRESTADA DE `render.ts`, e as tres escolhas dela valem iguais
// aqui: `bundle` porque o caso importa a arvore inteira de componentes, React
// EXTERNO para nao existir uma segunda copia no processo, e a saida DENTRO de
// `web/node_modules/` — em /tmp o Node procura `react-dom` a partir de /tmp e nao
// acha. O pacote e apagado no fim.

import { build } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESTILO } from '../src/estilo.ts';

const SAIDA = process.argv[2] ?? '/tmp';
const out = fileURLToPath(new URL('../node_modules/.previa.mjs', import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL('caso-previa.tsx', import.meta.url))],
  outfile: out, bundle: true, format: 'esm', platform: 'node', target: 'node22',
  jsx: 'automatic', resolveExtensions: ['.tsx', '.ts', '.mjs', '.js'],
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  logLevel: 'warning',
});

const m = await import(out) as Record<string, string>;

/* O painel e `position: fixed` e cobre a direita da janela; numa pagina vazia
 * ele fica no lugar certo sozinho. O tema segue o do sistema operacional de quem
 * abrir, que e o que se quer conferir. */
const pagina = (corpo: string): string =>
  '<!doctype html><html lang=pt-BR><head><meta charset=utf-8>'
  + '<title>Prévia do painel de ajuda</title><style>' + ESTILO + '</style></head>'
  + '<body>' + corpo + '</body></html>';

writeFileSync(SAIDA + '/p-parado.html', pagina(m.parado!));
writeFileSync(SAIDA + '/p-busca.html', pagina(m.buscando!));
writeFileSync(SAIDA + '/p-vazio.html', pagina(m.vazio!));
rmSync(out, { force: true });

console.log('previas escritas em', SAIDA, '— p-parado.html, p-busca.html, p-vazio.html');
