import { describe, expect, it } from 'vitest';
import { detectPitchMPM } from './mpm';
import { PitchSmoother } from './smoother';
import { centsBetween, midiToFrequency } from '../music/notes';

function generateInstrumentTone(
  fundamentalHz: number,
  sampleRate: number,
  length: number = 8192,
  harmonicWeights: number[] = [1.0, 0.75, 0.5, 0.3, 0.15],
  initialPhaseRad: number = 0.73
): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let h = 0; h < harmonicWeights.length; h++) {
      const harmonicNumber = h + 1;
      sample +=
        harmonicWeights[h]! *
        Math.sin(
          2 * Math.PI * fundamentalHz * harmonicNumber * t +
            initialPhaseRad * harmonicNumber
        );
    }
    buf[i] = sample * 0.25;
  }
  return buf;
}

describe('Motor Float64 FFT-MPM + Interpolación Sinc (Guitarra y Bajo)', () => {
  const fullRangeMidiNotes = [23, 28, 33, 38, 40, 45, 50, 55, 59, 64, 76, 84];

  it('alcanza alta precisión (< 0.05 cents) desde B0 de bajo (30.87 Hz) hasta C6 de guitarra (1046.5 Hz) a 48 kHz', () => {
    const sampleRate = 48000;
    for (const midi of fullRangeMidiNotes) {
      const expectedHz = midiToFrequency(midi, 440);
      const signal = generateInstrumentTone(expectedHz, sampleRate, 8192);
      const result = detectPitchMPM(signal, sampleRate);

      expect(result.frequency).not.toBeNull();
      const errorCents = Math.abs(centsBetween(result.frequency!, expectedHz));
      expect(errorCents).toBeLessThan(0.05);
      expect(result.clarity).toBeGreaterThan(0.95);
    }
  });

  it('mantiene precisión < 0.05 cents en bajo y guitarra calibrados en A4 = 430 Hz a 44.1 kHz (incluyendo B0 = 30.17 Hz)', () => {
    const sampleRate = 44100;
    for (const midi of fullRangeMidiNotes) {
      const expectedHz = midiToFrequency(midi, 430);
      const signal = generateInstrumentTone(expectedHz, sampleRate, 8192);
      const result = detectPitchMPM(signal, sampleRate);

      expect(result.frequency).not.toBeNull();
      const errorCents = Math.abs(centsBetween(result.frequency!, expectedHz));
      expect(errorCents).toBeLessThan(0.05);
    }
  });

  it('resuelve sin salto de octava (< 0.08 cents) cuerdas graves con fundamental muy débil (micrófono de celular)', () => {
    const sampleRate = 48000;
    for (const midi of [23, 28, 40]) {
      const expectedHz = midiToFrequency(midi, 440);
      const weakFundamental = generateInstrumentTone(
        expectedHz,
        sampleRate,
        8192,
        [0.12, 1.0, 0.85, 0.55]
      );
      const result = detectPitchMPM(weakFundamental, sampleRate);

      expect(result.frequency).not.toBeNull();
      const errorCents = Math.abs(centsBetween(result.frequency!, expectedHz));
      expect(errorCents).toBeLessThan(0.08);
    }
  });

  it('descarta silencio y ruido blanco aperiódico de sala', () => {
    const quiet = generateInstrumentTone(110, 48000, 8192, [0.002]);
    expect(detectPitchMPM(quiet, 48000).frequency).toBeNull();

    const noise = new Float32Array(8192);
    let seed = 987654321;
    for (let i = 0; i < noise.length; i++) {
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      noise[i] = ((seed / 0x7fffffff) * 2 - 1) * 0.35;
    }
    expect(detectPitchMPM(noise, 48000).frequency).toBeNull();
  });
});

describe('PitchSmoother — Estabilidad ante batido acústico real de cuerda', () => {
  it('amortigua una oscilación real de cuerda (±4 cents de batido) a menos de ±0.6 cents y rechaza saltos aislados', () => {
    const smoother = new PitchSmoother({ holdMs: 400 });
    const centerHz = 110.0; // A2

    // Simular 40 cuadros (~840 ms) de una cuerda real con batido periódico de ±4 cents + un salto aislado
    let maxSteadyDeviationCents = 0;
    for (let frame = 0; frame < 40; frame++) {
      const wobbleCents = 4.0 * Math.sin((2 * Math.PI * frame) / 8);
      const rawHz =
        frame === 14
          ? 220.0 // Pico aislado espurio de octava
          : centerHz * Math.pow(2, wobbleCents / 1200);

      const out = smoother.update(rawHz, 0.94, 0.08, frame * 21);
      expect(out.frequency).not.toBeNull();

      if (frame >= 24) {
        const dev = Math.abs(centsBetween(out.frequency!, centerHz));
        if (dev > maxSteadyDeviationCents) {
          maxSteadyDeviationCents = dev;
        }
      }
    }

    // La aguja queda clavada dentro de ±0.6 cents pese al batido crudo de ±4 cents y el pico de octava
    expect(maxSteadyDeviationCents).toBeLessThan(0.6);

    const held = smoother.update(null, 0, 0.001, 40 * 21 + 150);
    expect(held.isHolding).toBe(true);

    const expired = smoother.update(null, 0, 0.001, 40 * 21 + 700);
    expect(expired.frequency).toBeNull();
  });

  it('en modo Manual acotado a ±5 semitonos de E2 (82.41 Hz) engancha la fundamental aunque el 2º armónico sea 12x más fuerte', () => {
    const sampleRate = 48000;
    const e2Hz = midiToFrequency(40, 440); // 82.41 Hz
    // Señal extrema: fundamental mínima (0.08) vs 2º armónico gigante (1.0)
    const extremeWeakFundamental = generateInstrumentTone(
      e2Hz,
      sampleRate,
      8192,
      [0.08, 1.0, 0.6]
    );

    const manualResult = detectPitchMPM(extremeWeakFundamental, sampleRate, {
      minFreq: Math.max(25, e2Hz * Math.pow(2, -5 / 12)),
      maxFreq: Math.min(2200, e2Hz * Math.pow(2, 5 / 12)),
      minRms: 0.0025,
      minClarity: 0.6,
      clarityThreshold: 0.85,
    });

    expect(manualResult.frequency).not.toBeNull();
    expect(Math.abs(centsBetween(manualResult.frequency!, e2Hz))).toBeLessThan(
      0.08
    );
  });
});
