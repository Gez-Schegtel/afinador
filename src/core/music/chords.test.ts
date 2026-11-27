// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES,
  DICTIONARY_ROOTS,
  chordNameEs,
  chordSymbol,
  findQuality,
  formulaLabels,
  moreCommonEnharmonic,
  simplestSpellings,
  spellChord,
} from './chords';
import { interval, intervalLabel, transpose } from './intervals';
import {
  LETTERS,
  formatPitchName,
  letterIndex,
  mod12,
  parsePitchName,
  pitchClassOf,
} from './spelling';

const spell = (root: string, qualityId: string) =>
  spellChord(parsePitchName(root), findQuality(qualityId)!)
    .map(formatPitchName)
    .join(' ');

describe('Intervalos con ortografía', () => {
  it('etiqueta y transpone avanzando letras', () => {
    expect(intervalLabel(interval('b3'))).toBe('♭3');
    expect(intervalLabel(interval('#5'))).toBe('♯5');
    expect(intervalLabel(interval('bb7'))).toBe('𝄫7');
    expect(interval('9').semitones).toBe(14);
    expect(formatPitchName(transpose(parsePitchName('C'), interval('b3')))).toBe('E♭');
    expect(formatPitchName(transpose(parsePitchName('C'), interval('bb7')))).toBe('B𝄫');
    expect(formatPitchName(transpose(parsePitchName('E'), interval('#5')))).toBe('B♯');
  });
});

describe('Ortografía de acordes (Spec 003)', () => {
  it('escribe correctamente los acordes de referencia', () => {
    expect(spell('C', 'dim7')).toBe('C E♭ G♭ B𝄫');
    expect(spell('Db', 'maj')).toBe('D♭ F A♭');
    expect(spell('F#', 'maj')).toBe('F♯ A♯ C♯');
    expect(spell('B', 'dim')).toBe('B D F');
    expect(spell('E', 'aug')).toBe('E G♯ B♯');
    expect(spell('G', '7')).toBe('G B D F');
    expect(spell('B', 'm7b5')).toBe('B D F A');
    expect(spell('Ab', 'maj7')).toBe('A♭ C E♭ G');
    expect(spell('Eb', 'min')).toBe('E♭ G♭ B♭');
    expect(spell('G', 'sus4')).toBe('G C D');
    expect(spell('D', '6')).toBe('D F♯ A B');
    expect(spell('D#', 'maj')).toBe('D♯ F𝄪 A♯');
    expect(spell('Gb', 'min')).toBe('G♭ B𝄫 D♭');
    expect(spell('C#', 'dim7')).toBe('C♯ E G B♭');
    expect(spell('F', 'm9')).toBe('F A♭ C E♭ G');
    expect(spell('A', 'add9')).toBe('A C♯ E B');
    expect(spell('Bb', '7sus4')).toBe('B♭ E♭ F A♭');
    expect(spell('E', 'mMaj7')).toBe('E G B D♯');
    expect(spell('C', '5')).toBe('C G');
  });

  it('barrido 17 raíces × 20 tipos: letras por número de intervalo y clases de altura exactas', () => {
    let doubleAccidentals = 0;
    for (const root of DICTIONARY_ROOTS) {
      for (const q of CHORD_QUALITIES) {
        const notes = spellChord(root, q);
        q.intervals.forEach((iv, i) => {
          const note = notes[i]!;
          // La letra avanza (número − 1) pasos desde la raíz.
          expect(letterIndex(note.letter)).toBe(
            (letterIndex(root.letter) + iv.degree - 1) % LETTERS.length
          );
          // La clase de altura coincide con los semitonos.
          expect(pitchClassOf(note)).toBe(mod12(pitchClassOf(root) + iv.semitones));
          expect(Math.abs(note.accidental)).toBeLessThanOrEqual(2);
        });
        if (notes.some((n) => Math.abs(n.accidental) === 2)) doubleAccidentals++;
      }
    }
    expect(DICTIONARY_ROOTS).toHaveLength(17);
    expect(CHORD_QUALITIES).toHaveLength(20);
    expect(doubleAccidentals).toBe(46);
  });

  it('cifrado, nombre en español y fórmula', () => {
    const cm7 = findQuality('m7')!;
    expect(chordSymbol(parsePitchName('C'), cm7)).toBe('Cm7');
    expect(chordNameEs(parsePitchName('C'), cm7)).toBe('Do menor séptima');
    expect(formulaLabels(cm7).join(' ')).toBe('1 ♭3 5 ♭7');
    expect(formulaLabels(findQuality('dim7')!).join(' ')).toBe('1 ♭3 ♭5 𝄫7');
    expect(chordNameEs(parsePitchName('F#'), findQuality('maj')!)).toBe('Fa♯ mayor');
    expect(chordSymbol(parsePitchName('Bb'), findQuality('m7b5')!)).toBe('B♭m7♭5');
  });

  it('elige la ortografía con menos alteraciones y sugiere el enarmónico usual', () => {
    const maj = findQuality('maj')!;
    const min = findQuality('min')!;
    expect(simplestSpellings(1, maj).map(formatPitchName)).toEqual(['D♭']);
    expect(simplestSpellings(3, maj).map(formatPitchName)).toEqual(['E♭']);
    expect(simplestSpellings(1, min).map(formatPitchName)).toEqual(['C♯']);
    expect(simplestSpellings(6, maj).map(formatPitchName)).toEqual(['F♯', 'G♭']);
    expect(simplestSpellings(3, min).map(formatPitchName)).toEqual(['D♯', 'E♭']);
    expect(formatPitchName(moreCommonEnharmonic(parsePitchName('D#'), maj)!)).toBe('E♭');
    expect(moreCommonEnharmonic(parsePitchName('Eb'), maj)).toBeNull();
    expect(moreCommonEnharmonic(parsePitchName('F#'), maj)).toBeNull();
  });
});
