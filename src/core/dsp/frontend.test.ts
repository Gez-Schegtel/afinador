import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_WINDOW_SIZE,
  AnalysisFrontEnd,
  BiquadFilter,
  HIGH_PASS_HZ,
  LOW_PASS_HZ,
  decimationFactor,
} from './frontend';
import { MPMDetector } from './mpm';
import { centsBetween, midiToFrequency } from '../music/notes';

/** Pipeline completo del worklet (filtros + decimación + ventana + MPM) en Node. */
function runPipeline(freqHz: number, sampleRate: number, seconds = 0.6): number | null {
  const frontEnd = new AnalysisFrontEnd(sampleRate);
  const detector = new MPMDetector(ANALYSIS_WINDOW_SIZE);
  const weights = [1, 0.75, 0.5, 0.3, 0.15];
  const total = Math.round(seconds * sampleRate);
  let last: number | null = null;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (let h = 0; h < weights.length; h++) {
      v += weights[h]! * Math.sin(2 * Math.PI * freqHz * (h + 1) * t + 0.73 * (h + 1));
    }
    if (frontEnd.push(v * 0.25)) {
      last = detector.detect(frontEnd.frame, frontEnd.analysisRate).frequency;
    }
  }
  return last;
}

describe('Etapa de entrada (filtros, decimación y ventana)', () => {
  it('Butterworth de 2º orden: −3 dB en los cortes y atenuación leve en A0', () => {
    for (const sr of [44100, 48000, 96000]) {
      const hp = BiquadFilter.highPass(HIGH_PASS_HZ, sr);
      const lp = BiquadFilter.lowPass(LOW_PASS_HZ, sr);
      expect(hp.magnitudeAt(HIGH_PASS_HZ, sr)).toBeCloseTo(Math.SQRT1_2, 3);
      expect(lp.magnitudeAt(LOW_PASS_HZ, sr)).toBeCloseTo(Math.SQRT1_2, 3);
      // A0 (27.5 Hz) pasa con menos de 2.5 dB de atenuación.
      expect(20 * Math.log10(hp.magnitudeAt(27.5, sr))).toBeGreaterThan(-2.5);
    }
  });

  it('elige la decimación para analizar a ~44.1/48 kHz', () => {
    expect(decimationFactor(44100)).toBe(1);
    expect(decimationFactor(48000)).toBe(1);
    expect(decimationFactor(88200)).toBe(2);
    expect(decimationFactor(96000)).toBe(2);
    expect(decimationFactor(192000)).toBe(4);
  });

  it('pipeline completo: < 0.05 cents en graves a 44.1, 48, 88.2, 96 y 192 kHz', () => {
    for (const sampleRate of [44100, 48000, 88200, 96000, 192000]) {
      for (const midi of [23, 28, 33, 40, 45]) {
        const expected = midiToFrequency(midi, 440);
        const detected = runPipeline(expected, sampleRate);
        expect(detected, `MIDI ${midi} @ ${sampleRate}`).not.toBeNull();
        expect(
          Math.abs(centsBetween(detected!, expected)),
          `MIDI ${midi} @ ${sampleRate}`
        ).toBeLessThan(0.05);
      }
    }
  });
});
