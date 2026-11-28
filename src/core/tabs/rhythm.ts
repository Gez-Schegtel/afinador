// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Aritmética rítmica exacta para tablaturas y partituras (Spec 008). Núcleo 100% puro.
 *
 * Usa resolución entera PPQ = 960 ticks por negra (múltiplo exacto de 2, 3, 4, 5, 6, 8, 10,
 * 12, 15, 16, 20, 24, 30, 32...) combinada con fracciones racionales irreducibles para cubrir
 * también grupos irregulares primos (como septillos) sin errores de punto flotante.
 */

export const PPQ = 960;
export const WHOLE_TICKS = PPQ * 4; // 3840

export type BaseDuration = 1 | 2 | 4 | 8 | 16 | 32 | 64;
export type DotCount = 0 | 1 | 2;

export const BASE_DURATIONS: readonly BaseDuration[] = [1, 2, 4, 8, 16, 32, 64];

export interface TupletRatio {
  /** Notas que entran en el grupo (ej. 3 en tresillo, 7 en septillo). */
  readonly enter: number;
  /** Notas normales equivalentes que reemplazan (ej. 2 en tresillo, 4 en septillo). */
  readonly in: number;
}

export interface RationalTicks {
  readonly num: number;
  readonly den: number;
}

export interface TimeSignatureLike {
  readonly numerator: number;
  readonly denominator: number;
}

export interface RhythmBeatLike {
  readonly duration: BaseDuration;
  readonly dots?: DotCount;
  readonly tuplet?: TupletRatio | null;
  readonly isGrace?: boolean;
}

export type BarRhythmStatus = 'complete' | 'incomplete' | 'exceeded';

export interface BarValidationResult {
  readonly status: BarRhythmStatus;
  readonly actual: RationalTicks;
  readonly expected: RationalTicks;
  /** Diferencia exacta: actual - expected (< 0 falta llenar, > 0 excedido, 0 exacto). */
  readonly delta: RationalTicks;
}

export const ZERO_TICKS: RationalTicks = { num: 0, den: 1 };

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0 ? 1 : x;
}

export function rational(num: number, den: number = 1): RationalTicks {
  if (!Number.isInteger(num) || !Number.isInteger(den) || den === 0) {
    throw new Error(`Fracción racional inválida: ${num}/${den}`);
  }
  if (num === 0) return ZERO_TICKS;
  const sign = den < 0 ? -1 : 1;
  const n = num * sign;
  const d = Math.abs(den);
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

export function addTicks(a: RationalTicks, b: RationalTicks): RationalTicks {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function subTicks(a: RationalTicks, b: RationalTicks): RationalTicks {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mulTicks(a: RationalTicks, factorNum: number, factorDen: number = 1): RationalTicks {
  return rational(a.num * factorNum, a.den * factorDen);
}

export function cmpTicks(a: RationalTicks, b: RationalTicks): number {
  const diff = a.num * b.den - b.num * a.den;
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function ticksEquals(a: RationalTicks, b: RationalTicks): boolean {
  return cmpTicks(a, b) === 0;
}

export function isExactIntegerTicks(a: RationalTicks): boolean {
  return a.den === 1;
}

export function ticksToNumberFloor(a: RationalTicks): number {
  return Math.floor(a.num / a.den);
}

export function ticksToFloat(a: RationalTicks): number {
  return a.num / a.den;
}

/** Duración exacta de un pulso/nota en ticks de PPQ = 960. */
export function beatDurationTicks(
  duration: BaseDuration,
  dots: DotCount = 0,
  tuplet?: TupletRatio | null
): RationalTicks {
  const base = WHOLE_TICKS / duration; // entero exacto para 1..64
  let dotNum = 1;
  let dotDen = 1;
  if (dots === 1) {
    dotNum = 3;
    dotDen = 2;
  } else if (dots === 2) {
    dotNum = 7;
    dotDen = 4;
  }

  let ticks = rational(base * dotNum, dotDen);
  if (tuplet) {
    if (
      !Number.isInteger(tuplet.enter) ||
      !Number.isInteger(tuplet.in) ||
      tuplet.enter <= 0 ||
      tuplet.in <= 0
    ) {
      throw new Error(`Tuplet inválido: ${tuplet.enter}:${tuplet.in}`);
    }
    ticks = mulTicks(ticks, tuplet.in, tuplet.enter);
  }
  return ticks;
}

/** Capacidad exacta de un compás `numerator / denominator` en ticks de PPQ = 960. */
export function barCapacityTicks(numerator: number, denominator: number): RationalTicks {
  if (!Number.isInteger(numerator) || numerator <= 0 || !Number.isInteger(denominator) || denominator <= 0) {
    throw new Error(`Cifra de compás inválida: ${numerator}/${denominator}`);
  }
  return rational(numerator * WHOLE_TICKS, denominator);
}

/** Suma exacta de duraciones de una voz (ignorando notas de gracia de duración 0). */
export function sumVoiceTicks(beats: readonly RhythmBeatLike[]): RationalTicks {
  let total = ZERO_TICKS;
  for (const beat of beats) {
    if (beat.isGrace) continue;
    total = addTicks(total, beatDurationTicks(beat.duration, beat.dots ?? 0, beat.tuplet));
  }
  return total;
}

/** Valida de forma determinística el cierre rítmico de una voz dentro de un compás. */
export function validateVoiceRhythm(
  beats: readonly RhythmBeatLike[],
  timeSignature: TimeSignatureLike
): BarValidationResult {
  const actual = sumVoiceTicks(beats);
  const expected = barCapacityTicks(timeSignature.numerator, timeSignature.denominator);
  const delta = subTicks(actual, expected);
  const cmp = cmpTicks(actual, expected);
  const status: BarRhythmStatus =
    cmp === 0 ? 'complete' : cmp < 0 ? 'incomplete' : 'exceeded';
  return { status, actual, expected, delta };
}

/** Convierte una duración en ticks a segundos para un tempo BPM (negra = 60/bpm s). */
export function ticksToSeconds(ticks: RationalTicks, bpm: number): number {
  return (ticksToFloat(ticks) / PPQ) * (60 / bpm);
}
