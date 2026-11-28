// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MPMDetector } from './mpm';
import { timeStretchWSOLA } from './wsola';

function makeHarmonicSignal(sampleRate: number, durationSec: number, f0Hz: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    out[i] =
      0.65 * Math.sin(2 * Math.PI * f0Hz * t) +
      0.25 * Math.sin(2 * Math.PI * f0Hz * 2 * t) +
      0.1 * Math.sin(2 * Math.PI * f0Hz * 3 * t);
  }
  return out;
}

describe('WSOLA Time-Stretching sin SharedArrayBuffer (Spec 014)', () => {
  it('estira el audio a 0.5×, 0.75× y 1.25× preservando altura tonal (< 2 cents) y cero NaN/Infinity', () => {
    const sampleRate = 48000;
    const f0 = 220;
    const input = makeHarmonicSignal(sampleRate, 1.5, f0);
    const detector = new MPMDetector(8192);

    for (const speed of [0.5, 0.75, 1.25]) {
      const stretched = timeStretchWSOLA(input, speed);
      const expectedLen = input.length / speed;
      expect(stretched.length).toBeGreaterThan(expectedLen * 0.85);
      expect(stretched.length).toBeLessThan(expectedLen * 1.1);

      let nonFinite = 0;
      for (let i = 0; i < stretched.length; i++) {
        if (!Number.isFinite(stretched[i]!)) nonFinite++;
      }
      expect(nonFinite).toBe(0);

      const start = Math.min(4096, Math.max(0, Math.floor(stretched.length / 2) - 4096));
      const slice = stretched.subarray(start, start + 8192);
      const pitch = detector.detect(slice, sampleRate);
      expect(pitch.frequency).not.toBeNull();
      const centsDiff = Math.abs(1200 * Math.log2((pitch.frequency ?? f0) / f0));
      expect(centsDiff).toBeLessThan(2.0);
    }
  });
});
