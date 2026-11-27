import { bench, describe } from 'vitest';
import { MPMDetector } from './mpm';

// Referencia de costo por cuadro de análisis (el render quantum de 128 muestras dura 2.67 ms a 48 kHz).
// Ejecutar con `npm run bench`; no forma parte de la suite obligatoria.
const sampleRate = 48000;
const signal = new Float32Array(8192);
for (let i = 0; i < signal.length; i++) {
  const t = i / sampleRate;
  signal[i] =
    0.25 * (Math.sin(2 * Math.PI * 82.41 * t) + 0.75 * Math.sin(2 * Math.PI * 164.82 * t));
}
const detector = new MPMDetector(8192);

describe('MPMDetector', () => {
  bench('detect() — E2, ventana de 8192 a 48 kHz', () => {
    detector.detect(signal, sampleRate);
  });
});
