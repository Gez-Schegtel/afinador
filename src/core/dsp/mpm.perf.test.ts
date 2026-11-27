// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MPMDetector } from './mpm';

// Referencia de costo por cuadro de análisis (el render quantum de 128 muestras dura 2.67 ms a
// 48 kHz). Solo corre con `npm run bench` (VITE_BENCH=1); no forma parte de la suite obligatoria.
describe.skipIf(!import.meta.env.VITE_BENCH)('Rendimiento de MPMDetector', () => {
  it('detect() — E2, ventana de 8192 a 48 kHz', () => {
    const sampleRate = 48000;
    const signal = new Float32Array(8192);
    for (let i = 0; i < signal.length; i++) {
      const t = i / sampleRate;
      signal[i] =
        0.25 * (Math.sin(2 * Math.PI * 82.41 * t) + 0.75 * Math.sin(2 * Math.PI * 164.82 * t));
    }
    const detector = new MPMDetector(8192);
    for (let i = 0; i < 50; i++) detector.detect(signal, sampleRate);
    const runs = 300;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) detector.detect(signal, sampleRate);
    const meanMs = (performance.now() - t0) / runs;
    console.log(`detect(): ${meanMs.toFixed(3)} ms promedio en ${runs} cuadros`);
    expect(meanMs).toBeGreaterThan(0);
  });
});
