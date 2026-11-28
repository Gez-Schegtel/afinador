// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Configuración en tiempo de ejecución de alphaTab (Spec 008).
 * Resuelve trabajadores, AudioWorklet y activos locales (Bravura y sonivox.sf2) relativos
 * a `BASE_URL` para funcionar en `/` y `/afinador/`, sin CDNs ni SharedArrayBuffer.
 */

import * as alphaTab from '@coderline/alphatab/core';
import AlphaTabWebWorker from './alphatab-render.worker.ts?worker';
import alphaTabWorkletUrl from './alphatab-audio.worklet.ts?worker&url';

export type ScoreTheme = 'endurend-dark' | 'warm-paper' | 'light';

export const SCORE_THEME_LABELS: Readonly<Record<ScoreTheme, string>> = {
  'endurend-dark': 'Oscuro Endurend',
  'warm-paper': 'Papel cálido',
  light: 'Claro contraste',
};

let environmentReady = false;

export function ensureAlphaTabEnvironment(): void {
  if (environmentReady) return;
  alphaTab.Environment.initializeMain(
    () => new AlphaTabWebWorker(),
    (context) => context.audioWorklet.addModule(alphaTabWorkletUrl)
  );
  environmentReady = true;
}

function basePrefix(): string {
  const raw = import.meta.env.BASE_URL || '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function applyScoreTheme(settings: alphaTab.Settings, theme: ScoreTheme): void {
  const res = settings.display.resources;
  if (theme === 'warm-paper') {
    res.mainGlyphColor = alphaTab.model.Color.fromJson('#24112b')!;
    res.secondaryGlyphColor = alphaTab.model.Color.fromJson('#5b3b66')!;
    res.staffLineColor = alphaTab.model.Color.fromJson('#a89476')!;
    res.barSeparatorColor = alphaTab.model.Color.fromJson('#745d44')!;
    res.barNumberColor = alphaTab.model.Color.fromJson('#7a2d5a')!;
    res.scoreInfoColor = alphaTab.model.Color.fromJson('#24112b')!;
    return;
  }
  if (theme === 'light') {
    res.mainGlyphColor = alphaTab.model.Color.fromJson('#111111')!;
    res.secondaryGlyphColor = alphaTab.model.Color.fromJson('#444444')!;
    res.staffLineColor = alphaTab.model.Color.fromJson('#b0b0b0')!;
    res.barSeparatorColor = alphaTab.model.Color.fromJson('#666666')!;
    res.barNumberColor = alphaTab.model.Color.fromJson('#555555')!;
    res.scoreInfoColor = alphaTab.model.Color.fromJson('#111111')!;
    return;
  }
  // Oscuro Endurend (sobre --bg-screen #140a19)
  res.mainGlyphColor = alphaTab.model.Color.fromJson('#f3e3c3')!;
  res.secondaryGlyphColor = alphaTab.model.Color.fromJson('#c9a0ea')!;
  res.staffLineColor = alphaTab.model.Color.fromJson('#4a2b52')!;
  res.barSeparatorColor = alphaTab.model.Color.fromJson('#7b5785')!;
  res.barNumberColor = alphaTab.model.Color.fromJson('#e0a83f')!;
  res.scoreInfoColor = alphaTab.model.Color.fromJson('#f3e3c3')!;
}

export function createAlphaTabSettings(theme: ScoreTheme = 'endurend-dark'): alphaTab.Settings {
  ensureAlphaTabEnvironment();
  const prefix = basePrefix();
  const settings = new alphaTab.Settings();
  settings.core.fontDirectory = `${prefix}alphatab/font/`;
  settings.core.smuflFontSources = new Map([
    [alphaTab.FontFileFormat.Woff2, `${prefix}alphatab/font/Bravura.woff2`],
  ]);
  settings.core.useWorkers = true;
  settings.core.enableLazyLoading = true;
  settings.core.logLevel = alphaTab.LogLevel.Warning;

  settings.player.enablePlayer = true;
  settings.player.playerMode = alphaTab.PlayerMode.EnabledAutomatic;
  settings.player.soundFont = `${prefix}alphatab/soundfont/sonivox.sf2`;
  settings.player.enableCursor = true;
  settings.player.enableAnimatedBeatCursor = true;

  settings.display.scale = 1.0;
  settings.display.layoutMode = alphaTab.LayoutMode.Page;
  // Título legible sin desbordar pantallas móviles de 412px
  const titleFont = settings.display.resources.elementFonts.get(
    alphaTab.NotationElement.ScoreTitle
  );
  if (titleFont) {
    settings.display.resources.elementFonts.set(
      alphaTab.NotationElement.ScoreTitle,
      titleFont.withSize(21)
    );
  }
  const subFont = settings.display.resources.elementFonts.get(
    alphaTab.NotationElement.ScoreSubTitle
  );
  if (subFont) {
    settings.display.resources.elementFonts.set(
      alphaTab.NotationElement.ScoreSubTitle,
      subFont.withSize(13)
    );
  }
  applyScoreTheme(settings, theme);

  return settings;
}
