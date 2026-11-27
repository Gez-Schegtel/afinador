import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const rawBase = env.VITE_BASE_PATH || '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  return {
    base,
    worker: {
      format: 'iife',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon.svg'],
        manifest: {
          id: base,
          name: 'Afinador Cromático — Guitarra y Bajo',
          short_name: 'Afinador',
          description:
            'Afinador cromático estilo pedal de precisión estroboscópica (< 0.05 cents) para guitarra y bajo, con calibración A4 ajustable y modo offline.',
          theme_color: '#05070d',
          background_color: '#05070d',
          display: 'standalone',
          orientation: 'portrait',
          lang: 'es',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        },
      }),
    ],
  };
});
