import { describe, expect, it } from 'vitest';
import { MPMDetector, detectPitchMPM, manualDetectionOptions } from './mpm';
import { PitchSmoother } from './smoother';
import { centsBetween, midiToFrequency } from '../music/notes';

function generateInstrumentTone(
  fundamentalHz: number,
  sampleRate: number,
  length: number = 8192,
  harmonicWeights: number[] = [1.0, 0.75, 0.5, 0.3, 0.15],
  initialPhaseRad: number = 0.73,
  inharmonicity: number = 0
): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let h = 0; h < harmonicWeights.length; h++) {
      const k = h + 1;
      // Cuerda real: el parcial k vale k·f0·√(1 + B·k²) (B = coeficiente de inarmonicidad).
      const partialHz = k * fundamentalHz * Math.sqrt(1 + inharmonicity * k * k);
      sample +=
        harmonicWeights[h]! *
        Math.sin(2 * Math.PI * partialHz * t + initialPhaseRad * k);
    }
    buf[i] = sample * 0.25;
  }
  return buf;
}

describe('Motor Float64 FFT-MPM + refinamiento QIFFT (Guitarra y Bajo)', () => {
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

  it('en modo Manual (configuración real del worklet) sobre E2 (82.41 Hz) engancha la fundamental aunque el 2º armónico sea 12x más fuerte', () => {
    const sampleRate = 48000;
    const e2Hz = midiToFrequency(40, 440); // 82.41 Hz
    // Señal extrema: fundamental mínima (0.08) vs 2º armónico gigante (1.0)
    const extremeWeakFundamental = generateInstrumentTone(
      e2Hz,
      sampleRate,
      8192,
      [0.08, 1.0, 0.6]
    );

    const manualResult = detectPitchMPM(
      extremeWeakFundamental,
      sampleRate,
      manualDetectionOptions(e2Hz)
    );

    expect(manualResult.frequency).not.toBeNull();
    expect(Math.abs(centsBetween(manualResult.frequency!, e2Hz))).toBeLessThan(
      0.08
    );
  });

  it('en modo Manual (-11.5 / +5 st) detecta una cuerda G3 (196 Hz) caída -800 cents (~123.5 Hz) sin saltar al 2º armónico', () => {
    const sampleRate = 48000;
    const g3Hz = midiToFrequency(55, 440); // 196.0 Hz
    const veryLooseHz = g3Hz * Math.pow(2, -800 / 1200); // ~123.47 Hz (8 semitonos abajo)
    // Fundamental modesta frente a armónicos fuertes (2º = 246.9 Hz, que cae dentro del rango de G3!)
    const looseSignal = generateInstrumentTone(
      veryLooseHz,
      sampleRate,
      8192,
      [0.35, 1.0, 0.75, 0.4]
    );

    const manualResult = detectPitchMPM(
      looseSignal,
      sampleRate,
      manualDetectionOptions(g3Hz)
    );

    expect(manualResult.frequency).not.toBeNull();
    expect(
      Math.abs(centsBetween(manualResult.frequency!, veryLooseHz))
    ).toBeLessThan(0.1);
  });
});

describe('Rango, ruido e inarmonicidad', () => {
  it('precisión < 0.03 cents de A0 a B6 (tono armónico, 4 fases, 44.1 y 48 kHz)', () => {
    for (const sampleRate of [44100, 48000]) {
      const detector = new MPMDetector(8192);
      for (let midi = 21; midi <= 95; midi++) {
        const expectedHz = midiToFrequency(midi, 440);
        for (const phase of [0.1, 0.73, 1.9, 2.8]) {
          const result = detector.detect(
            generateInstrumentTone(expectedHz, sampleRate, 8192, undefined, phase),
            sampleRate
          );
          expect(result.frequency, `MIDI ${midi} @ ${sampleRate}`).not.toBeNull();
          expect(Math.abs(centsBetween(result.frequency!, expectedHz))).toBeLessThan(0.03);
        }
      }
    }
  });

  it('en Automático detecta un A0 bajo de tono (hasta −100 cents)', () => {
    const a0 = midiToFrequency(21, 440);
    for (const cents of [-100, -50, -20, -5, -1]) {
      const hz = a0 * Math.pow(2, cents / 1200);
      const result = detectPitchMPM(generateInstrumentTone(hz, 48000), 48000);
      expect(result.frequency, `A0 ${cents} ct`).not.toBeNull();
      expect(Math.abs(centsBetween(result.frequency!, hz))).toBeLessThan(0.05);
    }
  });

  it('con ruido blanco a ~26 dB de SNR el error RMS en E2 queda por debajo de 0.5 cents', () => {
    const sampleRate = 48000;
    const e2 = midiToFrequency(40, 440);
    let sumSq = 0;
    let seed = 4242;
    const trials = 20;
    for (let trial = 0; trial < trials; trial++) {
      const signal = generateInstrumentTone(e2, sampleRate, 8192, undefined, 0.3 * trial);
      for (let i = 0; i < signal.length; i++) {
        seed = (1103515245 * seed + 12345) & 0x7fffffff;
        const u1 = (seed + 1) / 0x80000000;
        seed = (1103515245 * seed + 12345) & 0x7fffffff;
        const u2 = seed / 0x80000000;
        signal[i]! += 0.25 * 0.05 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
      const result = detectPitchMPM(signal, sampleRate);
      expect(result.frequency).not.toBeNull();
      sumSq += centsBetween(result.frequency!, e2) ** 2;
    }
    expect(Math.sqrt(sumSq / trials)).toBeLessThan(0.5);
  });

  it('no salta entre fundamental y 2º armónico cuando la fundamental ronda el 40% (histéresis)', () => {
    const sampleRate = 48000;
    const e1 = midiToFrequency(28, 440);
    const B = 4e-4; // inarmonicidad típica de una cuerda grave de bajo
    const detector = new MPMDetector(8192);
    const readings: number[] = [];
    for (let frame = 0; frame < 12; frame++) {
      const a1 = frame % 2 === 0 ? 0.38 : 0.42; // cruza el umbral de entrada (0.40) en cada cuadro
      const signal = generateInstrumentTone(e1, sampleRate, 8192, [a1, 1.0, 0.8, 0.55], 0.73, B);
      const result = detector.detect(signal, sampleRate);
      expect(result.frequency).not.toBeNull();
      readings.push(result.frequency!);
    }
    for (let i = 1; i < readings.length; i++) {
      expect(Math.abs(centsBetween(readings[i]!, readings[i - 1]!))).toBeLessThan(0.1);
    }
  });
});
