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
    buf[i] = sample * 0.22;
  }
  return buf;
}

describe('Motor Híbrido Float64 FFT-MPM + Refinamiento de Fase (Guitarra y Bajo)', () => {
  // Bajo 5 cuerdas (B0=23, E1=28, A1=33, D2=38, G2=43) + Guitarra hasta traste 20 (E2=40..C6=84)
  const fullRangeMidiNotes = [23, 28, 33, 38, 40, 45, 50, 55, 59, 64, 76, 84];

  it('alcanza precisión estroboscópica (< 0.03 cents) desde B0 de bajo (30.87 Hz) hasta C6 de guitarra (1046.5 Hz) a 48 kHz', () => {
    const sampleRate = 48000;
    for (const midi of fullRangeMidiNotes) {
      const expectedHz = midiToFrequency(midi, 440);
      const signal = generateInstrumentTone(expectedHz, sampleRate, 8192);
      const result = detectPitchMPM(signal, sampleRate);

      expect(result.frequency).not.toBeNull();
      const errorCents = Math.abs(centsBetween(result.frequency!, expectedHz));
      expect(errorCents).toBeLessThan(0.03);
      expect(result.clarity).toBeGreaterThan(0.95);
    }
  });

  it('mantiene precisión < 0.03 cents en bajo y guitarra calibrados en A4 = 430 Hz a 44.1 kHz (incluyendo B0 = 30.17 Hz)', () => {
    const sampleRate = 44100;
    for (const midi of fullRangeMidiNotes) {
      const expectedHz = midiToFrequency(midi, 430);
      const signal = generateInstrumentTone(expectedHz, sampleRate, 8192);
      const result = detectPitchMPM(signal, sampleRate);

      expect(result.frequency).not.toBeNull();
      const errorCents = Math.abs(centsBetween(result.frequency!, expectedHz));
      expect(errorCents).toBeLessThan(0.03);
    }
  });

  it('detecta desviaciones micro-tonales exactas (ej. +0.25 cents y -1.35 cents)', () => {
    const sampleRate = 48000;
    const baseA2 = midiToFrequency(45, 430); // 107.50 Hz

    for (const offsetCents of [-1.35, -0.25, 0.25, 2.75]) {
      const shiftedHz = baseA2 * Math.pow(2, offsetCents / 1200);
      const signal = generateInstrumentTone(shiftedHz, sampleRate, 8192);
      const result = detectPitchMPM(signal, sampleRate);

      expect(result.frequency).not.toBeNull();
      const measuredCents = centsBetween(result.frequency!, baseA2);
      expect(Math.abs(measuredCents - offsetCents)).toBeLessThan(0.03);
    }
  });

  it('resuelve sin salto de octava (< 0.05 cents) cuerdas graves de bajo/guitarra con fundamental muy débil (micrófono de celular)', () => {
    const sampleRate = 48000;
    for (const midi of [23, 28, 40]) {
      // B0 (30.87 Hz), E1 (41.20 Hz), E2 (82.41 Hz) con fundamental al 12% y 2º/3º armónico dominantes
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
      expect(errorCents).toBeLessThan(0.05);
    }
  });

  it('descarta silencio y señales por debajo del umbral RMS', () => {
    const quiet = generateInstrumentTone(110, 48000, 8192, [0.002]);
    const result = detectPitchMPM(quiet, 48000);
    expect(result.frequency).toBeNull();
  });

  it('descarta ruido blanco aperiódico de alto nivel', () => {
    const noise = new Float32Array(8192);
    let seed = 987654321;
    for (let i = 0; i < noise.length; i++) {
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      noise[i] = ((seed / 0x7fffffff) * 2 - 1) * 0.35;
    }
    const result = detectPitchMPM(noise, 48000);
    expect(result.frequency).toBeNull();
  });
});

describe('PitchSmoother', () => {
  it('elimina picos espurios de ataque mediante mediana de 5 muestras y retiene nota al apagar', () => {
    const smoother = new PitchSmoother({ holdMs: 400 });
    smoother.update(107.5, 0.99, 0.1, 0);
    smoother.update(107.5, 0.99, 0.1, 20);
    smoother.update(107.5, 0.99, 0.1, 40);
    // Un cuadro espurio aislado al doble de frecuencia es rechazado por el filtro de mediana
    const afterGlitch = smoother.update(215.0, 0.85, 0.1, 60);
    expect(afterGlitch.frequency).toBeCloseTo(107.5, 3);

    const held = smoother.update(null, 0, 0.001, 150);
    expect(held.isHolding).toBe(true);
    expect(held.frequency).toBeCloseTo(107.5, 3);

    const expired = smoother.update(null, 0, 0.001, 700);
    expect(expired.frequency).toBeNull();
    expect(expired.isHolding).toBe(false);
  });
});
