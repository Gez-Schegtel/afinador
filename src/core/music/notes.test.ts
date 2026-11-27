import { describe, expect, it } from 'vitest';
import {
  clampA4,
  describeMidiNote,
  midiToFrequency,
  resolveChromaticNote,
} from './notes';

describe('Mapeo cromático estilo pedal y calibración A4', () => {
  it('recalcula exactamente notas de bajo y guitarra cuando A4 = 430 Hz', () => {
    // A4 = 430 Hz -> A2 (guitarra 5ª) = 107.50 Hz, A1 (bajo 3ª) = 53.75 Hz
    expect(midiToFrequency(69, 430)).toBeCloseTo(430, 6);
    expect(midiToFrequency(45, 430)).toBeCloseTo(107.5, 6);
    expect(midiToFrequency(33, 430)).toBeCloseTo(53.75, 6);
    // B0 (bajo 5ª cuerda, MIDI 23) a 430 Hz -> ~30.166 Hz
    expect(midiToFrequency(23, 430)).toBeCloseTo(30.1662, 3);

    const match = resolveChromaticNote(107.5, 430);
    expect(match.note.letter).toBe('A');
    expect(match.note.isSharp).toBe(false);
    expect(match.note.octave).toBe(2);
    expect(match.note.latinName).toBe('La');
    expect(match.cents).toBeCloseTo(0, 6);
    expect(match.direction).toBe('in-tune');
  });

  it('aplica tolerancia estricta de pedal (±1.0 cent) para centro exacto', () => {
    const e1Bass = midiToFrequency(28, 440); // ~41.2034 Hz

    const exact = resolveChromaticNote(e1Bass * Math.pow(2, 0.8 / 1200), 440);
    expect(exact.note.fullName).toBe('E1');
    expect(exact.direction).toBe('in-tune');

    const slightlyFlat = resolveChromaticNote(
      e1Bass * Math.pow(2, -1.2 / 1200),
      440
    );
    expect(slightlyFlat.direction).toBe('flat');
    expect(slightlyFlat.isNearCenter).toBe(true);

    const slightlySharp = resolveChromaticNote(
      e1Bass * Math.pow(2, 1.2 / 1200),
      440
    );
    expect(slightlySharp.direction).toBe('sharp');
    expect(slightlySharp.isNearCenter).toBe(true);
  });

  it('identifica correctamente notas sostenidas con indicador isSharp', () => {
    const fSharp3 = midiToFrequency(54, 440);
    const match = resolveChromaticNote(fSharp3, 440);
    expect(match.note.letter).toBe('F');
    expect(match.note.isSharp).toBe(true);
    expect(match.note.fullName).toBe('F♯3');
    expect(match.note.latinName).toBe('Fa♯');
  });

  it('acota valores fuera de rango en clampA4 conservando décimas de Hz', () => {
    expect(clampA4(430)).toBe(430);
    expect(clampA4(430.5)).toBe(430.5);
    expect(clampA4(300)).toBe(415);
    expect(clampA4(600)).toBe(466);
    expect(describeMidiNote(69, 432).frequency).toBeCloseTo(432, 6);
  });
});
