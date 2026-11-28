// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { getFactoryExamples } from './factory-examples';
import {
  computeLoopTickRange,
  effectiveBpmAtSpeed,
  formatEffectiveTuningLabel,
  matchesFuzzyQuery,
  pickTrackIndexForInstrumentFilter,
  resolveSetlistAdjacent,
  transposeSpelledTuning,
} from './practice-state';
import { PPQ } from './rhythm';
import { findTuning } from '../music/tunings';

describe('Estado puro de Práctica (Spec 009)', () => {
  it('transpone afinaciones respetando ortografía y muestra la altura resultante', () => {
    const std = findTuning('guitar6-standard')!.notes;
    const flatOne = transposeSpelledTuning(std, -1);
    expect(flatOne[0]).toEqual({ letter: 'E', accidental: -1, octave: 2 });

    const label = formatEffectiveTuningLabel(std, 1, 0);
    expect(label).toContain('Capo 1');
    expect(label).toContain('F2');

    expect(effectiveBpmAtSpeed(120, 75)).toBe(90);
  });

  it('calcula rangos exactos de bucle A–B en ticks de PPQ = 960', () => {
    const dorian = getFactoryExamples()[4]!; // compases 4/4
    const range = computeLoopTickRange(dorian.masterBars, 1, 0); // orden invertido intencional
    expect(range?.startBarIndex).toBe(0);
    expect(range?.endBarIndex).toBe(1);
    expect(range?.startTick).toBe(0);
    expect(range?.endTick).toBe(2 * 4 * PPQ); // 7680
  });

  it('selecciona automáticamente la pista del instrumento filtrado y navega en Setlists', () => {
    const penta = getFactoryExamples()[1]!; // tiene guitarra + batería + pad
    expect(pickTrackIndexForInstrumentFilter(penta.tracks, 'drums')).toBe(1);
    expect(pickTrackIndexForInstrumentFilter(penta.tracks, 'guitar')).toBe(0);
    expect(pickTrackIndexForInstrumentFilter(penta.tracks, 'all')).toBe(0);

    const setlistIds = ['a', 'b', 'c'];
    expect(resolveSetlistAdjacent(setlistIds, 'a', -1)).toBeNull();
    expect(resolveSetlistAdjacent(setlistIds, 'a', 1)).toBe('b');
    expect(resolveSetlistAdjacent(setlistIds, 'c', 1)).toBeNull();

    expect(matchesFuzzyQuery(['Modo Dórico en Re', 'Endurend'], 'dorico re')).toBe(true);
    expect(matchesFuzzyQuery(['Modo Dórico en Re', 'Endurend'], 'frigio')).toBe(false);
  });
});
