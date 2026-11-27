// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Modelo de notas con ortografía enarmónica (letra + alteración + octava) en notación
 * científica de altura: C4 = Do central, A4 = La de referencia.
 *
 * La octava acompaña a la LETRA escrita (convención de la notación científica):
 * C♭4 suena como B3 (MIDI 59) y B♯3 suena como C4 (MIDI 60).
 *
 * Núcleo 100% puro (sin React, DOM ni APIs del navegador).
 */

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** Alteración en semitonos: −2 = 𝄫, −1 = ♭, 0 = natural, +1 = ♯, +2 = 𝄪 */
export type Accidental = -2 | -1 | 0 | 1 | 2;

export interface PitchName {
  readonly letter: Letter;
  readonly accidental: Accidental;
}

export interface SpelledNote extends PitchName {
  readonly octave: number;
}

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const LETTER_PITCH_CLASS: Readonly<Record<Letter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export const LATIN_LETTER_NAMES: Readonly<Record<Letter, string>> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

/** Ortografía por defecto (sostenidos) usada por el modo Automático del afinador. */
const DEFAULT_SHARP_SPELLING: readonly PitchName[] = [
  { letter: 'C', accidental: 0 },
  { letter: 'C', accidental: 1 },
  { letter: 'D', accidental: 0 },
  { letter: 'D', accidental: 1 },
  { letter: 'E', accidental: 0 },
  { letter: 'F', accidental: 0 },
  { letter: 'F', accidental: 1 },
  { letter: 'G', accidental: 0 },
  { letter: 'G', accidental: 1 },
  { letter: 'A', accidental: 0 },
  { letter: 'A', accidental: 1 },
  { letter: 'B', accidental: 0 },
];

export function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

export function letterPitchClass(letter: Letter): number {
  return LETTER_PITCH_CLASS[letter];
}

export function letterIndex(letter: Letter): number {
  return LETTERS.indexOf(letter);
}

export function isAccidental(value: number): value is Accidental {
  return Number.isInteger(value) && value >= -2 && value <= 2;
}

export function pitchClassOf(pitch: PitchName): number {
  return mod12(LETTER_PITCH_CLASS[pitch.letter] + pitch.accidental);
}

export function spelledToMidi(note: SpelledNote): number {
  return (
    (note.octave + 1) * 12 + LETTER_PITCH_CLASS[note.letter] + note.accidental
  );
}

export function accidentalSymbol(accidental: Accidental): string {
  switch (accidental) {
    case -2:
      return '𝄫';
    case -1:
      return '♭';
    case 1:
      return '♯';
    case 2:
      return '𝄪';
    default:
      return '';
  }
}

export function formatPitchName(pitch: PitchName): string {
  return `${pitch.letter}${accidentalSymbol(pitch.accidental)}`;
}

export function formatSpelledNote(note: SpelledNote): string {
  return `${formatPitchName(note)}${note.octave}`;
}

export function latinPitchName(pitch: PitchName): string {
  return `${LATIN_LETTER_NAMES[pitch.letter]}${accidentalSymbol(pitch.accidental)}`;
}

export function samePitchName(a: PitchName, b: PitchName): boolean {
  return a.letter === b.letter && a.accidental === b.accidental;
}

/** Cantidad total de alteraciones (una doble alteración cuenta 2). */
export function totalAccidentals(pitches: readonly PitchName[]): number {
  let total = 0;
  for (const p of pitches) {
    total += Math.abs(p.accidental);
  }
  return total;
}

const ACCIDENTAL_TOKENS: Readonly<Record<string, Accidental>> = {
  '': 0,
  b: -1,
  '♭': -1,
  bb: -2,
  '♭♭': -2,
  '𝄫': -2,
  '#': 1,
  '♯': 1,
  '##': 2,
  '♯♯': 2,
  x: 2,
  '𝄪': 2,
};

const NOTE_PATTERN = /^([A-Ga-g])(𝄫|𝄪|♭♭|♯♯|bb|##|b|#|♭|♯|x)?(-?\d+)?$/u;

function parseParts(
  text: string
): { pitch: PitchName; octave: number | null } {
  const match = NOTE_PATTERN.exec(text.trim());
  if (!match) {
    throw new Error(`Nombre de nota inválido: "${text}"`);
  }
  const letter = match[1]!.toUpperCase() as Letter;
  const accidental = ACCIDENTAL_TOKENS[match[2] ?? ''];
  if (accidental === undefined) {
    throw new Error(`Alteración inválida en "${text}"`);
  }
  const octave = match[3] !== undefined ? Number.parseInt(match[3], 10) : null;
  return { pitch: { letter, accidental }, octave };
}

/** Acepta 'C', 'C#', 'C♯', 'Db', 'D♭', 'Bbb', 'B𝄫', 'F##', 'Fx', 'F𝄪'. */
export function parsePitchName(text: string): PitchName {
  const { pitch, octave } = parseParts(text);
  if (octave !== null) {
    throw new Error(`Se esperaba un nombre sin octava: "${text}"`);
  }
  return pitch;
}

/** Acepta 'E2', 'Eb2', 'E♭2', 'F#1', 'B𝄫3'. */
export function parseSpelledNote(text: string): SpelledNote {
  const { pitch, octave } = parseParts(text);
  if (octave === null) {
    throw new Error(`Falta la octava en "${text}"`);
  }
  return { ...pitch, octave };
}

/**
 * Escribe un número MIDI con la ortografía pedida (la clase de altura debe coincidir).
 * La octava se deduce de la letra: spellMidi(59, C♭) → C♭4.
 */
export function spellMidi(midi: number, pitch: PitchName): SpelledNote {
  const rounded = Math.round(midi);
  if (pitchClassOf(pitch) !== mod12(rounded)) {
    throw new Error(
      `${formatPitchName(pitch)} no corresponde al MIDI ${rounded}`
    );
  }
  const octave =
    (rounded - LETTER_PITCH_CLASS[pitch.letter] - pitch.accidental) / 12 - 1;
  return { letter: pitch.letter, accidental: pitch.accidental, octave };
}

export function defaultSharpPitchName(pitchClass: number): PitchName {
  return DEFAULT_SHARP_SPELLING[mod12(Math.round(pitchClass))]!;
}

export function defaultSharpSpelling(midi: number): SpelledNote {
  const rounded = Math.round(midi);
  return spellMidi(rounded, defaultSharpPitchName(rounded));
}
