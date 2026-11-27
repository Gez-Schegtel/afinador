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

// 8192 muestras (~170 ms a 48 kHz) garantizan > 5 ciclos completos incluso en B0 (30.87 Hz) de bajo de 5 cuerdas,
// mientras que HOP_SIZE = 1024 (~21.3 ms) mantiene ~46.9 actualizaciones por segundo.
const WINDOW_SIZE = 8192;
const HOP_SIZE = 1024;

class PitchWorkletProcessor extends AudioWorkletProcessor {
  private readonly ringBuffer = new Float32Array(WINDOW_SIZE);
  private readonly analysisFrame = new Float32Array(WINDOW_SIZE);
  private readonly detector = new MPMDetector(WINDOW_SIZE);
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
      this.ringBuffer[this.writeIndex] = channel[i]!;
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
