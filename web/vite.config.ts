import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O PROXY E O QUE MANTEM UMA ORIGEM SO EM DESENVOLVIMENTO.
//
// Em producao o proprio servidor Node serve web/dist e a API sob /api - mesma
// origem, sem CORS. Em desenvolvimento o Vite serve o front na 5173 e a API
// esta na 3000; sem o proxy apareceria CORS SO no desenvolvimento, e configurar
// CORS para um ambiente e nao para o outro e como o desenho de auth diverge
// entre os dois sem ninguem perceber.
//
// Com o proxy, `fetch('/api/...')` funciona identico nos dois lugares.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // TRES PEDACOS EM VEZ DE UM, e o motivo e MEDICAO antes de cache.
    //
    // Em 30/07/2026 entraram os icones do Phosphor, e "tree-shaking resolve" era
    // afirmacao minha sem numero. Com os pedacos separados o build IMPRIME o
    // custo de cada dependencia a cada vez, e ninguem precisa acreditar em mim:
    // o numero aparece no terminal de quem roda `npm run web:build`.
    //
    // O ganho de cache vem de graca e e real: `nossa` muda a cada deploy,
    // `icones` muda quando um icone entra ou sai, e `plataforma` (React e
    // supabase-js) fica meses igual. Com um arquivo unico, trocar uma palavra
    // numa tela invalidava os 630 KB inteiros no browser de quem opera.
    rollupOptions: {
      output: {
        manualChunks: {
          icones: ['@phosphor-icons/react'],
          plataforma: ['react', 'react-dom', '@supabase/supabase-js'],
        },
      },
    },
  },
});
