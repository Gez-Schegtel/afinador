// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  PPQ,
  WHOLE_TICKS,
  addTicks,
  barCapacityTicks,
  beatDurationTicks,
  rational,
  ticksEquals,
  ticksToSeconds,
  validateVoiceRhythm,
} from './rhythm';

describe('Aritmética rítmica exacta (PPQ = 960, Spec 008)', () => {
  it('calcula duraciones enteras exactas para figuras base y puntillos', () => {
    expect(PPQ).toBe(960);
    expect(WHOLE_TICKS).toBe(3840);
    expect(beatDurationTicks(1)).toEqual({ num: 3840, den: 1 });
    expect(beatDurationTicks(2)).toEqual({ num: 1920, den: 1 });
    expect(beatDurationTicks(4)).toEqual({ num: 960, den: 1 });
    expect(beatDurationTicks(4, 1)).toEqual({ num: 1440, den: 1 });
    expect(beatDurationTicks(8, 2)).toEqual({ num: 840, den: 1 });
    expect(beatDurationTicks(64, 2)).toEqual({ num: 105, den: 1 });
  });

  it('mantiene exactitud matemática sin deriva en tresillos, quintillos y septillos', () => {
    const triplet8 = beatDurationTicks(8, 0, { enter: 3, in: 2 });
    expect(triplet8).toEqual({ num: 320, den: 1 });

    const quintuplet16 = beatDurationTicks(16, 0, { enter: 5, in: 4 });
    expect(quintuplet16).toEqual({ num: 192, den: 1 });

    // Septillo de semicorcheas en 1 negra: 7 * (960 / 7) === 960 exacto sin redondeo
    const septuplet16 = beatDurationTicks(16, 0, { enter: 7, in: 4 });
    expect(septuplet16).toEqual({ num: 960, den: 7 });

    let acc = rational(0, 1);
    for (let i = 0; i < 7; i++) acc = addTicks(acc, septuplet16);
    expect(ticksEquals(acc, rational(PPQ, 1))).toBe(true);
  });

  it('valida compases simples, compuestos e irregulares (completo, incompleto, excedido)', () => {
    expect(barCapacityTicks(4, 4)).toEqual({ num: 3840, den: 1 });
    expect(barCapacityTicks(6, 8)).toEqual({ num: 2880, den: 1 });
    expect(barCapacityTicks(7, 8)).toEqual({ num: 3360, den: 1 });

    // 4/4 completo con 1 negra + tresillo de corcheas + quintillo de 16 + septillo de 16
    const mixedComplete = validateVoiceRhythm(
      [
        { duration: 4 },
        ...Array.from({ length: 3 }, () => ({
          duration: 8 as const,
          tuplet: { enter: 3, in: 2 },
        })),
        ...Array.from({ length: 5 }, () => ({
          duration: 16 as const,
          tuplet: { enter: 5, in: 4 },
        })),
        ...Array.from({ length: 7 }, () => ({
          duration: 16 as const,
          tuplet: { enter: 7, in: 4 },
        })),
      ],
      { numerator: 4, denominator: 4 }
    );
    expect(mixedComplete.status).toBe('complete');
    expect(mixedComplete.delta).toEqual({ num: 0, den: 1 });

    // 6/8 incompleto (falta 1 corchea = 480 ticks)
    const incomplete = validateVoiceRhythm(
      [{ duration: 4, dots: 1 }, { duration: 4 }],
      { numerator: 6, denominator: 8 }
    );
    expect(incomplete.status).toBe('incomplete');
    expect(incomplete.delta).toEqual({ num: -480, den: 1 });

    // 7/8 excedido (+ 1 semicorchea = +240 ticks)
    const exceeded = validateVoiceRhythm(
      Array.from({ length: 8 }, () => ({ duration: 8 as const })),
      { numerator: 7, denominator: 8 }
    );
    expect(exceeded.status).toBe('exceeded');
    expect(exceeded.delta).toEqual({ num: 480, den: 1 });

    // Notas de gracia no suman duración del compás
    const withGrace = validateVoiceRhythm(
      [
        { duration: 16, isGrace: true },
        { duration: 4 },
        { duration: 4 },
        { duration: 2 },
      ],
      { numerator: 4, denominator: 4 }
    );
    expect(withGrace.status).toBe('complete');

    // 120 BPM => 1 negra = 0.5 s exactos
    expect(ticksToSeconds(rational(PPQ, 1), 120)).toBeCloseTo(0.5, 10);
  });
});
