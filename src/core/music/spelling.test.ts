// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  defaultSharpSpelling,
  formatPitchName,
  formatSpelledNote,
  latinPitchName,
  parsePitchName,
  parseSpelledNote,
  pitchClassOf,
  spellMidi,
  spelledToMidi,
  totalAccidentals,
} from './spelling';

describe('Ortografía de notas (notación científica de altura)', () => {
  it('convierte a MIDI con C4 = 60 y A4 = 69', () => {
    expect(spelledToMidi(parseSpelledNote('C4'))).toBe(60);
    expect(spelledToMidi(parseSpelledNote('A4'))).toBe(69);
    expect(spelledToMidi(parseSpelledNote('A0'))).toBe(21);
    expect(spelledToMidi(parseSpelledNote('E2'))).toBe(40);
    expect(spelledToMidi(parseSpelledNote('Eb2'))).toBe(39);
    expect(spelledToMidi(parseSpelledNote('F♯1'))).toBe(30);
  });

  it('asocia la octava a la letra escrita en los bordes B/C', () => {
    expect(spelledToMidi(parseSpelledNote('Cb4'))).toBe(59); // suena como B3
    expect(spelledToMidi(parseSpelledNote('B#3'))).toBe(60); // suena como C4
    expect(formatSpelledNote(spellMidi(59, parsePitchName('Cb')))).toBe('C♭4');
    expect(formatSpelledNote(spellMidi(60, parsePitchName('B#')))).toBe('B♯3');
  });

  it('soporta dobles alteraciones', () => {
    expect(spelledToMidi(parseSpelledNote('F##4'))).toBe(67);
    expect(spelledToMidi(parseSpelledNote('F𝄪4'))).toBe(67);
    expect(spelledToMidi(parseSpelledNote('Fx4'))).toBe(67);
    expect(spelledToMidi(parseSpelledNote('Bbb3'))).toBe(57);
    expect(spelledToMidi(parseSpelledNote('B𝄫3'))).toBe(57);
    expect(formatPitchName(parsePitchName('Bbb'))).toBe('B𝄫');
    expect(formatPitchName(parsePitchName('F##'))).toBe('F𝄪');
  });

  it('formatea nombres latinos y clases de altura', () => {
    expect(latinPitchName(parsePitchName('Eb'))).toBe('Mi♭');
    expect(latinPitchName(parsePitchName('G#'))).toBe('Sol♯');
    expect(pitchClassOf(parsePitchName('E#'))).toBe(5);
    expect(pitchClassOf(parsePitchName('Cb'))).toBe(11);
    expect(totalAccidentals([parsePitchName('D#'), parsePitchName('F##')])).toBe(3);
  });

  it('usa sostenidos como ortografía por defecto', () => {
    expect(formatSpelledNote(defaultSharpSpelling(61))).toBe('C♯4');
    expect(formatSpelledNote(defaultSharpSpelling(39))).toBe('D♯2');
    expect(formatSpelledNote(defaultSharpSpelling(21))).toBe('A0');
  });

  it('rechaza nombres inválidos y ortografías que no corresponden al MIDI', () => {
    expect(() => parseSpelledNote('H2')).toThrow();
    expect(() => parseSpelledNote('E')).toThrow();
    expect(() => parsePitchName('E2')).toThrow();
    expect(() => spellMidi(40, parsePitchName('Eb'))).toThrow();
  });
});
