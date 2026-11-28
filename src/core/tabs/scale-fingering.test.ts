// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findScale } from '../music/scales';
import { mod12, parsePitchName, pitchClassOf } from '../music/spelling';
import { findTuning } from '../music/tunings';
import { computeScaleFingering, type FingeringSystem } from './scale-fingering';

describe('Algoritmos determinísticos de digitación de escalas y arpegios (Spec 010)', () => {
  const instruments = [
    'guitar6-standard',
    'guitar6-drop-d',
    'guitar6-half-down',
    'guitar7-standard',
    'guitar8-standard',
    'bass4-standard',
    'bass5-standard',
  ];

  it('produce notas pertenecientes a la escala en orden MIDI estrictamente ascendente', () => {
    const dorian = findScale('dorian')!;
    const penta = findScale('pentatonic-minor')!;
    const rootD = parsePitchName('D');
    const rootA = parsePitchName('A');

    for (const tuningId of instruments) {
      const tuning = findTuning(tuningId)!;
      const systems: FingeringSystem[] = ['caged', '3nps', 'two-octaves', 'single-string'];

      for (const system of systems) {
        const scale = system === 'caged' ? penta : dorian;
        const root = system === 'caged' ? rootA : rootD;
        const allowedPcs = new Set(scale.intervals.map((i) => mod12(pitchClassOf(root) + i)));
        const notes = computeScaleFingering({
          tuning: tuning.notes,
          root,
          scale,
          system,
          position: 1,
          stringIndex: 0,
        });

        expect(notes.length, `${tuningId} ${system}`).toBeGreaterThanOrEqual(5);
        for (let i = 0; i < notes.length; i++) {
          const n = notes[i]!;
          expect(n.stringIndex).toBeGreaterThanOrEqual(0);
          expect(n.stringIndex).toBeLessThan(tuning.notes.length);
          expect(n.fret).toBeGreaterThanOrEqual(0);
          expect(n.fret).toBeLessThanOrEqual(24);
          expect(allowedPcs.has(mod12(n.midi))).toBe(true);
          if (i > 0) {
            expect(n.midi).toBeGreaterThan(notes[i - 1]!.midi);
          }
        }
      }
    }
  });

  it('mantiene 3 notas por cuerda ergonómicas en 3NPS y construye arpegios Sweep Picking válidos', () => {
    const ionian = findScale('ionian')!;
    const guitar = findTuning('guitar6-standard')!;
    const notes3nps = computeScaleFingering({
      tuning: guitar.notes,
      root: parsePitchName('C'),
      scale: ionian,
      system: '3nps',
      position: 1,
    });

    // 6 cuerdas * 3 notas = 18 notas
    expect(notes3nps).toHaveLength(18);
    for (let s = 0; s < 6; s++) {
      const onStr = notes3nps.filter((n) => n.stringIndex === s);
      expect(onStr).toHaveLength(3);
      expect(onStr[2]!.fret - onStr[0]!.fret).toBeLessThanOrEqual(5);
    }

    const arpMin7 = findScale('arp-m7')!;
    const sweep = computeScaleFingering({
      tuning: guitar.notes,
      root: parsePitchName('A'),
      scale: arpMin7,
      system: 'sweep',
      position: 1,
      sweepStrings: 5,
    });
    expect(sweep.length).toBeGreaterThanOrEqual(5);
    expect(sweep[0]?.role).toBe('root');
  });
});
