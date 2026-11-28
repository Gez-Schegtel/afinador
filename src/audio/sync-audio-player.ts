// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Reproductor de pista de audio local (.mp3/.wav/.flac/.ogg) sincronizada al Beat-Mapper
 * mediante WSOLA en `AudioWorklet` (cero SharedArrayBuffer) (Spec 014).
 */

import { audioArbitrator } from '../shell/audio-arbitrator';
import wsolaWorkletUrl from './wsola.worklet.ts?worker&url';

export interface DecodedAudioInfo {
  readonly fileName: string;
  readonly sampleRate: number;
  readonly durationSec: number;
  readonly monoSamples: Float32Array;
}

export class SyncAudioPlayer {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private workletReady = false;
  private loadedInfo: DecodedAudioInfo | null = null;
  private playing = false;
  private speedRatio = 1.0;
  private volume = 0.85;
  private onPositionCb: ((timeSec: number) => void) | null = null;
  private onEndedCb: (() => void) | null = null;

  constructor(callbacks?: {
    onPosition?: (timeSec: number) => void;
    onEnded?: () => void;
  }) {
    this.onPositionCb = callbacks?.onPosition ?? null;
    this.onEndedCb = callbacks?.onEnded ?? null;
  }

  private async ensureContextAndWorklet(): Promise<AudioContext> {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
      this.workletReady = false;
      this.workletNode = null;
      this.gainNode = null;
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (!this.workletReady) {
      await this.ctx.audioWorklet.addModule(wsolaWorkletUrl);
      this.workletNode = new AudioWorkletNode(this.ctx, 'wsola-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.workletNode.port.onmessage = (ev: MessageEvent<{ type: string; timeSec?: number }>) => {
        if (ev.data.type === 'position' && typeof ev.data.timeSec === 'number') {
          this.onPositionCb?.(ev.data.timeSec);
        } else if (ev.data.type === 'ended') {
          this.playing = false;
          this.onEndedCb?.();
        }
      };
      this.workletReady = true;
    }
    return this.ctx;
  }

  public async loadAudioBytes(bytes: Uint8Array, fileName: string): Promise<DecodedAudioInfo> {
    const ctx = await this.ensureContextAndWorklet();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const audioBuf = await ctx.decodeAudioData(copy.buffer);

    const len = audioBuf.length;
    const mono = new Float32Array(len);
    const chCount = audioBuf.numberOfChannels;
    for (let c = 0; c < chCount; c++) {
      const chData = audioBuf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        mono[i]! += chData[i]! / chCount;
      }
    }

    const info: DecodedAudioInfo = {
      fileName,
      sampleRate: audioBuf.sampleRate,
      durationSec: audioBuf.duration,
      monoSamples: mono,
    };
    this.loadedInfo = info;

    const sendCopy = new Float32Array(mono);
    this.workletNode?.port.postMessage(
      {
        type: 'load',
        samples: sendCopy,
        sourceSampleRate: audioBuf.sampleRate,
      },
      [sendCopy.buffer]
    );
    return info;
  }

  public async play(): Promise<void> {
    if (!this.loadedInfo) return;
    audioArbitrator.stopConflictsSync('tabs');
    await this.ensureContextAndWorklet();
    this.workletNode?.port.postMessage({ type: 'set-speed', speed: this.speedRatio });
    this.workletNode?.port.postMessage({ type: 'play' });
    this.playing = true;
    audioArbitrator.setActive('tabs', true);
  }

  public pause(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
    this.playing = false;
    audioArbitrator.setActive('tabs', false);
  }

  public seek(timeSec: number): void {
    this.workletNode?.port.postMessage({ type: 'seek', timeSec });
  }

  public setSpeed(ratio: number): void {
    this.speedRatio = Math.max(0.15, Math.min(1.5, ratio));
    this.workletNode?.port.postMessage({ type: 'set-speed', speed: this.speedRatio });
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1.2, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getInfo(): DecodedAudioInfo | null {
    return this.loadedInfo;
  }

  public dispose(): void {
    this.pause();
    this.workletNode?.disconnect();
    this.gainNode?.disconnect();
    this.workletNode = null;
    this.gainNode = null;
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
