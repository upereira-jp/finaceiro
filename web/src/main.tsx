import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProvedorDeSessao } from './sessao.tsx';
import { App } from './app.tsx';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorDeSessao>
      <App />
    </ProvedorDeSessao>
  </StrictMode>,
);
