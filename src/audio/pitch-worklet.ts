import { MPMDetector } from '../core/dsp/mpm';

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void;

declare const sampleRate: number;

const WINDOW_SIZE = 8192;
const HOP_SIZE = 1024;

/**
 * Filtro Biquad Butterworth de 2º orden en cascada (pasa-altos 24 Hz + pasa-bajos 1800 Hz)
 * para eliminar golpes graves de mesa/soplidos y ruido agudo de ventilador/trastes antes de MPM.
 */
class BiquadFilter {
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;
  private z1 = 0;
  private z2 = 0;

  private constructor(
    b0: number,
    b1: number,
    b2: number,
    a1: number,
    a2: number
  ) {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
  }

  public static highPass(cutoffHz: number, sr: number): BiquadFilter {
    const w0 = (2 * Math.PI * cutoffHz) / sr;
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

  public static lowPass(cutoffHz: number, sr: number): BiquadFilter {
    const w0 = (2 * Math.PI * cutoffHz) / sr;
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

  public processSample(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class PitchWorkletProcessor extends AudioWorkletProcessor {
  private readonly ringBuffer = new Float32Array(WINDOW_SIZE);
  private readonly analysisFrame = new Float32Array(WINDOW_SIZE);
  private readonly detector = new MPMDetector(WINDOW_SIZE);
  private readonly hpFilter = BiquadFilter.highPass(24, sampleRate);
  private readonly lpFilter = BiquadFilter.lowPass(1800, sampleRate);
  private writeIndex = 0;
  private samplesSinceLastHop = 0;
  private samplesCollected = 0;

  public process(inputs: Float32Array[][]): boolean {
    const inputChannels = inputs[0];
    if (!inputChannels || inputChannels.length === 0) {
      return true;
    }

    const channel = inputChannels[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    const len = channel.length;
    for (let i = 0; i < len; i++) {
      const cleanSample = this.lpFilter.processSample(
        this.hpFilter.processSample(channel[i]!)
      );
      this.ringBuffer[this.writeIndex] = cleanSample;
      this.writeIndex++;
      if (this.writeIndex >= WINDOW_SIZE) {
        this.writeIndex = 0;
      }
      if (this.samplesCollected < WINDOW_SIZE) {
        this.samplesCollected++;
      }
      this.samplesSinceLastHop++;

      if (
        this.samplesCollected >= WINDOW_SIZE &&
        this.samplesSinceLastHop >= HOP_SIZE
      ) {
        this.samplesSinceLastHop = 0;
        this.analyzeCurrentWindow();
      }
    }

    return true;
  }

  private analyzeCurrentWindow(): void {
    const split = this.writeIndex;
    const tailLen = WINDOW_SIZE - split;

    this.analysisFrame.set(this.ringBuffer.subarray(split, WINDOW_SIZE), 0);
    if (split > 0) {
      this.analysisFrame.set(this.ringBuffer.subarray(0, split), tailLen);
    }

    const result = this.detector.detect(this.analysisFrame, sampleRate);
    this.port.postMessage(result);
  }
}

registerProcessor('pitch-worklet-processor', PitchWorkletProcessor);
