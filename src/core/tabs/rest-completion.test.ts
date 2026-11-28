// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ScoreBeat, TimeSignature } from './model';
import { validateVoiceRhythm } from './rhythm';
import { completeVoiceWithRests, inspectVoiceRhythm } from './rest-completion';

const makeBeat = (id: string, duration: ScoreBeat['duration']): ScoreBeat => ({
  id,
  duration,
  dots: 0,
  isRest: false,
  notes: [],
});

describe('Semáforo rítmico y completado exacto de silencios PPQ = 960 (Spec 013)', () => {
  it('completa con la secuencia mínima de silencios en 2/4, 3/4, 4/4, 6/8 y 7/8 dejando compás exacto', () => {
    const cases: ReadonlyArray<{ ts: TimeSignature; initial: ScoreBeat[] }> = [
      { ts: { numerator: 2, denominator: 4 }, initial: [makeBeat('a', 8)] },
      { ts: { numerator: 3, denominator: 4 }, initial: [makeBeat('b', 4), makeBeat('c', 16)] },
      { ts: { numerator: 4, denominator: 4 }, initial: [makeBeat('d', 4), makeBeat('e', 8)] },
      { ts: { numerator: 6, denominator: 8 }, initial: [makeBeat('f', 8)] },
      { ts: { numerator: 7, denominator: 8 }, initial: [makeBeat('g', 4), makeBeat('h', 8)] },
    ];

    for (const c of cases) {
      const before = inspectVoiceRhythm(c.initial, c.ts);
      expect(before.status).toBe('incomplete');
      expect(before.deltaTicks).toBeGreaterThan(0);

      const completed = completeVoiceWithRests(c.initial, c.ts);
      expect(validateVoiceRhythm(completed, c.ts).status).toBe('complete');
      expect(inspectVoiceRhythm(completed, c.ts).status).toBe('complete');
    }
  });
});
