// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * AudioWorklet estándar de Time-Stretching WSOLA (Spec 014) sin SharedArrayBuffer.
 * Todas las memorias de trabajo están preasignadas para operar en tiempo real con
 * cero asignaciones por bloque en `process()`.
 */

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

type WsolaWorkletCommand =
  | { type: 'load'; samples: Float32Array; sourceSampleRate: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; timeSec: number }
  | { type: 'set-speed'; speed: number };

const FRAME_SIZE = 2048;
const HOP_SYNTH = 1024;
const SEARCH_RADIUS = 512;

class WsolaWorkletProcessor extends AudioWorkletProcessor {
  private sourcePcm: Float32Array = new Float32Array(0);
  private sourceSr = sampleRate;
  private speed = 1.0;
  private playing = false;

  // Cursores en muestras del audio original
  private inPos = 0;
  private prevChosenStart = 0;
  private msgCounter = 0;

  // Buffers preasignados (cero asignaciones dentro de `process()`)
  private readonly hann = new Float32Array(FRAME_SIZE);
  private readonly natRef = new Float32Array(HOP_SYNTH);
  private readonly synthOut = new Float32Array(FRAME_SIZE);
  private synthReadPos = FRAME_SIZE;

  constructor() {
    super();
    for (let i = 0; i < FRAME_SIZE; i++) {
      this.hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FRAME_SIZE));
    }

    this.port.onmessage = (e: MessageEvent<WsolaWorkletCommand>) => {
      const cmd = e.data;
      if (cmd.type === 'load') {
        this.sourcePcm = cmd.samples;
        this.sourceSr = cmd.sourceSampleRate > 0 ? cmd.sourceSampleRate : sampleRate;
        this.inPos = 0;
        this.prevChosenStart = 0;
        this.synthOut.fill(0);
        this.synthReadPos = HOP_SYNTH;
      } else if (cmd.type === 'play') {
        this.playing = true;
      } else if (cmd.type === 'pause') {
        this.playing = false;
      } else if (cmd.type === 'seek') {
        const targetSample = Math.max(
          0,
          Math.min(Math.max(0, this.sourcePcm.length - 1), Math.round(cmd.timeSec * this.sourceSr))
        );
        this.inPos = targetSample;
        this.prevChosenStart = targetSample;
        this.synthOut.fill(0);
        this.synthReadPos = HOP_SYNTH;
      } else if (cmd.type === 'set-speed') {
        this.speed = Math.max(0.15, Math.min(1.5, cmd.speed));
      }
    };
  }

  private renderNextHop(): void {
    const pcm = this.sourcePcm;
    const n = pcm.length;
    if (n === 0 || this.inPos >= n) {
      this.playing = false;
      this.port.postMessage({ type: 'ended' });
      return;
    }

    // Desplazar mitad superior del buffer de síntesis (overlap residual) hacia la primera mitad
    for (let i = 0; i < HOP_SYNTH; i++) {
      this.synthOut[i] = this.synthOut[i + HOP_SYNTH]!;
      this.synthOut[i + HOP_SYNTH] = 0;
    }

    const natStart = this.prevChosenStart + HOP_SYNTH;
    for (let i = 0; i < HOP_SYNTH; i++) {
      this.natRef[i] = natStart + i < n ? pcm[natStart + i]! : 0;
    }

    let bestDelta = 0;
    if (Math.abs(this.speed - 1.0) >= 0.005) {
      const minD = -Math.min(SEARCH_RADIUS, this.inPos);
      const maxD = Math.min(SEARCH_RADIUS, Math.max(0, n - 1 - (this.inPos + FRAME_SIZE)));
      let bestNcc = -Infinity;
      for (let d = minD; d <= maxD; d++) {
        const cand = this.inPos + d;
        let dot = 0;
        let eA = 1e-12;
        let eB = 1e-12;
        for (let i = 0; i < HOP_SYNTH; i += 2) {
          const a = this.natRef[i]!;
          const b = cand + i < n ? pcm[cand + i]! : 0;
          dot += a * b;
          eA += a * a;
          eB += b * b;
        }
        const ncc = dot / Math.sqrt(eA * eB);
        if (ncc > bestNcc) {
          bestNcc = ncc;
          bestDelta = d;
        }
      }
    }

    const chosen = Math.max(0, this.inPos + bestDelta);
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = chosen + i < n ? pcm[chosen + i]! : 0;
      this.synthOut[i] = this.synthOut[i]! + s * this.hann[i]!;
    }

    this.prevChosenStart = chosen;
    const hopAnalysis = Math.max(1, Math.round(HOP_SYNTH * this.speed * (this.sourceSr / sampleRate)));
    this.inPos += hopAnalysis;
    this.synthReadPos = 0;
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;

    if (!this.playing || this.sourcePcm.length === 0) {
      out.fill(0);
      return true;
    }

    for (let i = 0; i < out.length; i++) {
      if (this.synthReadPos >= HOP_SYNTH) {
        this.renderNextHop();
        if (!this.playing) {
          out.fill(0, i);
          break;
        }
      }
      out[i] = this.synthOut[this.synthReadPos++]!;
    }

    this.msgCounter++;
    if (this.msgCounter >= 18) {
      this.msgCounter = 0;
      this.port.postMessage({
        type: 'position',
        timeSec: this.inPos / Math.max(1, this.sourceSr),
      });
    }
    return true;
  }
}

registerProcessor('wsola-processor', WsolaWorkletProcessor);
