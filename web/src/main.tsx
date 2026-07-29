import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProvedorDeSessao } from './sessao.tsx';
import { App } from './app.tsx';
import { iniciarTema } from './tema.ts';

// Antes do primeiro render: aplica o modo guardado (padrão claro) e passa a
// seguir o SO enquanto o modo for "sistema".
iniciarTema();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorDeSessao>
      <App />
    </ProvedorDeSessao>
  </StrictMode>,
);
