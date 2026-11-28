// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DICTIONARY_ROOTS } from './chords';
import { formatPitchName, mod12, pitchClassOf } from './spelling';
import { SCALES_CATALOG, findScale, spellScale } from './scales';

describe('Catálogo de escalas, modos y arpegios (Spec 010)', () => {
  it('contiene todos los modos griegos, menor armónica, menor melódica, exóticas y arpegios con fórmulas consistentes', () => {
    const ids = new Set(SCALES_CATALOG.map((s) => s.id));
    expect(ids.size).toBe(SCALES_CATALOG.length);

    expect(findScale('dorian')?.intervals).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(findScale('dorian')?.characteristicDegrees).toEqual(['6']);
    expect(findScale('lydian')?.characteristicDegrees).toEqual(['♯4']);
    expect(findScale('phrygian-dominant')?.intervals).toEqual([0, 1, 4, 5, 7, 8, 10]);
    expect(findScale('altered')?.intervals).toEqual([0, 1, 3, 4, 6, 8, 10]);
    expect(findScale('arp-dim7')?.intervals).toEqual([0, 3, 6, 9]);

    for (const def of SCALES_CATALOG) {
      expect(def.degreeLabels).toHaveLength(def.intervals.length);
      for (const charDeg of def.characteristicDegrees) {
        expect(def.degreeLabels).toContain(charDeg);
      }
    }
  });

  it('calcula ortografías exactas y nunca falla ni produce triples alteraciones en las 17 raíces × catálogo', () => {
    const cMinHarm = spellScale({ letter: 'C', accidental: 0 }, findScale('harmonic-minor')!);
    expect(cMinHarm.map(formatPitchName)).toEqual(['C', 'D', 'E♭', 'F', 'G', 'A♭', 'B']);

    const ePhrygDom = spellScale({ letter: 'E', accidental: 0 }, findScale('phrygian-dominant')!);
    expect(ePhrygDom.map(formatPitchName)).toEqual(['E', 'F', 'G♯', 'A', 'B', 'C', 'D']);

    for (const root of DICTIONARY_ROOTS) {
      const rootPc = pitchClassOf(root);
      for (const def of SCALES_CATALOG) {
        const spelled = spellScale(root, def);
        expect(spelled).toHaveLength(def.intervals.length);
        spelled.forEach((note, idx) => {
          expect(pitchClassOf(note)).toBe(mod12(rootPc + def.intervals[idx]!));
          expect(Math.abs(note.accidental)).toBeLessThanOrEqual(2);
        });
      }
    }
  });
});
