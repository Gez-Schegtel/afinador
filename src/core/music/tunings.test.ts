import { describe, expect, it } from 'vitest';
import { TARGET_NOTE_MAX_MIDI, TARGET_NOTE_MIN_MIDI } from './notes';
import { pitchClassOf, spelledToMidi } from './spelling';
import {
  INSTRUMENTS,
  TUNINGS,
  changesFromStandard,
  findTuning,
  getInstrument,
  raisesTension,
  resolveTuningSelection,
  spellingForMidi,
  standardTuningFor,
  tuningMidis,
  uniformShiftFromStandard,
  tuningsForInstrument,
  type TuningDefinition,
} from './tunings';

/** Tabla de referencia del Spec 002 §2.3 (MIDI de grave a agudo). */
const EXPECTED_MIDIS: Readonly<Record<string, readonly number[]>> = {
  'guitar6-standard': [40, 45, 50, 55, 59, 64],
  'guitar6-half-down': [39, 44, 49, 54, 58, 63],
  'guitar6-whole-down': [38, 43, 48, 53, 57, 62],
  'guitar6-c-sharp-standard': [37, 42, 47, 52, 56, 61],
  'guitar6-c-standard': [36, 41, 46, 51, 55, 60],
  'guitar6-drop-d': [38, 45, 50, 55, 59, 64],
  'guitar6-drop-c-sharp': [37, 44, 49, 54, 58, 63],
  'guitar6-drop-c': [36, 43, 48, 53, 57, 62],
  'guitar6-drop-b': [35, 42, 47, 52, 56, 61],
  'guitar6-double-drop-d': [38, 45, 50, 55, 59, 62],
  'guitar6-open-d': [38, 45, 50, 54, 57, 62],
  'guitar6-open-d-minor': [38, 45, 50, 53, 57, 62],
  'guitar6-open-g': [38, 43, 50, 55, 59, 62],
  'guitar6-open-c': [36, 43, 48, 55, 60, 64],
  'guitar6-open-e': [40, 47, 52, 56, 59, 64],
  'guitar6-open-a': [40, 45, 52, 57, 61, 64],
  'guitar6-dadgad': [38, 45, 50, 55, 57, 62],
  'guitar7-standard': [35, 40, 45, 50, 55, 59, 64],
  'guitar7-half-down': [34, 39, 44, 49, 54, 58, 63],
  'guitar7-whole-down': [33, 38, 43, 48, 53, 57, 62],
  'guitar7-drop-a': [33, 40, 45, 50, 55, 59, 64],
  'guitar8-standard': [30, 35, 40, 45, 50, 55, 59, 64],
  'guitar8-drop-e': [28, 35, 40, 45, 50, 55, 59, 64],
  'bass4-standard': [28, 33, 38, 43],
  'bass4-half-down': [27, 32, 37, 42],
  'bass4-whole-down': [26, 31, 36, 41],
  'bass4-drop-d': [26, 33, 38, 43],
  'bass4-drop-c': [24, 31, 36, 41],
  'bass4-bead': [23, 28, 33, 38],
  'bass5-standard': [23, 28, 33, 38, 43],
  'bass5-half-down': [22, 27, 32, 37, 42],
  'bass5-drop-a': [21, 28, 33, 38, 43],
  'bass5-eadgc': [28, 33, 38, 43, 48],
  'bass6-standard': [23, 28, 33, 38, 43, 48],
};

/** Tríada (clases de altura) que forman las cuerdas al aire de las afinaciones abiertas. */
const OPEN_CHORDS: Readonly<Record<string, readonly number[]>> = {
  'guitar6-open-d': [2, 6, 9], // D F♯ A — Re mayor
  'guitar6-open-d-minor': [2, 5, 9], // D F A — Re menor
  'guitar6-open-g': [7, 11, 2], // G B D — Sol mayor
  'guitar6-open-c': [0, 4, 7], // C E G — Do mayor
  'guitar6-open-e': [4, 8, 11], // E G♯ B — Mi mayor
  'guitar6-open-a': [9, 1, 4], // A C♯ E — La mayor
  'guitar6-dadgad': [2, 7, 9], // D G A — Dsus4
};

function pitchClassSet(t: TuningDefinition): Set<number> {
  return new Set(t.notes.map(pitchClassOf));
}

describe('Catálogo de afinaciones (Spec 002)', () => {
  it('coincide exactamente con la tabla MIDI del spec', () => {
    expect(TUNINGS.map((t) => t.id).sort()).toEqual(
      Object.keys(EXPECTED_MIDIS).sort()
    );
    for (const t of TUNINGS) {
      expect(tuningMidis(t), t.id).toEqual(EXPECTED_MIDIS[t.id]);
    }
  });

  it('tiene ids únicos, una única Estándar por instrumento y la cantidad de cuerdas correcta', () => {
    expect(new Set(TUNINGS.map((t) => t.id)).size).toBe(TUNINGS.length);
    for (const inst of INSTRUMENTS) {
      const list = tuningsForInstrument(inst.id);
      expect(list.filter((t) => t.name === 'Estándar')).toHaveLength(1);
      expect(standardTuningFor(inst.id).name).toBe('Estándar');
      for (const t of list) {
        expect(t.notes, t.id).toHaveLength(getInstrument(inst.id).stringCount);
      }
    }
  });

  it('ordena las cuerdas de grave a agudo dentro del rango A0–B5', () => {
    for (const t of TUNINGS) {
      const midis = tuningMidis(t);
      for (let i = 1; i < midis.length; i++) {
        expect(midis[i]!, t.id).toBeGreaterThan(midis[i - 1]!);
      }
      expect(Math.min(...midis)).toBeGreaterThanOrEqual(TARGET_NOTE_MIN_MIDI);
      expect(Math.max(...midis)).toBeLessThanOrEqual(TARGET_NOTE_MAX_MIDI);
    }
  });

  it('nunca mezcla sostenidos y bemoles dentro de una misma afinación', () => {
    for (const t of TUNINGS) {
      const hasSharp = t.notes.some((n) => n.accidental > 0);
      const hasFlat = t.notes.some((n) => n.accidental < 0);
      expect(hasSharp && hasFlat, t.id).toBe(false);
    }
  });

  it('las Drop forman fundamental – quinta justa – octava en las 3 cuerdas graves', () => {
    for (const t of TUNINGS.filter((x) => x.group === 'drop')) {
      const [low, second, third] = tuningMidis(t);
      expect(second! - low!, t.id).toBe(7);
      expect(third! - low!, t.id).toBe(12);
    }
  });

  it('las abiertas forman exactamente la tríada declarada', () => {
    for (const [id, pcs] of Object.entries(OPEN_CHORDS)) {
      const t = findTuning(id)!;
      expect(pitchClassSet(t), id).toEqual(new Set(pcs));
    }
  });

  it('las bajadas uniformes conservan los intervalos de la estándar', () => {
    for (const t of TUNINGS.filter((x) => x.group === 'standard')) {
      const std = tuningMidis(standardTuningFor(t.instrument));
      const midis = tuningMidis(t);
      const shift = midis[0]! - std[0]!;
      expect(midis.map((m, i) => m - std[i]!), t.id).toEqual(
        midis.map(() => shift)
      );
    }
  });

  it('detecta las bajadas uniformes', () => {
    expect(uniformShiftFromStandard(findTuning('guitar6-half-down')!)).toBe(-1);
    expect(uniformShiftFromStandard(findTuning('guitar7-whole-down')!)).toBe(-2);
    expect(uniformShiftFromStandard(findTuning('bass5-eadgc')!)).toBe(5);
    expect(uniformShiftFromStandard(findTuning('guitar6-standard')!)).toBe(0);
    expect(uniformShiftFromStandard(findTuning('guitar6-drop-d')!)).toBeNull();
  });

  it('calcula los cambios respecto de la estándar y la regla de tensión', () => {
    const dropD = findTuning('guitar6-drop-d')!;
    expect(changesFromStandard(dropD)).toEqual([
      expect.objectContaining({ index: 0, stringNumber: 6, semitones: -2 }),
    ]);

    const raising = TUNINGS.filter(raisesTension).map((t) => t.id).sort();
    expect(raising).toEqual(
      ['guitar6-open-a', 'guitar6-open-c', 'guitar6-open-e'].sort()
    );

    const openC = findTuning('guitar6-open-c')!;
    expect(
      changesFromStandard(openC).find((c) => c.stringNumber === 2)?.semitones
    ).toBe(1);

    // Los juegos dedicados nunca se marcan como «sube la tensión».
    expect(raisesTension(findTuning('bass5-eadgc')!)).toBe(false);
    expect(raisesTension(findTuning('bass4-bead')!)).toBe(false);
  });

  it('devuelve la ortografía de la cuerda objetivo', () => {
    const halfDown = findTuning('guitar6-half-down')!;
    expect(spellingForMidi(halfDown, 39)).toEqual({ letter: 'E', accidental: -1 });
    expect(spellingForMidi(halfDown, 40)).toBeNull();
    expect(spelledToMidi(halfDown.notes[0]!)).toBe(39);
  });

  it('valida valores persistidos con fallback a la estándar', () => {
    expect(resolveTuningSelection('bass5', 'bass5-drop-a').tuning.id).toBe(
      'bass5-drop-a'
    );
    expect(resolveTuningSelection('bass5', 'guitar6-drop-d').tuning.id).toBe(
      'bass5-standard'
    );
    expect(resolveTuningSelection('ukelele', 'x')).toEqual({
      instrument: 'guitar6',
      tuning: standardTuningFor('guitar6'),
    });
  });
});
