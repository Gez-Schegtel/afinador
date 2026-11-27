// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  TARGET_NOTE_MAX_MIDI,
  TARGET_NOTE_MIN_MIDI,
  clampA4,
  describeMidiNote,
  midiFromNoteAndOctave,
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

  it('mantiene forcedMidi en modo Manual aunque la cuerda esté -800 cents abajo', () => {
    const g3 = midiToFrequency(55, 440); // 196 Hz
    // Cuerda extremadamente floja 8 semitonos por debajo de G3
    const veryFlatG3 = g3 * Math.pow(2, -800 / 1200);
    const manualMatch = resolveChromaticNote(veryFlatG3, 440, undefined, 55);

    expect(manualMatch.note.midi).toBe(55);
    expect(manualMatch.note.fullName).toBe('G3');
    expect(manualMatch.cents).toBeCloseTo(-800, 4);
    expect(manualMatch.clampedCents).toBe(-50);
    expect(manualMatch.direction).toBe('flat');
  });

  it('usa la ortografía de la cuerda objetivo en modo Manual (E♭2 en vez de D♯2)', () => {
    const eFlat2 = midiToFrequency(39, 440); // 77.78 Hz
    const spelled = resolveChromaticNote(eFlat2, 440, undefined, 39, {
      letter: 'E',
      accidental: -1,
    });
    expect(spelled.note.fullName).toBe('E♭2');
    expect(spelled.note.latinName).toBe('Mi♭');
    expect(spelled.note.accidental).toBe(-1);
    expect(spelled.note.isSharp).toBe(false);
    expect(spelled.cents).toBeCloseTo(0, 6);

    // Sin ortografía forzada (o en Automático) se mantienen los sostenidos.
    expect(resolveChromaticNote(eFlat2, 440, undefined, 39).note.fullName).toBe('D♯2');
    expect(
      resolveChromaticNote(eFlat2, 440, undefined, null, {
        letter: 'E',
        accidental: -1,
      }).note.fullName
    ).toBe('D♯2');
    // Una ortografía que no corresponde a la nota se ignora.
    expect(
      describeMidiNote(40, 440, { letter: 'E', accidental: -1 }).fullName
    ).toBe('E2');
  });

  it('convierte Nota + Octava con clamp seguro en octava 0 (A0 mínimo) y cubre el catálogo A0..B5 completo', () => {
    expect(midiFromNoteAndOctave(4, 2)).toBe(40); // E2
    expect(midiFromNoteAndOctave(11, 0)).toBe(23); // B0
    // Notas debajo de A0 en octava 0 se acotan a A0 (MIDI 21)
    expect(midiFromNoteAndOctave(0, 0)).toBe(TARGET_NOTE_MIN_MIDI);

    // El catálogo Nota + Octava cubre A0..B5 completo y sin huecos.
    for (let m = TARGET_NOTE_MIN_MIDI; m <= TARGET_NOTE_MAX_MIDI; m++) {
      const octave = Math.floor(m / 12) - 1;
      expect(midiFromNoteAndOctave(m % 12, octave)).toBe(m);
    }
  });
});
