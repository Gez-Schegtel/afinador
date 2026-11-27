import pitchWorkletUrl from './pitch-worklet.ts?worker&url';
import type { PitchResult } from '../core/dsp/mpm';
import { PitchSmoother, type SmoothedPitch } from '../core/dsp/smoother';
import { ScreenWakeLocker } from './wake-lock';

export interface TunerEngineCallbacks {
  onPitch: (reading: SmoothedPitch) => void;
  onStateChange?: (running: boolean, sampleRate: number | null) => void;
  onWakeLockChange?: (locked: boolean) => void;
  onError?: (message: string) => void;
}

export class TunerEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;

  private readonly smoother = new PitchSmoother();
  private readonly wakeLocker: ScreenWakeLocker;
  private readonly callbacks: TunerEngineCallbacks;
  private running = false;

  constructor(callbacks: TunerEngineCallbacks) {
    this.callbacks = callbacks;
    this.wakeLocker = new ScreenWakeLocker(callbacks.onWakeLockChange);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public async start(): Promise<void> {
    if (this.running) return;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      this.callbacks.onError?.(
        'El navegador no permite acceder al micrófono en este contexto. Usá HTTPS o localhost (con adb reverse por USB en Android).'
      );
      return;
    }

    try {
      // Pedimos audio crudo desactivando cancelación de eco, supresión de ruido y AGC
      // para preservar el sustain y los armónicos reales de las cuerdas.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      const ctx = new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      await ctx.audioWorklet.addModule(pitchWorkletUrl);

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pitch-worklet-processor');
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      worklet.port.onmessage = (event: MessageEvent<PitchResult>) => {
        const { frequency, clarity, rms } = event.data;
        const smoothed = this.smoother.update(
          frequency,
          clarity,
          rms,
          performance.now()
        );
        this.callbacks.onPitch(smoothed);
      };

      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(ctx.destination);

      this.mediaStream = stream;
      this.audioContext = ctx;
      this.sourceNode = source;
      this.workletNode = worklet;
      this.silentGainNode = silentGain;
      this.smoother.reset();
      this.running = true;

      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
      void this.wakeLocker.enable();
      this.callbacks.onStateChange?.(true, ctx.sampleRate);
    } catch (err) {
      await this.stop();
      const domErr = err as DOMException | undefined;
      if (
        domErr?.name === 'NotAllowedError' ||
        domErr?.name === 'PermissionDeniedError'
      ) {
        this.callbacks.onError?.(
          'Permiso de micrófono denegado. Habilitalo en el ícono de permisos del navegador para poder afinar.'
        );
      } else if (domErr?.name === 'NotFoundError') {
        this.callbacks.onError?.(
          'No se detectó ningún micrófono disponible en este dispositivo.'
        );
      } else {
        this.callbacks.onError?.(
          `No se pudo iniciar el motor de audio: ${domErr?.message ?? 'error desconocido'}`
        );
      }
    }
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }

    await this.wakeLocker.disable();

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.silentGainNode) {
      this.silentGainNode.disconnect();
      this.silentGainNode = null;
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // Ignorar cierre repetido
      }
      this.audioContext = null;
    }

    this.smoother.reset();
    this.callbacks.onStateChange?.(false, null);
  }

  private handleVisibilityChange(): void {
    if (!this.running || !this.audioContext) return;
    if (
      document.visibilityState === 'visible' &&
      this.audioContext.state === 'suspended'
    ) {
      void this.audioContext.resume();
    }
  }
}
