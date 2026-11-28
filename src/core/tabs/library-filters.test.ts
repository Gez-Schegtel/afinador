// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { getFactoryExamples } from './factory-examples';
import {
  DEFAULT_LIBRARY_FILTERS,
  filterLibraryEntries,
  resolveTrackForInstrumentFilter,
} from './library-filters';
import { createMemoryTabsBackend, TabsLibraryService } from '../../storage/tabs-db';

describe('Filtro persistente de instrumento y filtros combinados (Spec 011)', () => {
  it('filtra por instrumento, oculta piezas incompatibles y selecciona la pista correcta al abrir', async () => {
    const lib = new TabsLibraryService(createMemoryTabsBackend());
    const entries = await lib.listLibraryEntries();
    const examples = getFactoryExamples();

    const bassOnly = filterLibraryEntries(entries, {
      ...DEFAULT_LIBRARY_FILTERS,
      instrumentFilter: 'bass',
    });
    expect(bassOnly.some((e) => e.id === 'factory-16-bass-dorian')).toBe(true);
    expect(bassOnly.every((e) => e.families.includes('bass'))).toBe(true);

    // En la pieza con Guitarra + Bajo/Acompañamiento o Groove de Bajo, selecciona el índice correcto
    const bassGroove = examples.find((d) => d.id === 'factory-16-bass-dorian')!;
    expect(resolveTrackForInstrumentFilter(bassGroove, 'bass')).toBe(0);
    expect(resolveTrackForInstrumentFilter(bassGroove, 'drums')).toBe(1);

    const dorianGtr = examples.find((d) => d.id === 'factory-05-dorian-d')!;
    expect(resolveTrackForInstrumentFilter(dorianGtr, 'drums')).toBe(1);
    expect(resolveTrackForInstrumentFilter(dorianGtr, 'keyboard')).toBe(2);

    const multiWithBass = {
      ...dorianGtr,
      tracks: [
        dorianGtr.tracks[0]!,
        dorianGtr.tracks[1]!,
        { ...dorianGtr.tracks[2]!, family: 'bass' as const },
      ],
    };
    expect(resolveTrackForInstrumentFilter(multiWithBass, 'bass')).toBe(2);

    const fastOnly = filterLibraryEntries(entries, {
      ...DEFAULT_LIBRARY_FILTERS,
      minBpm: 115,
      maxBpm: 130,
    });
    expect(fastOnly.length).toBeGreaterThan(0);
    expect(fastOnly.every((e) => e.bpm >= 115 && e.bpm <= 130)).toBe(true);
  });
});
