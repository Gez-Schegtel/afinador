// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Arbitraje central de canales de audio (Spec 008).
 *
 * El micrófono crudo del afinador (`tuner`) es estrictamente exclusivo: detiene cualquier otra
 * fuente de reproducción para evitar retroalimentación o contaminación acústica. Al iniciar
 * metrónomo, tablaturas o tonos de referencia se detiene el micrófono si estaba activo.
 */

import { setAudioBusy } from './audio-activity';

export type AudioChannel = 'tuner' | 'metronome' | 'tabs' | 'tone';

export interface AudioChannelHandle {
  readonly stop: () => void | Promise<void>;
}

const CONFLICTS: Readonly<Record<AudioChannel, readonly AudioChannel[]>> = {
  tuner: ['metronome', 'tabs', 'tone'],
  tabs: ['tuner', 'metronome', 'tone'],
  metronome: ['tuner', 'tabs'],
  tone: ['tuner', 'tabs'],
};

export interface AudioArbitratorOptions {
  readonly onBusyChange?: (channel: AudioChannel, busy: boolean) => void;
}

export class AudioArbitrator {
  private readonly handles = new Map<AudioChannel, AudioChannelHandle>();
  private readonly activeChannels = new Set<AudioChannel>();
  private readonly onBusyChange: (channel: AudioChannel, busy: boolean) => void;

  constructor(options: AudioArbitratorOptions = {}) {
    this.onBusyChange = options.onBusyChange ?? setAudioBusy;
  }

  public register(channel: AudioChannel, handle: AudioChannelHandle): () => void {
    this.handles.set(channel, handle);
    return () => {
      if (this.handles.get(channel) === handle) {
        this.handles.delete(channel);
      }
      this.setActive(channel, false);
    };
  }

  public setActive(channel: AudioChannel, active: boolean): void {
    if (active) {
      this.activeChannels.add(channel);
    } else {
      this.activeChannels.delete(channel);
    }
    this.onBusyChange(channel, active);
  }

  public isActive(channel: AudioChannel): boolean {
    return this.activeChannels.has(channel);
  }

  public getActiveChannels(): readonly AudioChannel[] {
    return [...this.activeChannels];
  }

  private collectConflictStops(channel: AudioChannel): {
    stopped: AudioChannel[];
    pending: Promise<void>[];
  } {
    const stopped: AudioChannel[] = [];
    const pending: Promise<void>[] = [];

    for (const conflict of CONFLICTS[channel]) {
      if (!this.activeChannels.has(conflict)) continue;
      stopped.push(conflict);
      this.setActive(conflict, false);
      const handle = this.handles.get(conflict);
      if (handle) {
        const res = handle.stop();
        if (res && typeof (res as Promise<void>).then === 'function') {
          pending.push(res);
        }
      }
    }
    return { stopped, pending };
  }

  /**
   * Detiene los canales conflictivos de forma síncrona (sin `await`) para preservar el
   * contexto de activación por gesto de usuario en navegadores móviles al abrir el micrófono.
   */
  public stopConflictsSync(channel: AudioChannel): AudioChannel[] {
    return this.collectConflictStops(channel).stopped;
  }

  /**
   * Detiene los canales conflictivos y espera a que completen las detenciones asíncronas.
   * Devuelve qué canales estaban activos y fueron detenidos.
   */
  public async acquire(channel: AudioChannel): Promise<AudioChannel[]> {
    const { stopped, pending } = this.collectConflictStops(channel);
    if (pending.length > 0) {
      await Promise.all(pending);
    }
    return stopped;
  }

  public release(channel: AudioChannel): void {
    this.setActive(channel, false);
  }
}

export const audioArbitrator = new AudioArbitrator();
