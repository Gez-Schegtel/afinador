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
        includeAssets: ['icons/*.png'],
        manifest: {
          // `id`, `start_url` y `scope` no cambian con el nuevo nombre: cambiarlos rompería las
          // instalaciones existentes de la PWA.
          id: base,
          name: 'Endurend Musical Gadgets',
          short_name: 'Endurend',
          description:
            'Afinador cromático estilo pedal (< 0.05 cents), afinaciones de guitarra y bajo, diccionario e identificador de acordes y metrónomo. Libre y offline.',
          theme_color: '#e0a83f',
          background_color: '#f0d79a',
          display: 'standalone',
          orientation: 'portrait',
          lang: 'es',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
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
