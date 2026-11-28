// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Sintetizador puro de Tonos de Referencia Audibles por Web Audio API (Spec 012).
 * Cero archivos grabados: calcula los parciales exactos desde `midiToFrequency(midi, a4Hz)` y
 * se coordina con `AudioArbitrator` ('tone') para detener el micrófono del afinador al sonar.
 */

import { midiToFrequency } from '../core/music/notes';
import { audioArbitrator, type AudioArbitrator } from '../shell/audio-arbitrator';

export interface HarmonicPartial {
  readonly freqHz: number;
  readonly gain: number;
  readonly type: OscillatorType;
}

const PLUCK_WEIGHTS: ReadonlyArray<{ ratio: number; gain: number; type: OscillatorType }> = [
  { ratio: 1, gain: 0.62, type: 'triangle' },
  { ratio: 2, gain: 0.24, type: 'sine' },
  { ratio: 3, gain: 0.10, type: 'sine' },
  { ratio: 4, gain: 0.04, type: 'sine' },
];

export function computePluckedStringHarmonics(
  midi: number,
  a4Hz: number
): {
  readonly fundamentalHz: number;
  readonly partials: readonly HarmonicPartial[];
} {
  const fundamentalHz = midiToFrequency(midi, a4Hz);
  return {
    fundamentalHz,
    partials: PLUCK_WEIGHTS.map((w) => ({
      freqHz: fundamentalHz * w.ratio,
      gain: w.gain,
      type: w.type,
    })),
  };
}

export class ReferenceToneEngine {
  private ctx: AudioContext | null = null;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeNodes: { stop?: () => void; disconnect: () => void }[] = [];
  private readonly arbitrator: AudioArbitrator;
  private readonly unregister: () => void;

  constructor(arbitrator: AudioArbitrator = audioArbitrator) {
    this.arbitrator = arbitrator;
    this.unregister = this.arbitrator.register('tone', {
      stop: () => this.stop(),
    });
  }

  public async play(midi: number, a4Hz: number, durationSec = 1.65): Promise<void> {
    this.stop();
    await this.arbitrator.acquire('tone');

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { fundamentalHz, partials } = computePluckedStringHarmonics(midi, a4Hz);

    const masterGain = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(Math.min(5200, Math.max(600, fundamentalHz * 7.5)), now);
    lowpass.frequency.exponentialRampToValueAtTime(
      Math.min(2800, Math.max(260, fundamentalHz * 2.5)),
      now + durationSec
    );

    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec);

    lowpass.connect(masterGain);
    masterGain.connect(ctx.destination);

    const nodes: { stop?: () => void; disconnect: () => void }[] = [lowpass, masterGain];
    for (const p of partials) {
      if (p.freqHz >= ctx.sampleRate * 0.45) continue;
      const osc = ctx.createOscillator();
      const pGain = ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.freqHz, now);
      pGain.gain.setValueAtTime(p.gain, now);
      osc.connect(pGain);
      pGain.connect(lowpass);
      osc.start(now);
      osc.stop(now + durationSec + 0.03);
      nodes.push(osc, pGain);
    }

    this.activeNodes = nodes;
    this.arbitrator.setActive('tone', true);

    this.activeTimer = setTimeout(() => {
      this.stop();
    }, Math.round((durationSec + 0.05) * 1000));
  }

  public stop(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    for (const n of this.activeNodes) {
      try {
        n.stop?.();
      } catch {
        // Ignorar nodos ya detenidos
      }
      try {
        n.disconnect();
      } catch {
        // Ignorar desconexión
      }
    }
    this.activeNodes = [];
    this.arbitrator.setActive('tone', false);
  }

  public dispose(): void {
    this.stop();
    this.unregister();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
