// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE,
  SECTION_ORDER,
  parseRoute,
  routeToHash,
  sameRoute,
  sectionRoute,
  type AppRoute,
} from './routes';

describe('Rutas por hash (Specs 006 y 008)', () => {
  it('parsea todas las rutas conocidas', () => {
    expect(parseRoute('#/afinador')).toEqual({ section: 'tuner' });
    expect(parseRoute('#/acordes')).toEqual({ section: 'chords', tab: 'dictionary' });
    expect(parseRoute('#/acordes/diccionario')).toEqual({
      section: 'chords',
      tab: 'dictionary',
    });
    expect(parseRoute('#/acordes/identificar')).toEqual({
      section: 'chords',
      tab: 'identify',
    });
    expect(parseRoute('#/metronomo')).toEqual({ section: 'metronome' });
    expect(parseRoute('#/Metrónomo/')).toEqual({ section: 'metronome' });
    expect(parseRoute('#/tablaturas')).toEqual({ section: 'tabs', subRoute: 'library' });
    expect(parseRoute('#/tablaturas/práctica')).toEqual({
      section: 'tabs',
      subRoute: 'practice',
    });
    expect(parseRoute('#/tablaturas/estudio')).toEqual({
      section: 'tabs',
      subRoute: 'editor',
    });
    expect(parseRoute('#/tablaturas/escalas')).toEqual({
      section: 'tabs',
      subRoute: 'scales',
    });
    expect(parseRoute('#/tablaturas/catálogos')).toEqual({
      section: 'tabs',
      subRoute: 'catalogs',
    });
  });

  it('abre el Afinador con hash vacío o desconocido', () => {
    expect(parseRoute('')).toEqual(DEFAULT_ROUTE);
    expect(parseRoute(null)).toEqual(DEFAULT_ROUTE);
    expect(parseRoute('#')).toEqual(DEFAULT_ROUTE);
    expect(parseRoute('#/configuracion')).toEqual(DEFAULT_ROUTE);
  });

  it('serializa ida y vuelta sin pérdidas', () => {
    const routes: AppRoute[] = [
      { section: 'tuner' },
      { section: 'chords', tab: 'dictionary' },
      { section: 'chords', tab: 'identify' },
      { section: 'metronome' },
      { section: 'tabs', subRoute: 'library' },
      { section: 'tabs', subRoute: 'practice' },
      { section: 'tabs', subRoute: 'editor' },
      { section: 'tabs', subRoute: 'scales' },
      { section: 'tabs', subRoute: 'catalogs' },
    ];
    for (const route of routes) {
      expect(parseRoute(routeToHash(route))).toEqual(route);
      expect(sameRoute(route, parseRoute(routeToHash(route)))).toBe(true);
    }
    for (const section of SECTION_ORDER) {
      expect(sectionRoute(section).section).toBe(section);
    }
  });
});
