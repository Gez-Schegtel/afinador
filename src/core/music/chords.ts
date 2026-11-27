/**
 * Catálogo de tipos de acorde y ortografía (Spec 003). Núcleo 100% puro.
 * Fórmulas en grados respecto de la raíz; las notas se derivan por intervalos (intervals.ts).
 */

import { interval, intervalLabel, transpose, type Interval } from './intervals';
import {
  formatPitchName,
  latinPitchName,
  mod12,
  parsePitchName,
  pitchClassOf,
  samePitchName,
  totalAccidentals,
  type PitchName,
} from './spelling';

export type ChordGroup =
  | 'triads'
  | 'suspended'
  | 'sixths'
  | 'sevenths'
  | 'ninths';

export const CHORD_GROUP_LABELS: Readonly<Record<ChordGroup, string>> = {
  triads: 'Tríadas',
  suspended: 'Suspendidos y quinta',
  sixths: 'Sextas',
  sevenths: 'Séptimas',
  ninths: 'Novenas',
};

export const CHORD_GROUP_ORDER: readonly ChordGroup[] = [
  'triads',
  'suspended',
  'sixths',
  'sevenths',
  'ninths',
];

export interface ChordQuality {
  readonly id: string;
  /** Sufijo del cifrado (se escribe después de la raíz): '' (mayor), 'm', 'maj7'… */
  readonly symbol: string;
  /** Cifrados alternativos usuales (sufijos). */
  readonly altSymbols: readonly string[];
  /** Nombre en español (después del nombre latino de la raíz): «menor séptima». */
  readonly nameEs: string;
  readonly group: ChordGroup;
  readonly intervals: readonly Interval[];
}

function quality(
  id: string,
  symbol: string,
  altSymbols: readonly string[],
  nameEs: string,
  group: ChordGroup,
  formula: string
): ChordQuality {
  return {
    id,
    symbol,
    altSymbols,
    nameEs,
    group,
    intervals: formula.split(' ').map(interval),
  };
}

export const CHORD_QUALITIES: readonly ChordQuality[] = [
  quality('maj', '', [], 'mayor', 'triads', '1 3 5'),
  quality('min', 'm', ['−', 'min'], 'menor', 'triads', '1 b3 5'),
  quality('dim', '°', ['dim'], 'disminuido', 'triads', '1 b3 b5'),
  quality('aug', '+', ['aug'], 'aumentado', 'triads', '1 3 #5'),
  quality('sus2', 'sus2', [], 'suspendido segunda', 'suspended', '1 2 5'),
  quality('sus4', 'sus4', [], 'suspendido cuarta', 'suspended', '1 4 5'),
  quality('5', '5', [], 'quinta (power chord)', 'suspended', '1 5'),
  quality('6', '6', [], 'sexta', 'sixths', '1 3 5 6'),
  quality('m6', 'm6', [], 'menor sexta', 'sixths', '1 b3 5 6'),
  quality('7', '7', [], 'séptima', 'sevenths', '1 3 5 b7'),
  quality('maj7', 'maj7', ['Δ7', '7M'], 'séptima mayor', 'sevenths', '1 3 5 7'),
  quality('m7', 'm7', ['−7'], 'menor séptima', 'sevenths', '1 b3 5 b7'),
  quality('mMaj7', 'm(maj7)', ['mΔ7'], 'menor con séptima mayor', 'sevenths', '1 b3 5 7'),
  quality('m7b5', 'm7♭5', ['ø7'], 'semidisminuido', 'sevenths', '1 b3 b5 b7'),
  quality('dim7', '°7', ['dim7'], 'séptima disminuida', 'sevenths', '1 b3 b5 bb7'),
  quality('7sus4', '7sus4', [], 'séptima sus4', 'sevenths', '1 4 5 b7'),
  quality('add9', 'add9', [], 'con novena añadida', 'ninths', '1 3 5 9'),
  quality('9', '9', [], 'novena', 'ninths', '1 3 5 b7 9'),
  quality('maj9', 'maj9', [], 'séptima mayor con novena', 'ninths', '1 3 5 7 9'),
  quality('m9', 'm9', [], 'menor novena', 'ninths', '1 b3 5 b7 9'),
];

/** Las 17 raíces del diccionario (sin E♯, F♭, B♯ ni C♭). */
export const DICTIONARY_ROOTS: readonly PitchName[] = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
].map(parsePitchName);

export function findQuality(id: string | null | undefined): ChordQuality | undefined {
  return CHORD_QUALITIES.find((q) => q.id === id);
}

export function findRootIndex(root: PitchName): number {
  return DICTIONARY_ROOTS.findIndex((r) => samePitchName(r, root));
}

export function spellChord(root: PitchName, q: ChordQuality): PitchName[] {
  return q.intervals.map((iv) => transpose(root, iv));
}

export function chordSymbol(root: PitchName, q: ChordQuality): string {
  return `${formatPitchName(root)}${q.symbol}`;
}

export function chordNameEs(root: PitchName, q: ChordQuality): string {
  return `${latinPitchName(root)} ${q.nameEs}`;
}

export function formulaLabels(q: ChordQuality): string[] {
  return q.intervals.map(intervalLabel);
}

export function chordPitchClasses(root: PitchName, q: ChordQuality): number[] {
  return q.intervals.map((iv) => mod12(pitchClassOf(root) + iv.semitones));
}

/** La quinta justa es omitible solo en acordes de 4 o más notas (las quintas alteradas nunca). */
export function canOmitFifth(q: ChordQuality): boolean {
  return (
    q.intervals.length >= 4 &&
    q.intervals.some((iv) => iv.degree === 5 && iv.semitones === 7)
  );
}

/** Clases de altura imprescindibles (todas salvo, si corresponde, la quinta justa). */
export function requiredPitchClasses(root: PitchName, q: ChordQuality): number[] {
  const rootPc = pitchClassOf(root);
  return q.intervals
    .filter((iv) => !(canOmitFifth(q) && iv.degree === 5 && iv.semitones === 7))
    .map((iv) => mod12(rootPc + iv.semitones));
}

/** Clase de altura de la quinta justa, o null si el tipo no la tiene. */
export function perfectFifthPitchClass(root: PitchName, q: ChordQuality): number | null {
  const fifth = q.intervals.find((iv) => iv.degree === 5 && iv.semitones === 7);
  return fifth ? mod12(pitchClassOf(root) + fifth.semitones) : null;
}

/**
 * Entre las raíces del diccionario con la misma clase de altura, la que escribe el acorde con
 * menos alteraciones (una doble cuenta 2). Devuelve todas las empatadas, en el orden del catálogo
 * (los sostenidos aparecen antes que los bemoles).
 */
export function simplestSpellings(rootPc: number, q: ChordQuality): PitchName[] {
  const candidates = DICTIONARY_ROOTS.filter((r) => pitchClassOf(r) === mod12(rootPc));
  let best = Infinity;
  let result: PitchName[] = [];
  for (const r of candidates) {
    const cost = totalAccidentals(spellChord(r, q));
    if (cost < best) {
      best = cost;
      result = [r];
    } else if (cost === best) {
      result.push(r);
    }
  }
  return result;
}

/**
 * Si la raíz elegida obliga a escribir el acorde con más alteraciones que su enarmónica (p. ej.
 * D♯ mayor = D♯ F𝄪 A♯ frente a E♭ mayor = E♭ G B♭), devuelve la raíz más usual; si no, null.
 */
export function moreCommonEnharmonic(root: PitchName, q: ChordQuality): PitchName | null {
  const simplest = simplestSpellings(pitchClassOf(root), q);
  if (simplest.some((r) => samePitchName(r, root))) return null;
  return simplest[0] ?? null;
}
