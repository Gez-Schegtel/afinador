// SPDX-License-Identifier: GPL-3.0-or-later
import MetronomeTimerWorker from './metronome-timer.worker.ts?worker';
import {
  MetronomeTimeline,
  type ClickKind,
  type MetronomeSettings,
  type ScheduledClick,
} from '../core/rhythm/meters';
import { ScreenWakeLocker } from './wake-lock';

/** Ventana de programación por adelantado (patrón «look-ahead» sobre el reloj de audio). */
const LOOKAHEAD_S = 0.12;
const TICK_FALLBACK_MS = 25;
const START_DELAY_S = 0.08;

const CLICK_SOUNDS: Readonly<Record<ClickKind, { freq: number; gain: number }>> = {
  accent: { freq: 1600, gain: 0.9 },
  beat: { freq: 1050, gain: 0.6 },
  subdivision: { freq: 760, gain: 0.28 },
};

export interface MetronomeEngineCallbacks {
  onRunningChange?: (running: boolean) => void;
  onWakeLockChange?: (locked: boolean) => void;
  onError?: (message: string) => void;
}

/**
 * Metrónomo con programación sobre `AudioContext.currentTime` (Spec 004).
 * Los instantes los calcula `MetronomeTimeline` (sin deriva); este motor solo sintetiza los clics
 * y lleva la cola de eventos para sincronizar la interfaz.
 */
export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private worker: Worker | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private timeline: MetronomeTimeline | null = null;
  private settings: MetronomeSettings;
  private readonly visualQueue: ScheduledClick[] = [];
  private lastVisual: ScheduledClick | null = null;
  private running = false;
  private readonly wakeLocker: ScreenWakeLocker;
  private readonly callbacks: MetronomeEngineCallbacks;

  constructor(settings: MetronomeSettings, callbacks: MetronomeEngineCallbacks = {}) {
    this.settings = settings;
    this.callbacks = callbacks;
    this.wakeLocker = new ScreenWakeLocker(callbacks.onWakeLockChange);
    this.tick = this.tick.bind(this);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;

      this.timeline = new MetronomeTimeline(
        this.settings,
        ctx.currentTime + START_DELAY_S
      );
      this.visualQueue.length = 0;
      this.lastVisual = null;
      this.running = true;
      this.startTimer();
      this.tick();
      void this.wakeLocker.enable();
      this.callbacks.onRunningChange?.(true);
    } catch (err) {
      this.running = false;
      this.callbacks.onError?.(
        `No se pudo iniciar el metrónomo: ${(err as Error | undefined)?.message ?? 'error desconocido'}`
      );
    }
  }

  public async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.stopTimer();
    this.timeline = null;
    this.visualQueue.length = 0;
    this.lastVisual = null;

    // Cerrar el contexto silencia también los clics ya programados en la ventana de look-ahead.
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) {
      await ctx.close().catch(() => undefined);
    }
    await this.wakeLocker.disable();
    this.callbacks.onRunningChange?.(false);
  }

  public updateSettings(settings: MetronomeSettings): void {
    this.settings = settings;
    if (this.running && this.timeline && this.ctx) {
      this.timeline.update(settings, this.ctx.currentTime + 0.05);
    }
  }

  /** Último clic que ya sonó (compensando la latencia de salida), para la interfaz. */
  public getVisualClick(): ScheduledClick | null {
    const ctx = this.ctx;
    if (!ctx || !this.running) return null;
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    const heardTime = ctx.currentTime - latency;
    while (this.visualQueue.length > 0 && this.visualQueue[0]!.time <= heardTime) {
      this.lastVisual = this.visualQueue.shift()!;
    }
    return this.lastVisual;
  }

  public dispose(): void {
    void this.stop();
    this.worker?.terminate();
    this.worker = null;
  }

  private startTimer(): void {
    try {
      if (!this.worker) {
        this.worker = new MetronomeTimerWorker();
        this.worker.onmessage = this.tick;
      }
      this.worker.postMessage('start');
    } catch {
      // Sin Web Workers: temporizador en el hilo principal (menos estable en segundo plano).
      this.fallbackTimer = setInterval(this.tick, TICK_FALLBACK_MS);
    }
  }

  private stopTimer(): void {
    this.worker?.postMessage('stop');
    if (this.fallbackTimer !== null) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!this.running || !this.timeline || !ctx) return;
    const clicks = this.timeline.collectUntil(ctx.currentTime + LOOKAHEAD_S);
    for (const click of clicks) {
      this.scheduleClick(ctx, click);
      this.visualQueue.push(click);
    }
  }

  private scheduleClick(ctx: AudioContext, click: ScheduledClick): void {
    const master = this.master;
    if (!master) return;
    const { freq, gain } = CLICK_SOUNDS[click.kind];
    const t = Math.max(click.time, ctx.currentTime);
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start(t);
    osc.stop(t + 0.06);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }
}
