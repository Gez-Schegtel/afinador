/**
 * Etapa de entrada del análisis (puro, sin APIs del navegador): pasa-banda Butterworth de
 * 2º orden en cascada (24 Hz – 1800 Hz), decimación entera hacia ~44.1/48 kHz y ventana
 * deslizante con salto fijo. La usan el AudioWorklet y los tests de pipeline completo.
 *
 * Decimar después del pasa-bajos de 1800 Hz mantiene la ventana de 8192 muestras en ~170 ms
 * aunque el dispositivo trabaje a 88.2, 96 o 192 kHz (a esas tasas, sin decimar, la ventana
 * se acortaba a 43–93 ms y el error en graves subía a 1–5 cents).
 */

export const ANALYSIS_WINDOW_SIZE = 8192;
export const ANALYSIS_HOP_SIZE = 1024;
export const HIGH_PASS_HZ = 24;
export const LOW_PASS_HZ = 1800;
const TARGET_ANALYSIS_RATE = 48000;

/** Filtro Biquad (forma directa II transpuesta) con coeficientes Butterworth (Q = 1/√2). */
export class BiquadFilter {
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;
  private z1 = 0;
  private z2 = 0;

  private constructor(b0: number, b1: number, b2: number, a1: number, a2: number) {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
  }

  public static highPass(cutoffHz: number, sampleRate: number): BiquadFilter {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / Math.SQRT2;
    const a0 = 1 + alpha;
    return new BiquadFilter(
      (1 + cosW0) / 2 / a0,
      -(1 + cosW0) / a0,
      (1 + cosW0) / 2 / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0
    );
  }

  public static lowPass(cutoffHz: number, sampleRate: number): BiquadFilter {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / Math.SQRT2;
    const a0 = 1 + alpha;
    return new BiquadFilter(
      (1 - cosW0) / 2 / a0,
      (1 - cosW0) / a0,
      (1 - cosW0) / 2 / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0
    );
  }

  /** Magnitud de la respuesta en frecuencia |H(e^{jω})| a `freqHz`. */
  public magnitudeAt(freqHz: number, sampleRate: number): number {
    const w = (2 * Math.PI * freqHz) / sampleRate;
    const c1 = Math.cos(w);
    const s1 = Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = Math.sin(2 * w);
    const nr = this.b0 + this.b1 * c1 + this.b2 * c2;
    const ni = -(this.b1 * s1 + this.b2 * s2);
    const dr = 1 + this.a1 * c1 + this.a2 * c2;
    const di = -(this.a1 * s1 + this.a2 * s2);
    return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }

  public processSample(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Factor de decimación entero para analizar a ~44.1/48 kHz (1 a 44.1/48 kHz, 2 a 88.2/96, 4 a 192). */
export function decimationFactor(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / TARGET_ANALYSIS_RATE));
}

export class AnalysisFrontEnd {
  public readonly inputRate: number;
  public readonly decimation: number;
  public readonly analysisRate: number;
  /** Último cuadro de análisis (en orden temporal), válido cuando `push()` devuelve true. */
  public readonly frame: Float64Array;

  private readonly windowSize: number;
  private readonly hopSize: number;
  private readonly ring: Float64Array;
  private readonly highPass: BiquadFilter;
  private readonly lowPass: BiquadFilter;
  private writeIndex = 0;
  private collected = 0;
  private sinceHop = 0;
  private phase = 0;

  constructor(
    sampleRate: number,
    windowSize: number = ANALYSIS_WINDOW_SIZE,
    hopSize: number = ANALYSIS_HOP_SIZE
  ) {
    this.inputRate = sampleRate;
    this.decimation = decimationFactor(sampleRate);
    this.analysisRate = sampleRate / this.decimation;
    this.windowSize = windowSize;
    this.hopSize = hopSize;
    this.ring = new Float64Array(windowSize);
    this.frame = new Float64Array(windowSize);
    this.highPass = BiquadFilter.highPass(HIGH_PASS_HZ, sampleRate);
    this.lowPass = BiquadFilter.lowPass(LOW_PASS_HZ, sampleRate);
  }

  /** Procesa una muestra de entrada. Devuelve true cuando hay un cuadro nuevo en `frame`. */
  public push(sample: number): boolean {
    const filtered = this.lowPass.processSample(this.highPass.processSample(sample));
    this.phase++;
    if (this.phase < this.decimation) return false;
    this.phase = 0;

    this.ring[this.writeIndex] = filtered;
    this.writeIndex++;
    if (this.writeIndex >= this.windowSize) this.writeIndex = 0;
    if (this.collected < this.windowSize) this.collected++;
    this.sinceHop++;

    if (this.collected >= this.windowSize && this.sinceHop >= this.hopSize) {
      this.sinceHop = 0;
      const split = this.writeIndex;
      const tail = this.windowSize - split;
      this.frame.set(this.ring.subarray(split), 0);
      if (split > 0) this.frame.set(this.ring.subarray(0, split), tail);
      return true;
    }
    return false;
  }
}
