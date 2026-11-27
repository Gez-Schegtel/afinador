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

describe('Rutas por hash (Spec 006)', () => {
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
