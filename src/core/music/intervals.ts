// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Intervalos con ortografía (Spec 003). Núcleo 100% puro.
 *
 * Un intervalo es un par (número genérico, semitonos). Para transponer se AVANZA la letra
 * `número − 1` pasos y se ajusta la alteración hasta obtener los semitonos pedidos: así la
 * ortografía es siempre correcta (C → ♭3 = E♭, nunca D♯; C°7 lleva B𝄫, no A).
 */

import {
  LETTERS,
  accidentalSymbol,
  isAccidental,
  letterIndex,
  letterPitchClass,
  mod12,
  type Accidental,
  type PitchName,
} from './spelling';

export interface Interval {
  /** Número genérico: 1 = unísono, 3 = tercera, 9 = novena… */
  readonly degree: number;
  /** Distancia en semitonos desde la raíz (la novena mayor = 14). */
  readonly semitones: number;
}

/** Semitonos de cada grado en la escala mayor (referencia para nombrar alteraciones). */
const MAJOR_SCALE_SEMITONES: Readonly<Record<number, number>> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  8: 12,
  9: 14,
  10: 16,
  11: 17,
  12: 19,
  13: 21,
};

const LABEL_PATTERN = /^(bb|b|##|#|𝄫|♭|♯|𝄪)?(\d{1,2})$/u;

const LABEL_ACCIDENTALS: Readonly<Record<string, number>> = {
  '': 0,
  b: -1,
  '♭': -1,
  bb: -2,
  '𝄫': -2,
  '#': 1,
  '♯': 1,
  '##': 2,
  '𝄪': 2,
};

/** Crea un intervalo desde su etiqueta de grado: '1', '♭3', 'b3', '#5', 'bb7', '9'. */
export function interval(label: string): Interval {
  const match = LABEL_PATTERN.exec(label);
  if (!match) throw new Error(`Intervalo inválido: "${label}"`);
  const degree = Number.parseInt(match[2]!, 10);
  const base = MAJOR_SCALE_SEMITONES[degree];
  const shift = LABEL_ACCIDENTALS[match[1] ?? ''];
  if (base === undefined || shift === undefined) {
    throw new Error(`Intervalo inválido: "${label}"`);
  }
  return { degree, semitones: base + shift };
}

/** Etiqueta de grado con su alteración respecto de la escala mayor: '1', '♭3', '♯5', '𝄫7'. */
export function intervalLabel(iv: Interval): string {
  const base = MAJOR_SCALE_SEMITONES[iv.degree] ?? 0;
  const diff = iv.semitones - base;
  const acc = isAccidental(diff) ? accidentalSymbol(diff) : '?';
  return `${acc}${iv.degree}`;
}

/** Transpone `root` por el intervalo dado, con ortografía correcta (máximo doble alteración). */
export function transpose(root: PitchName, iv: Interval): PitchName {
  const targetIndex = (letterIndex(root.letter) + iv.degree - 1) % 7;
  const letter = LETTERS[targetIndex]!;
  const targetPc = mod12(
    letterPitchClass(root.letter) + root.accidental + iv.semitones
  );
  let acc = mod12(targetPc - letterPitchClass(letter));
  if (acc > 6) acc -= 12;
  if (!isAccidental(acc)) {
    throw new Error(
      `No se puede escribir el intervalo ${intervalLabel(iv)} sobre esa raíz sin triples alteraciones`
    );
  }
  return { letter, accidental: acc as Accidental };
}
