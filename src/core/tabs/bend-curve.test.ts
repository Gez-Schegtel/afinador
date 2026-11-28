// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  MAX_BEND_QUARTER_TONES,
  MIN_BEND_QUARTER_TONES,
  createBendPresetCurve,
  normalizeBendCurve,
} from './bend-curve';

describe('Curvas de Bend y Whammy Bar (Spec 014)', () => {
  it('valida orden [0, 100], rango [-4, +4] cuartos de tono y genera los 5 presets exactos', () => {
    const messy = normalizeBendCurve([
      { offset: 120, value: 9 },
      { offset: 50, value: 2.3 },
      { offset: -10, value: -7 },
      { offset: 50, value: 3 },
    ]);

    expect(messy).toEqual([
      { offset: 0, value: MIN_BEND_QUARTER_TONES },
      { offset: 50, value: 3 },
      { offset: 100, value: MAX_BEND_QUARTER_TONES },
    ]);

    const presets = ['half', 'full', 'release', 'pre-bend', 'hold'] as const;
    for (const preset of presets) {
      const curve = createBendPresetCurve(preset);
      expect(curve.length).toBeGreaterThanOrEqual(2);
      expect(curve[0]!.offset).toBe(0);
      expect(curve[curve.length - 1]!.offset).toBe(100);
      for (let i = 0; i < curve.length; i++) {
        expect(curve[i]!.value).toBeGreaterThanOrEqual(MIN_BEND_QUARTER_TONES);
        expect(curve[i]!.value).toBeLessThanOrEqual(MAX_BEND_QUARTER_TONES);
        if (i > 0) expect(curve[i]!.offset).toBeGreaterThan(curve[i - 1]!.offset);
      }
    }
    expect(createBendPresetCurve('half')[1]!.value).toBe(2);
    expect(createBendPresetCurve('full')[1]!.value).toBe(4);
    expect(createBendPresetCurve('release').at(-1)!.value).toBe(0);
  });
});
