// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Rutas de la app basadas en el fragmento (#) de la URL (Spec 006). Núcleo puro.
 * Funcionan igual en `/` (Capacitor/local) y en `/afinador/` (GitHub Pages) sin reglas de servidor.
 */

export type ChordsTab = 'dictionary' | 'identify';

export type AppRoute =
  | { readonly section: 'tuner' }
  | { readonly section: 'chords'; readonly tab: ChordsTab }
  | { readonly section: 'metronome' };

export type SectionId = AppRoute['section'];

export const DEFAULT_ROUTE: AppRoute = { section: 'tuner' };

export const SECTION_ORDER: readonly SectionId[] = [
  'tuner',
  'chords',
  'metronome',
];

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  tuner: 'Afinador',
  chords: 'Acordes',
  metronome: 'Metrónomo',
};

export const CHORDS_TAB_LABELS: Readonly<Record<ChordsTab, string>> = {
  dictionary: 'Diccionario',
  identify: 'Identificar',
};

/** Ruta por defecto de cada sección (la que abre el botón de la barra de navegación). */
export function sectionRoute(section: SectionId): AppRoute {
  switch (section) {
    case 'chords':
      return { section: 'chords', tab: 'dictionary' };
    case 'metronome':
      return { section: 'metronome' };
    default:
      return { section: 'tuner' };
  }
}

export function parseRoute(hash: string | null | undefined): AppRoute {
  const parts = (hash ?? '')
    .replace(/^#/, '')
    .split('/')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  switch (parts[0]) {
    case 'acordes':
      return {
        section: 'chords',
        tab: parts[1] === 'identificar' ? 'identify' : 'dictionary',
      };
    case 'metronomo':
    case 'metrónomo':
      return { section: 'metronome' };
    default:
      return DEFAULT_ROUTE;
  }
}

export function routeToHash(route: AppRoute): string {
  switch (route.section) {
    case 'chords':
      return route.tab === 'identify'
        ? '#/acordes/identificar'
        : '#/acordes/diccionario';
    case 'metronome':
      return '#/metronomo';
    default:
      return '#/afinador';
  }
}

export function sameRoute(a: AppRoute, b: AppRoute): boolean {
  return routeToHash(a) === routeToHash(b);
}
