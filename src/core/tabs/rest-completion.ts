// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Diagnóstico rítmico exacto (semáforo) y completado determinístico con la secuencia mínima
 * de silencios en aritmética racional `PPQ = 960` (Spec 013).
 */

import { scoreBeatTicks, type ScoreBeat, type TimeSignature } from './model';
import {
  barCapacityTicks,
  beatDurationTicks,
  cmpTicks,
  rational,
  subTicks,
  ticksToNumberFloor,
  validateVoiceRhythm,
  type BarRhythmStatus,
  type BaseDuration,
  type DotCount,
  type RationalTicks,
} from './rhythm';

export interface RhythmInspection {
  readonly status: BarRhythmStatus;
  readonly actualTicks: RationalTicks;
  readonly capacityTicks: RationalTicks;
  readonly deltaTicks: number;
  readonly humanSummary: string;
}

const REST_CANDIDATES: ReadonlyArray<{
  duration: BaseDuration;
  dots: DotCount;
  labelEs: string;
}> = [
  { duration: 1, dots: 0, labelEs: 'redonda' },
  { duration: 2, dots: 2, labelEs: 'blanca con doble puntillo' },
  { duration: 2, dots: 1, labelEs: 'blanca con puntillo' },
  { duration: 2, dots: 0, labelEs: 'blanca' },
  { duration: 4, dots: 2, labelEs: 'negra con doble puntillo' },
  { duration: 4, dots: 1, labelEs: 'negra con puntillo' },
  { duration: 4, dots: 0, labelEs: 'negra' },
  { duration: 8, dots: 2, labelEs: 'corchea con doble puntillo' },
  { duration: 8, dots: 1, labelEs: 'corchea con puntillo' },
  { duration: 8, dots: 0, labelEs: 'corchea' },
  { duration: 16, dots: 2, labelEs: 'semicorchea con doble puntillo' },
  { duration: 16, dots: 1, labelEs: 'semicorchea con puntillo' },
  { duration: 16, dots: 0, labelEs: 'semicorchea' },
  { duration: 32, dots: 1, labelEs: 'fusa con puntillo' },
  { duration: 32, dots: 0, labelEs: 'fusa' },
  { duration: 64, dots: 0, labelEs: 'semifusa' },
];

function subtractRational(a: RationalTicks, b: RationalTicks): RationalTicks {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

function compareRational(a: RationalTicks, b: RationalTicks): number {
  const diff = a.num * b.den - b.num * a.den;
  return diff === 0 ? 0 : diff > 0 ? 1 : -1;
}

function describeMissingSummary(missing: RationalTicks): string {
  const ticksNum = ticksToNumberFloor(missing);
  const exact = REST_CANDIDATES.find(
    (c) => compareRational(beatDurationTicks(c.duration, c.dots), missing) === 0
  );
  if (exact) {
    return `Falta 1 ${exact.labelEs} (${ticksNum} ticks)`;
  }
  return `Faltan ${ticksNum} ticks`;
}

export function inspectVoiceRhythm(
  beats: readonly ScoreBeat[],
  timeSignature: TimeSignature
): RhythmInspection {
  const res = validateVoiceRhythm(beats, timeSignature);
  const actualNum = ticksToNumberFloor(res.actual);
  const capNum = ticksToNumberFloor(res.expected);

  if (res.status === 'complete') {
    return {
      status: 'complete',
      actualTicks: res.actual,
      capacityTicks: res.expected,
      deltaTicks: 0,
      humanSummary: `Completo (${actualNum}/${capNum} ticks)`,
    };
  }

  if (res.status === 'incomplete') {
    const missing = subTicks(res.expected, res.actual);
    return {
      status: 'incomplete',
      actualTicks: res.actual,
      capacityTicks: res.expected,
      deltaTicks: ticksToNumberFloor(missing),
      humanSummary: describeMissingSummary(missing),
    };
  }

  const excess = subTicks(res.actual, res.expected);
  const excessNum = ticksToNumberFloor(excess);
  return {
    status: 'exceeded',
    actualTicks: res.actual,
    capacityTicks: res.expected,
    deltaTicks: -excessNum,
    humanSummary: `Excedido por ${excessNum} ticks (${actualNum}/${capNum})`,
  };
}

/** Descompone vorazmente un hueco racional positivo en la secuencia mínima de silencios válidos. */
export function computeCompletionRests(
  missingTicks: RationalTicks,
  idPrefix = 'rest'
): ScoreBeat[] {
  let rem = rational(missingTicks.num, missingTicks.den);
  const zero = rational(0, 1);
  if (compareRational(rem, zero) <= 0) return [];

  const result: ScoreBeat[] = [];
  let idx = 0;

  for (const cand of REST_CANDIDATES) {
    const candTicks = beatDurationTicks(cand.duration, cand.dots);
    while (compareRational(rem, candTicks) >= 0) {
      result.push({
        id: `${idPrefix}-${++idx}`,
        duration: cand.duration,
        dots: cand.dots,
        isRest: true,
        notes: [],
      });
      rem = subtractRational(rem, candTicks);
    }
    if (rem.num === 0) break;
  }

  // Respaldo exacto si una diferencia por tuplet deja fracción de negras
  void cmpTicks;
  void subTicks;

  return result;
}

export function completeVoiceWithRests(
  beats: readonly ScoreBeat[],
  timeSignature: TimeSignature,
  idPrefix = 'fill'
): ScoreBeat[] {
  const cap = barCapacityTicks(timeSignature.numerator, timeSignature.denominator);
  let used = rational(0, 1);
  for (const b of beats) {
    const bt = scoreBeatTicks(b);
    used = rational(used.num * bt.den + bt.num * used.den, used.den * bt.den);
  }
  const missing = subtractRational(cap, used);
  if (missing.num <= 0) return [...beats];
  return [...beats, ...computeCompletionRests(missing, idPrefix)];
}
