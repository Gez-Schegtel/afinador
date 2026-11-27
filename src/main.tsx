import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Registra el Service Worker automáticamente para que la app funcione 100% offline en Android
registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el contenedor #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
