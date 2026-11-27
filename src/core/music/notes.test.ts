import { describe, expect, it } from 'vitest';
import {
  clampA4,
  describeMidiNote,
  midiToFrequency,
  resolveChromaticNote,
} from './notes';

describe('Mapeo cromático estilo pedal con histéresis Schmitt trigger', () => {
  it('recalcula exactamente notas de bajo y guitarra cuando A4 = 430 Hz', () => {
    expect(midiToFrequency(69, 430)).toBeCloseTo(430, 6);
    expect(midiToFrequency(45, 430)).toBeCloseTo(107.5, 6);
    expect(midiToFrequency(33, 430)).toBeCloseTo(53.75, 6);
    expect(midiToFrequency(23, 430)).toBeCloseTo(30.1662, 3);

    const match = resolveChromaticNote(107.5, 430);
    expect(match.note.letter).toBe('A');
    expect(match.note.octave).toBe(2);
    expect(match.cents).toBeCloseTo(0, 6);
    expect(match.direction).toBe('in-tune');
  });

  it('entra en AFINADO a ±2.5 cents y se mantiene clavado con histéresis hasta ±4.0 cents', () => {
    const e2 = midiToFrequency(40, 440); // 82.41 Hz

    // A +2.2 cents entra en AFINADO
    const locked = resolveChromaticNote(e2 * Math.pow(2, 2.2 / 1200), 440);
    expect(locked.direction).toBe('in-tune');

    // Si la cuerda oscila a +3.4 cents estando ya en AFINADO, NO pierde el estado AFINADO
    const stillLocked = resolveChromaticNote(
      e2 * Math.pow(2, 3.4 / 1200),
      440,
      {
        previousMidi: locked.note.midi,
        previousDirection: locked.direction,
      }
    );
    expect(stillLocked.direction).toBe('in-tune');

    // Recién al superar ±4.0 cents (ej. +4.4 cents) pasa a ALTO
    const unlocked = resolveChromaticNote(e2 * Math.pow(2, 4.4 / 1200), 440, {
      previousMidi: stillLocked.note.midi,
      previousDirection: stillLocked.direction,
    });
    expect(unlocked.direction).toBe('sharp');
  });

  it('evita parpadeo entre notas vecinas cerca de ±50 cents gracias a la histéresis de nota', () => {
    const e2 = midiToFrequency(40, 440);
    // +53 cents por encima de E2: sin historial elegiría F2 (MIDI 41), pero viniendo de E2 mantiene E2 hasta +56 ct
    const heldOnE2 = resolveChromaticNote(e2 * Math.pow(2, 53 / 1200), 440, {
      previousMidi: 40,
      previousDirection: 'sharp',
    });
    expect(heldOnE2.note.midi).toBe(40);
    expect(heldOnE2.note.fullName).toBe('E2');
  });

  it('acota valores fuera de rango en clampA4', () => {
    expect(clampA4(430)).toBe(430);
    expect(clampA4(430.5)).toBe(430.5);
    expect(clampA4(300)).toBe(415);
    expect(clampA4(600)).toBe(466);
    expect(describeMidiNote(69, 432).frequency).toBeCloseTo(432, 6);
  });
});
