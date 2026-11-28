// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Procesador WSOLA (Waveform Similarity Overlap-Add) 100% puro en Float32Array (Spec 014).
 * Realiza estiramiento temporal (`0.15×` a `1.50×`) preservando la altura tonal exacta sin usar
 * `SharedArrayBuffer` ni asignar arreglos grandes por cada cuadro de audio procesado.
 */

export const MIN_WSOLA_SPEED = 0.15;
export const MAX_WSOLA_SPEED = 1.5;

export interface WSOLAOptions {
  readonly frameSize?: number;
  readonly searchRadius?: number;
}

/** Correlación normalizada libre de asignaciones entre continuación natural y candidato. */
function scoreCandidate(
  input: Float32Array,
  nat: Float32Array,
  eNat: number,
  candStart: number,
  hs: number,
  stride: number
): number {
  let dot = 0;
  let eCand = 1e-12;
  const maxLen = input.length;
  for (let i = 0; i < hs; i += stride) {
    const a = nat[i]!;
    const b = candStart + i < maxLen ? input[candStart + i]! : 0;
    dot += a * b;
    eCand += b * b;
  }
  return dot / Math.sqrt(eNat * eCand);
}

/**
 * Estira temporalmente una señal mono usando similitud de forma de onda (WSOLA) y ventana
 * Hann con solapamiento exacto de 50% (`w[i] + w[i + N/2] = 1`). Todos los buffers de análisis
 * y búsqueda quedan preasignados en el constructor.
 */
export class WSOLAProcessor {
  public readonly frameSize: number;
  public readonly hopSynth: number;
  public readonly searchRadius: number;
  private readonly hannWindow: Float32Array;
  private readonly naturalContinuation: Float32Array;

  constructor(options: WSOLAOptions = {}) {
    const rawFrame = options.frameSize ?? 2048;
    this.frameSize = rawFrame % 2 === 0 ? rawFrame : rawFrame + 1;
    this.hopSynth = this.frameSize >> 1;
    this.searchRadius = options.searchRadius ?? 512;

    this.hannWindow = new Float32Array(this.frameSize);
    for (let i = 0; i < this.frameSize; i++) {
      this.hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / this.frameSize));
    }
    this.naturalContinuation = new Float32Array(this.hopSynth);
  }

  public stretchInto(
    input: Float32Array,
    speedRatio: number,
    output: Float32Array
  ): number {
    const clampedSpeed = Math.max(MIN_WSOLA_SPEED, Math.min(MAX_WSOLA_SPEED, speedRatio));
    const expectedLen = Math.max(
      this.frameSize,
      Math.floor(input.length / clampedSpeed)
    );
    const outLen = Math.min(output.length, expectedLen);
    output.fill(0, 0, outLen);

    if (input.length === 0) return 0;

    // Caso 1.0x rápido sin coste
    if (Math.abs(clampedSpeed - 1) < 1e-4) {
      const n = Math.min(input.length, outLen);
      output.set(input.subarray(0, n), 0);
      return n;
    }

    const hopAnalysis = Math.max(1, Math.round(this.hopSynth * clampedSpeed));
    const N = this.frameSize;
    const Hs = this.hopSynth;
    const R = this.searchRadius;
    const w = this.hannWindow;
    const nat = this.naturalContinuation;

    // Copiar primer cuadro ventaneado directamente en posición 0
    for (let i = 0; i < N && i < input.length && i < outLen; i++) {
      output[i] = input[i]! * w[i]!;
    }

    let prevChosenStart = 0;
    let outCursor = Hs;
    let nominalIn = hopAnalysis;

    while (outCursor + N <= outLen && nominalIn < input.length) {
      // Capturar continuación natural del cuadro anterior dentro del buffer preasignado `nat`
      const natStart = prevChosenStart + Hs;
      let eNatFull = 1e-12;
      let eNatCoarse = 1e-12;
      for (let i = 0; i < Hs; i++) {
        const v = natStart + i < input.length ? input[natStart + i]! : 0;
        nat[i] = v;
        const sq = v * v;
        eNatFull += sq;
        if ((i & 1) === 0) eNatCoarse += sq;
      }

      // Búsqueda gruesa→fina en d ∈ [-R, +R] maximizando similitud normalizada
      const minDelta = -Math.min(R, nominalIn);
      const maxDelta = Math.min(R, Math.max(0, input.length - 1 - (nominalIn + N)));
      let coarseDelta = 0;
      let coarseBest = -Infinity;

      for (let d = minDelta; d <= maxDelta; d += 4) {
        const ncc = scoreCandidate(input, nat, eNatCoarse, nominalIn + d, Hs, 2);
        if (ncc > coarseBest) {
          coarseBest = ncc;
          coarseDelta = d;
        }
      }

      const fineStart = Math.max(minDelta, coarseDelta - 3);
      const fineEnd = Math.min(maxDelta, coarseDelta + 3);
      let bestDelta = coarseDelta;
      let bestScore = -Infinity;
      for (let d = fineStart; d <= fineEnd; d++) {
        const ncc = scoreCandidate(input, nat, eNatFull, nominalIn + d, Hs, 1);
        if (ncc > bestScore) {
          bestScore = ncc;
          bestDelta = d;
        }
      }

      const chosenStart = Math.max(0, nominalIn + bestDelta);
      for (let i = 0; i < N; i++) {
        const sample = chosenStart + i < input.length ? input[chosenStart + i]! : 0;
        output[outCursor + i] = (output[outCursor + i] ?? 0) + sample * w[i]!;
      }

      prevChosenStart = chosenStart;
      outCursor += Hs;
      nominalIn += hopAnalysis;
    }

    return Math.min(outLen, outCursor + Hs);
  }
}

export function timeStretchWSOLA(input: Float32Array, speedRatio: number): Float32Array {
  const clamped = Math.max(MIN_WSOLA_SPEED, Math.min(MAX_WSOLA_SPEED, speedRatio));
  const outLen = Math.max(2048, Math.ceil(input.length / clamped));
  const processor = new WSOLAProcessor();
  const out = new Float32Array(outLen);
  const written = processor.stretchInto(input, clamped, out);
  return out.subarray(0, written);
}
