import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { whenAudioIdle } from './shell/audio-activity';
import './index.css';

const isNativeApp =
  (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
  true;

if (isNativeApp) {
  // En el APK los archivos ya son locales: un Service Worker no aporta y podría servir una
  // versión vieja tras actualizar. Se dan de baja los que hayan quedado de versiones anteriores.
  void navigator.serviceWorker?.getRegistrations().then((registrations) => {
    for (const registration of registrations) void registration.unregister();
  });
} else {
  // PWA offline. Ante una versión nueva, recargar recién cuando no haya audio activo, para no
  // cortar una sesión de afinación o el metrónomo.
  registerSW({
    immediate: true,
    onNeedReload: () => whenAudioIdle(() => window.location.reload()),
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el contenedor #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
