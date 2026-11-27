import {
  AUTO_DETECTION_OPTIONS,
  MPMDetector,
  manualDetectionOptions,
  type MPMOptions,
} from '../core/dsp/mpm';
import { ANALYSIS_WINDOW_SIZE, AnalysisFrontEnd } from '../core/dsp/frontend';

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

interface WorkletCommandMessage {
  type: 'set-target';
  targetHz: number | null;
}

/**
 * Procesador de afinación: filtra (24–1800 Hz), decima a ~44.1/48 kHz si hace falta, arma
 * ventanas de 8192 muestras cada 1024 y detecta la altura con MPM + QIFFT (src/core/dsp/).
 * Sin asignaciones grandes por cuadro: todo se preasigna en el constructor.
 */
class PitchWorkletProcessor extends AudioWorkletProcessor {
  private readonly frontEnd = new AnalysisFrontEnd(sampleRate);
  private readonly detector = new MPMDetector(ANALYSIS_WINDOW_SIZE);
  /** Opciones vigentes, recalculadas solo al cambiar la nota objetivo. */
  private options: MPMOptions = AUTO_DETECTION_OPTIONS;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletCommandMessage>) => {
      if (event.data?.type === 'set-target') {
        const targetHz = event.data.targetHz;
        this.options =
          targetHz !== null && targetHz > 0
            ? manualDetectionOptions(targetHz)
            : AUTO_DETECTION_OPTIONS;
        this.detector.reset();
      }
    };
  }

  public process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    const frontEnd = this.frontEnd;
    for (let i = 0; i < channel.length; i++) {
      if (frontEnd.push(channel[i]!)) {
        this.port.postMessage(
          this.detector.detect(frontEnd.frame, frontEnd.analysisRate, this.options)
        );
      }
    }
    return true;
  }
}

registerProcessor('pitch-worklet-processor', PitchWorkletProcessor);
