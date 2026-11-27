// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES,
  DICTIONARY_ROOTS,
  canOmitFifth,
  chordPitchClasses,
  findQuality,
  perfectFifthPitchClass,
  requiredPitchClasses,
} from './chords';
import { mod12, parsePitchName, pitchClassOf } from './spelling';
import { findTuning, standardTuningFor, tuningMidis } from './tunings';
import {
  MAX_FINGERS,
  fingering,
  generateAllVoicings,
  generateVoicings,
  voicingTab,
  type Voicing,
} from './voicings';

const STANDARD = tuningMidis(standardTuningFor('guitar6'));

/** Formas de referencia del Spec 003 §2.3 (guitarra estándar, primera posición). */
const REFERENCE_SHAPES: ReadonlyArray<[string, string, string]> = [
  ['C', 'maj', 'x32010'],
  ['A', 'maj', 'x02220'],
  ['G', 'maj', '320003'],
  ['E', 'maj', '022100'],
  ['D', 'maj', 'xx0232'],
  ['A', 'min', 'x02210'],
  ['E', 'min', '022000'],
  ['D', 'min', 'xx0231'],
  ['F', 'maj', '133211'],
  ['B', 'min', 'x24432'],
  ['C', '7', 'x32310'],
  ['G', '7', '320001'],
  ['A', '7', 'x02020'],
  ['D', '7', 'xx0212'],
  ['E', '7', '020100'],
  ['A', 'm7', 'x02010'],
  ['E', 'm7', '020000'],
  ['D', 'm7', 'xx0211'],
  ['C', 'maj7', 'x32000'],
  ['D', 'sus4', 'xx0233'],
  ['D', 'sus2', 'xx0230'],
  ['A', 'sus4', 'x02230'],
  ['A', 'sus2', 'x02200'],
];

function checkRules(
  v: Voicing,
  tuning: readonly number[],
  rootPc: number,
  chordPcs: Set<number>,
  required: number[],
  fifthPc: number | null
) {
  const soundingIdx = v.frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  const pcs = soundingIdx.map((i) => mod12(tuning[i]! + v.frets[i]!));
  // 1. Toda nota pertenece al acorde.
  for (const pc of pcs) expect(chordPcs.has(pc)).toBe(true);
  // 2. Están las notas imprescindibles (solo la quinta justa puede faltar).
  for (const pc of required) expect(pcs).toContain(pc);
  if (v.omitsFifth) expect(fifthPc).not.toBeNull();
  // 3. Posición fundamental.
  expect(pcs[0]).toBe(rootPc);
  // 4. Tocabilidad.
  const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
  if (fretted.length > 0) {
    expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
  }
  if (v.frets.some((f) => f === 0)) {
    expect(Math.max(0, ...fretted)).toBeLessThanOrEqual(4);
  }
  expect(v.fingers).toBeLessThanOrEqual(MAX_FINGERS);
  expect(fingering(v.frets).fingers).toBe(v.fingers);
  const first = soundingIdx[0]!;
  const last = soundingIdx[soundingIdx.length - 1]!;
  const gaps = v.frets.slice(first, last + 1).filter((f) => f === null).length;
  expect(gaps).toBeLessThanOrEqual(1);
  expect(Math.max(...v.frets.map((f) => f ?? 0))).toBeLessThanOrEqual(15);
}

describe('Generador de digitaciones (Spec 003)', () => {
  it('produce todas las formas de referencia entre las digitaciones mostradas', () => {
    for (const [root, qualityId, shape] of REFERENCE_SHAPES) {
      const shown = generateVoicings(STANDARD, parsePitchName(root), findQuality(qualityId)!);
      expect(shown.map((v) => voicingTab(v.frets)), `${root}${qualityId}`).toContain(shape);
    }
  });

  it('cumple todas las reglas en 17 raíces × 20 tipos (guitarra estándar)', () => {
    let total = 0;
    let chordsWithoutVoicings = 0;
    for (const root of DICTIONARY_ROOTS) {
      for (const q of CHORD_QUALITIES) {
        const chordPcs = new Set(chordPitchClasses(root, q));
        const required = requiredPitchClasses(root, q);
        const fifthPc = canOmitFifth(q) ? perfectFifthPitchClass(root, q) : null;
        const all = generateAllVoicings(STANDARD, root, q);
        if (all.length === 0) chordsWithoutVoicings++;
        for (const v of all) {
          checkRules(v, STANDARD, pitchClassOf(root), chordPcs, required, fifthPc);
          // Con 4 o más cuerdas sonando (2 en el acorde de quinta).
          const sounding = v.frets.filter((f) => f !== null).length;
          expect(sounding).toBeGreaterThanOrEqual(q.intervals.length <= 2 ? 2 : 4);
          total++;
        }
      }
    }
    expect(total).toBeGreaterThan(1000);
    expect(chordsWithoutVoicings).toBe(0);
  });

  it('ordena por posición y recorta a 2 por posición y 12 en total', () => {
    const shown = generateVoicings(STANDARD, parsePitchName('C'), findQuality('maj')!);
    expect(shown.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]!.position).toBeGreaterThanOrEqual(shown[i - 1]!.position);
    }
    const perPosition = new Map<number, number>();
    for (const v of shown) perPosition.set(v.position, (perPosition.get(v.position) ?? 0) + 1);
    for (const count of perPosition.values()) expect(count).toBeLessThanOrEqual(2);
    expect(shown[0]!.position).toBe(0);
    expect(voicingTab(shown[0]!.frets)).toBe('x32010');
  });

  it('detecta la cejilla y escribe el cifrado con trastes de dos cifras', () => {
    expect(fingering([1, 3, 3, 2, 1, 1])).toEqual({
      fingers: 4,
      barre: { fret: 1, fromString: 0, toString: 5 },
    });
    // Una cuerda al aire bajo la cejilla la invalida.
    expect(fingering([null, 2, 0, 4, 3, 2]).barre).toBeNull();
    expect(voicingTab([null, 10, 12, 12, 11, 10])).toBe('x-10-12-12-11-10');
    expect(voicingTab([null, 3, 2, 0, 1, 0])).toBe('x32010');
  });

  it('funciona en guitarra de 7 cuerdas (B estándar)', () => {
    const seven = tuningMidis(findTuning('guitar7-standard')!);
    const shown = generateVoicings(seven, parsePitchName('B'), findQuality('5')!);
    expect(shown.length).toBeGreaterThan(0);
    // B5 al aire sobre la 7ª cuerda: B1 + F♯2 (traste 2 de la 6ª).
    const all = generateAllVoicings(seven, parsePitchName('B'), findQuality('5')!);
    expect(all.map((v) => voicingTab(v.frets))).toContain('02xxxxx');
  });
});
