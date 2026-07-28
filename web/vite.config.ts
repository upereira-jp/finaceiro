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
  build: { outDir: 'dist', emptyOutDir: true },
});
