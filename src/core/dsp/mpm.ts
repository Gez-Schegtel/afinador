/**
 * Motor DSP de Alta Precisión e Inmunidad Acústica (Float64) para Guitarra y Bajo:
 *
 * 1. FFT-MPM (McLeod Pitch Method acelerado por FFT en 64 bits sobre 8192 muestras):
 *    Calcula la NSDF exacta mediante Wiener–Khinchin O(N log N) (FFT real empaquetada, la mitad
 *    del costo de una FFT compleja) + recurrencia exacta de energía. Detecta desde 25 Hz (un A0
 *    de 27.5 Hz hasta ~165 cents bajo) hasta 2000 Hz sin saltos de octava.
 *
 * 2. Refinamiento Espectral de Log-Magnitud QIFFT con Ventana Blackman–Harris de 4 términos:
 *    Opera únicamente sobre la magnitud |X(ω)| de las 8192 muestras completas (sin derivadas
 *    de fase sensibles a ecos de sala), con rechazo lateral > 92 dB. Peor error medido por la
 *    suite: < 0.03 cents en señales armónicas sin ruido (A0–B6). Si la fundamental es débil se
 *    refina sobre el 2º armónico, con histéresis para no saltar entre ambos modos.
 */

import { RealAutocorrelator } from './fft';

export interface MPMOptions {
  /** Umbral mínimo de energía RMS para puerta de ruido (default: 0.0035) */
  minRms?: number;
  /** Fracción del pico NSDF máximo requerida para elegir el primer armónico (default: 0.90) */
  clarityThreshold?: number;
  /** Claridad periódica mínima aceptable en [0, 1] (default: 0.72) */
  minClarity?: number;
  /** Frecuencia mínima detectable en Hz (default: 25 Hz — A0 hasta ~165 cents bajo, sobre el pasa-altos de 24 Hz) */
  minFreq?: number;
  /** Frecuencia máxima detectable en Hz (default: 2000 Hz) */
  maxFreq?: number;
}

export interface PitchResult {
  frequency: number | null;
  clarity: number;
  rms: number;
}

const DEFAULT_OPTIONS: Required<MPMOptions> = {
  minRms: 0.0035,
  clarityThreshold: 0.9,
  minClarity: 0.72,
  minFreq: 25,
  maxFreq: 2000,
};

/** Opciones del modo Automático (las por defecto). */
export const AUTO_DETECTION_OPTIONS: Readonly<Required<MPMOptions>> = DEFAULT_OPTIONS;

/** Rango del modo Manual alrededor de la nota objetivo (Spec 001): −11.5 / +5 semitonos. */
export const MANUAL_RANGE_SEMITONES_BELOW = 11.5;
export const MANUAL_RANGE_SEMITONES_ABOVE = 5;

/**
 * Opciones del modo Manual para una nota objetivo: ventana asimétrica para cuerdas muy flojas sin
 * saltar al 2º armónico, sensibilidad aumentada y elección estricta del primer máximo.
 */
export function manualDetectionOptions(targetHz: number): Required<MPMOptions> {
  return {
    minFreq: Math.max(25, targetHz * Math.pow(2, -MANUAL_RANGE_SEMITONES_BELOW / 12)),
    maxFreq: Math.min(2200, targetHz * Math.pow(2, MANUAL_RANGE_SEMITONES_ABOVE / 12)),
    minRms: 0.0025,
    minClarity: 0.58,
    clarityThreshold: 0.92,
  };
}

/** Por debajo de esta cantidad de bins la fundamental queda pegada a su imagen negativa (QIFFT sesgado). */
const MIN_REFINE_BINS = 4;
/** Histéresis del refinamiento sobre el 2º armónico (cociente de magnitudes 2º/1º). */
const HARMONIC_ENTER_LOG = Math.log(2.5);
const HARMONIC_EXIT_LOG = Math.log(2.0);

export class MPMDetector {
  private readonly bufferSize: number;
  private readonly autocorrelator: RealAutocorrelator;
  private readonly acf: Float64Array;
  private readonly centered: Float64Array;
  private readonly nsdf: Float64Array;
  private readonly peakTaus: Int32Array;
  private readonly peakValues: Float64Array;
  private readonly bhWindow: Float64Array;
  /** Estado de la histéresis fundamental ↔ 2º armónico. */
  private harmonicMode = false;

  constructor(bufferSize: number = 8192) {
    this.bufferSize = bufferSize;
    this.autocorrelator = new RealAutocorrelator(bufferSize);
    this.acf = new Float64Array(bufferSize);

    this.centered = new Float64Array(bufferSize);
    this.nsdf = new Float64Array(bufferSize);
    this.peakTaus = new Int32Array(bufferSize >>> 1);
    this.peakValues = new Float64Array(bufferSize >>> 1);

    this.bhWindow = new Float64Array(bufferSize);
    const denom = bufferSize - 1;
    for (let i = 0; i < bufferSize; i++) {
      const r = denom > 0 ? i / denom : 0;
      this.bhWindow[i] =
        0.35875 -
        0.48829 * Math.cos(2 * Math.PI * r) +
        0.14128 * Math.cos(4 * Math.PI * r) -
        0.01168 * Math.cos(6 * Math.PI * r);
    }
  }

  /** Olvida el estado entre cuadros (llamar al cambiar de nota objetivo o de modo). */
  public reset(): void {
    this.harmonicMode = false;
  }

  public detect(
    input: Float32Array | Float64Array,
    sampleRate: number,
    options?: MPMOptions
  ): PitchResult {
    const n = Math.min(input.length, this.bufferSize);
    if (n < 128 || sampleRate <= 0) {
      return { frequency: null, clarity: 0, rms: 0 };
    }

    const minRms = options?.minRms ?? DEFAULT_OPTIONS.minRms;
    const clarityThreshold =
      options?.clarityThreshold ?? DEFAULT_OPTIONS.clarityThreshold;
    const minClarity = options?.minClarity ?? DEFAULT_OPTIONS.minClarity;
    const minFreq = options?.minFreq ?? DEFAULT_OPTIONS.minFreq;
    const maxFreq = options?.maxFreq ?? DEFAULT_OPTIONS.maxFreq;

    // 1. Eliminar offset DC y calcular RMS en doble precisión
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i]!;
    }
    const mean = sum / n;

    let sumSq = 0;
    const centered = this.centered;
    for (let i = 0; i < n; i++) {
      const v = input[i]! - mean;
      centered[i] = v;
      sumSq += v * v;
    }

    const rms = Math.sqrt(sumSq / n);
    if (rms < minRms) {
      this.harmonicMode = false;
      return { frequency: null, clarity: 0, rms };
    }

    const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
    const maxTau = Math.min(n - 2, Math.ceil(sampleRate / minFreq));
    if (minTau >= maxTau) {
      return { frequency: null, clarity: 0, rms };
    }

    // 2. Autocorrelación lineal exacta vía FFT real (Wiener–Khinchin)
    const limitTau = Math.min(n - 1, maxTau + 2);
    const acf = this.acf;
    this.autocorrelator.compute(centered, n, acf, limitTau);

    // 3. Normalización NSDF exacta con recurrencia O(N) de McLeod & Wyvill
    const nsdf = this.nsdf;
    nsdf[0] = 1;
    let mTau = 2 * sumSq;

    for (let tau = 1; tau <= limitTau; tau++) {
      const left = centered[n - tau]!;
      const right = centered[tau - 1]!;
      mTau -= left * left + right * right;
      if (mTau > 1e-18) {
        const raw = (2 * acf[tau]!) / mTau;
        nsdf[tau] = raw > 1 ? 1 : raw < -1 ? -1 : raw;
      } else {
        nsdf[tau] = 0;
      }
    }

    // 4. Extraer key maxima (máximo de cada lóbulo positivo tras el primer cruce <= 0)
    let tau = 1;
    while (tau <= maxTau && nsdf[tau]! > 0) {
      tau++;
    }

    let peakCount = 0;
    let highestPeakValue = 0;

    while (tau <= maxTau) {
      while (tau <= maxTau && nsdf[tau]! <= 0) {
        tau++;
      }
      if (tau > maxTau) break;

      let lobeMaxTau = 0;
      let lobeMaxVal = -Infinity;

      while (tau <= maxTau && nsdf[tau]! > 0) {
        const val = nsdf[tau]!;
        if (val > lobeMaxVal) {
          lobeMaxVal = val;
          lobeMaxTau = tau;
        }
        tau++;
      }

      if (lobeMaxTau >= minTau && lobeMaxTau <= maxTau && lobeMaxVal > 0) {
        this.peakTaus[peakCount] = lobeMaxTau;
        this.peakValues[peakCount] = lobeMaxVal;
        peakCount++;
        if (lobeMaxVal > highestPeakValue) {
          highestPeakValue = lobeMaxVal;
        }
      }
    }

    if (peakCount === 0 || highestPeakValue < minClarity) {
      this.harmonicMode = false;
      return {
        frequency: null,
        clarity: highestPeakValue > 0 ? highestPeakValue : 0,
        rms,
      };
    }

    // 5. Seleccionar el primer key maximum que alcance clarityThreshold * highestPeakValue
    const threshold = clarityThreshold * highestPeakValue;
    let chosenTau = -1;
    let chosenVal = 0;

    for (let i = 0; i < peakCount; i++) {
      const val = this.peakValues[i]!;
      if (val >= threshold) {
        chosenTau = this.peakTaus[i]!;
        chosenVal = val;
        break;
      }
    }

    if (chosenTau < 1 || chosenTau >= limitTau) {
      return { frequency: null, clarity: 0, rms };
    }

    // 6. Interpolación parabólica de 3 puntos para estimación inicial de f0 y claridad
    const y1 = nsdf[chosenTau - 1]!;
    const y2 = chosenVal;
    const y3 = nsdf[chosenTau + 1]!;
    const denom = 2 * (2 * y2 - y1 - y3);

    let refinedTau = chosenTau;
    let refinedClarity = y2;

    if (Math.abs(denom) > 1e-15) {
      const delta = (y3 - y1) / denom;
      if (delta > -1 && delta < 1) {
        refinedTau = chosenTau + delta;
        refinedClarity = Math.min(
          1,
          Math.max(0, y2 + 0.25 * (y3 - y1) * delta)
        );
      }
    }

    if (refinedClarity < minClarity || refinedTau <= 0) {
      return { frequency: null, clarity: refinedClarity, rms };
    }

    const mpmFrequency = sampleRate / refinedTau;
    if (mpmFrequency < minFreq || mpmFrequency > maxFreq) {
      return { frequency: null, clarity: refinedClarity, rms };
    }

    // 7. Refinamiento espectral QIFFT de log-magnitud sobre ventana Blackman–Harris completa
    const frequency =
      n === this.bufferSize
        ? this.refineBySpectralMagnitude(mpmFrequency, sampleRate)
        : mpmFrequency;

    return {
      frequency,
      clarity: refinedClarity,
      rms,
    };
  }

  private logMagnitudeAt(omega: number): number {
    const n = this.bufferSize;
    const x = this.centered;
    const win = this.bhWindow;

    const stepCos = Math.cos(omega);
    const stepSin = Math.sin(omega);
    let c = 1;
    let s = 0;
    let re = 0;
    let im = 0;

    for (let i = 0; i < n; i++) {
      if ((i & 255) === 0 && i > 0) {
        const ang = omega * i;
        c = Math.cos(ang);
        s = Math.sin(ang);
      }
      const v = x[i]! * win[i]!;
      re += v * c;
      im -= v * s;

      const nextCos = c * stepCos - s * stepSin;
      s = s * stepCos + c * stepSin;
      c = nextCos;
    }

    return 0.5 * Math.log(re * re + im * im + 1e-30);
  }

  private parabolicQifft(
    fCenter: number,
    centerLogMag: number,
    sampleRate: number
  ): number {
    const w0 = (2 * Math.PI * fCenter) / sampleRate;
    const dw = (0.5 * Math.PI) / this.bufferSize; // 0.25 bin DFT
    const y1 = this.logMagnitudeAt(w0 - dw);
    const y2 = centerLogMag;
    const y3 = this.logMagnitudeAt(w0 + dw);

    const denom = 2 * (2 * y2 - y1 - y3);
    if (denom <= 1e-12) {
      return fCenter;
    }

    const delta = Math.max(-2, Math.min(2, (y3 - y1) / denom));
    const refined = ((w0 + delta * dw) * sampleRate) / (2 * Math.PI);

    if (
      !Number.isFinite(refined) ||
      Math.abs(1200 * Math.log2(refined / fCenter)) > 10
    ) {
      return fCenter;
    }

    return refined;
  }

  private refineBySpectralMagnitude(
    f0Estimate: number,
    sampleRate: number
  ): number {
    const binHz = sampleRate / this.bufferSize;
    const fundamentalTooCloseToDc = f0Estimate / binHz < MIN_REFINE_BINS;
    const harmonicAvailable = 2 * f0Estimate < sampleRate * 0.45;
    const lm1 = this.logMagnitudeAt((2 * Math.PI * f0Estimate) / sampleRate);

    if (harmonicAvailable) {
      const lm2 = this.logMagnitudeAt((4 * Math.PI * f0Estimate) / sampleRate);
      // Fundamental atenuada (< 40% del 2º armónico al entrar, < 50% para salir): refinar sobre
      // 2·f0 y dividir por 2. La histéresis evita saltos de 0.3–1.6 cents en cuerdas inarmónicas.
      const ratioLog = lm2 - lm1;
      if (this.harmonicMode) {
        if (ratioLog < HARMONIC_EXIT_LOG) this.harmonicMode = false;
      } else if (ratioLog > HARMONIC_ENTER_LOG) {
        this.harmonicMode = true;
      }
      if (this.harmonicMode || fundamentalTooCloseToDc) {
        return this.parabolicQifft(2 * f0Estimate, lm2, sampleRate) / 2;
      }
    } else {
      this.harmonicMode = false;
    }

    // Con la fundamental pegada a DC, el QIFFT se sesga: quedarse con la estimación MPM.
    if (fundamentalTooCloseToDc) {
      return f0Estimate;
    }
    return this.parabolicQifft(f0Estimate, lm1, sampleRate);
  }
}

/**
 * Función pura de conveniencia para tests y análisis puntual.
 */
export function detectPitchMPM(
  buffer: Float32Array | Float64Array,
  sampleRate: number,
  options?: MPMOptions
): PitchResult {
  const detector = new MPMDetector(buffer.length);
  return detector.detect(buffer, sampleRate, options);
}
