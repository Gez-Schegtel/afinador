import pitchWorkletUrl from './pitch-worklet.ts?worker&url';
import type { PitchResult } from '../core/dsp/mpm';
import { PitchSmoother, type SmoothedPitch } from '../core/dsp/smoother';
import { ScreenWakeLocker } from './wake-lock';

/** Estado del motor: el arranque y la detención son asíncronos (permiso de micrófono, worklet). */
export type TunerEngineStatus = 'idle' | 'starting' | 'running' | 'stopping';

export interface TunerEngineCallbacks {
  onPitch: (reading: SmoothedPitch) => void;
  onStateChange?: (running: boolean, sampleRate: number | null) => void;
  onStatusChange?: (status: TunerEngineStatus) => void;
  onWakeLockChange?: (locked: boolean) => void;
  onError?: (message: string) => void;
}

function releaseResources(
  stream: MediaStream | null,
  ctx: AudioContext | null
): Promise<void> {
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
  if (!ctx) return Promise.resolve();
  return ctx.close().catch(() => {
    // Ignorar cierre repetido
  });
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
  private status: TunerEngineStatus = 'idle';
  /** Se incrementa en cada stop(): un arranque en curso de otra generación se descarta. */
  private generation = 0;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private targetHz: number | null = null;

  constructor(callbacks: TunerEngineCallbacks) {
    this.callbacks = callbacks;
    this.wakeLocker = new ScreenWakeLocker(callbacks.onWakeLockChange);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  public setTargetFrequency(
    targetHz: number | null,
    resetSmoother: boolean = false
  ): void {
    this.targetHz = targetHz;
    this.smoother.setManualMode(targetHz !== null);
    if (resetSmoother) {
      this.smoother.reset();
    }
    this.workletNode?.port.postMessage({
      type: 'set-target',
      targetHz,
    });
  }

  public getStatus(): TunerEngineStatus {
    return this.status;
  }

  public isRunning(): boolean {
    return this.status === 'running';
  }

  private setStatus(status: TunerEngineStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  /**
   * Arranca la captura. Es reentrante: mientras un arranque está en curso, las llamadas
   * repetidas devuelven la misma promesa (un doble toque no crea dos motores).
   */
  public start(): Promise<void> {
    if (this.status === 'running') return Promise.resolve();
    if (this.status === 'starting' && this.startPromise) {
      return this.startPromise;
    }
    if (this.status === 'stopping' && this.stopPromise) {
      return this.stopPromise.then(() => this.start());
    }

    this.setStatus('starting');
    const generation = this.generation;
    const promise = this.doStart(generation).finally(() => {
      if (this.startPromise === promise) {
        this.startPromise = null;
      }
    });
    this.startPromise = promise;
    return promise;
  }

  private async doStart(generation: number): Promise<void> {
    const cancelled = () => generation !== this.generation;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      this.setStatus('idle');
      this.callbacks.onError?.(
        'El navegador no permite acceder al micrófono en este contexto. Usá HTTPS o localhost (con adb reverse por USB en Android).'
      );
      return;
    }

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    try {
      // Pedimos audio crudo desactivando cancelación de eco, supresión de ruido y AGC
      // para preservar el sustain y los armónicos reales de las cuerdas.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      if (cancelled()) {
        await releaseResources(stream, null);
        return;
      }

      ctx = new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      await ctx.audioWorklet.addModule(pitchWorkletUrl);
      if (cancelled()) {
        await releaseResources(stream, ctx);
        return;
      }

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
      this.smoother.setManualMode(this.targetHz !== null);
      if (this.targetHz !== null) {
        worklet.port.postMessage({
          type: 'set-target',
          targetHz: this.targetHz,
        });
      }

      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
      this.setStatus('running');
      void this.wakeLocker.enable();
      this.callbacks.onStateChange?.(true, ctx.sampleRate);
    } catch (err) {
      // Liberar lo adquirido hasta el error: los campos de la instancia todavía no lo conocen.
      await releaseResources(stream, ctx);
      if (cancelled()) return;
      this.setStatus('idle');
      this.callbacks.onStateChange?.(false, null);

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

  /**
   * Detiene la captura. Si hay un arranque en curso, lo cancela: ese arranque libera lo que
   * haya adquirido en cuanto retome.
   */
  public stop(): Promise<void> {
    if (this.status === 'idle') return Promise.resolve();
    if (this.status === 'stopping' && this.stopPromise) {
      return this.stopPromise;
    }

    this.generation++;
    this.setStatus('stopping');
    const promise = this.doStop().finally(() => {
      if (this.stopPromise === promise) {
        this.stopPromise = null;
      }
    });
    this.stopPromise = promise;
    return promise;
  }

  private async doStop(): Promise<void> {
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
    const stream = this.mediaStream;
    const ctx = this.audioContext;
    this.mediaStream = null;
    this.audioContext = null;
    await releaseResources(stream, ctx);

    this.smoother.reset();
    this.setStatus('idle');
    this.callbacks.onStateChange?.(false, null);
  }

  private handleVisibilityChange(): void {
    if (this.status !== 'running' || !this.audioContext) return;
    if (
      document.visibilityState === 'visible' &&
      this.audioContext.state === 'suspended'
    ) {
      void this.audioContext.resume();
    }
  }
}
