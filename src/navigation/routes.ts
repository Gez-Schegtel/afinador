// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Rutas de la app basadas en el fragmento (#) de la URL (Specs 006 y 008). Núcleo puro.
 * Funcionan igual en `/` (Capacitor/local) y en `/afinador/` (GitHub Pages) sin reglas de servidor.
 */

export type ChordsTab = 'dictionary' | 'identify';
export type TabsSubRoute = 'library' | 'practice' | 'editor' | 'scales' | 'catalogs';

export type AppRoute =
  | { readonly section: 'tuner' }
  | { readonly section: 'chords'; readonly tab: ChordsTab }
  | { readonly section: 'metronome' }
  | { readonly section: 'tabs'; readonly subRoute: TabsSubRoute };

export type SectionId = AppRoute['section'];

export const DEFAULT_ROUTE: AppRoute = { section: 'tuner' };

export const SECTION_ORDER: readonly SectionId[] = [
  'tuner',
  'chords',
  'metronome',
  'tabs',
];

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  tuner: 'Afinador',
  chords: 'Acordes',
  metronome: 'Metrónomo',
  tabs: 'Tablaturas',
};

export const CHORDS_TAB_LABELS: Readonly<Record<ChordsTab, string>> = {
  dictionary: 'Diccionario',
  identify: 'Identificar',
};

export const TABS_SUBROUTE_ORDER: readonly TabsSubRoute[] = [
  'library',
  'practice',
  'editor',
  'scales',
  'catalogs',
];

export const TABS_SUBROUTE_LABELS: Readonly<Record<TabsSubRoute, string>> = {
  library: 'Biblioteca',
  practice: 'Práctica',
  editor: 'Estudio',
  scales: 'Escalas',
  catalogs: 'Catálogos',
};

/** Ruta por defecto de cada sección (la que abre el botón de la barra de navegación). */
export function sectionRoute(section: SectionId): AppRoute {
  switch (section) {
    case 'chords':
      return { section: 'chords', tab: 'dictionary' };
    case 'metronome':
      return { section: 'metronome' };
    case 'tabs':
      return { section: 'tabs', subRoute: 'library' };
    default:
      return { section: 'tuner' };
  }
}

function normalizeSegment(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseRoute(hash: string | null | undefined): AppRoute {
  const parts = (hash ?? '')
    .replace(/^#/, '')
    .split('/')
    .map(normalizeSegment)
    .filter((p) => p.length > 0);

  switch (parts[0]) {
    case 'acordes':
      return {
        section: 'chords',
        tab: parts[1] === 'identificar' ? 'identify' : 'dictionary',
      };
    case 'metronomo':
      return { section: 'metronome' };
    case 'tablaturas': {
      let subRoute: TabsSubRoute = 'library';
      if (parts[1] === 'practica') subRoute = 'practice';
      else if (parts[1] === 'estudio') subRoute = 'editor';
      else if (parts[1] === 'escalas') subRoute = 'scales';
      else if (parts[1] === 'catalogos') subRoute = 'catalogs';
      return { section: 'tabs', subRoute };
    }
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
    case 'tabs':
      switch (route.subRoute) {
        case 'practice':
          return '#/tablaturas/practica';
        case 'editor':
          return '#/tablaturas/estudio';
        case 'scales':
          return '#/tablaturas/escalas';
        case 'catalogs':
          return '#/tablaturas/catalogos';
        default:
          return '#/tablaturas';
      }
    default:
      return '#/afinador';
  }
}

export function sameRoute(a: AppRoute, b: AppRoute): boolean {
  return routeToHash(a) === routeToHash(b);
}
