// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { RealAutocorrelator } from './fft';

function directAutocorrelation(x: Float64Array, n: number, maxLag: number): Float64Array {
  const out = new Float64Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i + tau < n; i++) sum += x[i]! * x[i + tau]!;
    out[tau] = sum;
  }
  return out;
}

describe('RealAutocorrelator (FFT real empaquetada)', () => {
  it('coincide con la autocorrelación directa O(N²)', () => {
    for (const n of [1000, 1024, 777]) {
      const x = new Float64Array(n);
      let seed = 12345 + n;
      for (let i = 0; i < n; i++) {
        seed = (1103515245 * seed + 12345) & 0x7fffffff;
        x[i] = (seed / 0x7fffffff) * 2 - 1 + 0.4 * Math.sin(i * 0.05);
      }
      const maxLag = n - 1;
      const ac = new RealAutocorrelator(1024);
      const out = new Float64Array(maxLag + 1);
      ac.compute(x, n, out, maxLag);
      const ref = directAutocorrelation(x, n, maxLag);
      const scale = ref[0]!;
      for (let tau = 0; tau <= maxLag; tau++) {
        expect(Math.abs(out[tau]! - ref[tau]!) / scale).toBeLessThan(1e-12);
      }
    }
  });
});
