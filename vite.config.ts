import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

interface StaticAssetMapping {
  readonly src: string;
  readonly dest: string;
  readonly mime: string;
}

const ALPHATAB_ASSETS: readonly StaticAssetMapping[] = [
  {
    src: 'node_modules/@coderline/alphatab/dist/font/Bravura.woff2',
    dest: 'alphatab/font/Bravura.woff2',
    mime: 'font/woff2',
  },
  {
    src: 'node_modules/@coderline/alphatab/dist/font/Bravura-OFL.txt',
    dest: 'alphatab/font/Bravura-OFL.txt',
    mime: 'text/plain; charset=utf-8',
  },
  {
    src: 'node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2',
    dest: 'alphatab/soundfont/sonivox.sf2',
    mime: 'application/octet-stream',
  },
  {
    src: 'node_modules/@coderline/alphatab/dist/soundfont/LICENSE',
    dest: 'alphatab/soundfont/LICENSE',
    mime: 'text/plain; charset=utf-8',
  },
];

/**
 * Sirve en dev y emite en build las fuentes SMuFL (Bravura OFL-1.1) y el SoundFont libre
 * (sonivox.sf2 Apache-2.0) sin CDNs ni dependencia de SharedArrayBuffer.
 */
function alphaTabAssetsPlugin(base: string): Plugin {
  const byUrlPath = new Map<string, StaticAssetMapping>();
  for (const item of ALPHATAB_ASSETS) {
    byUrlPath.set(`${base}${item.dest}`, item);
  }

  return {
    name: 'endurend-alphatab-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url ?? '').split('?')[0] ?? '';
        const asset = byUrlPath.get(urlPath);
        if (!asset) {
          next();
          return;
        }
        const absPath = path.resolve(process.cwd(), asset.src);
        fs.readFile(absPath, (err, content) => {
          if (err) {
            next(err);
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', asset.mime);
          res.end(content);
        });
      });
    },
    generateBundle() {
      for (const item of ALPHATAB_ASSETS) {
        const absPath = path.resolve(process.cwd(), item.src);
        this.emitFile({
          type: 'asset',
          fileName: item.dest,
          source: fs.readFileSync(absPath),
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const rawBase = env.VITE_BASE_PATH || '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  return {
    base,
    worker: {
      format: 'iife',
    },
    test: {
      testTimeout: 15000,
    },
    plugins: [
      react(),
      alphaTabAssetsPlugin(base),
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
            'Afinador cromático estilo pedal (< 0.05 cents), afinaciones de guitarra y bajo, diccionario e identificador de acordes, metrónomo y motor de tablaturas. Libre y offline.',
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
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2,otf,sf2,sf3}'],
        },
      }),
    ],
  };
});
