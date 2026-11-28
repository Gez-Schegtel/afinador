// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Motor y preferencias de audio para el Modo Práctica (Spec 009).
 * Administra Wake Lock durante la reproducción, preferencias locales y utilidades de tiempo/compás.
 */

import type { MasterBar, ScoreDocument } from '../core/tabs/model';
import { scoreBeatTicks } from '../core/tabs/model';
import { barCapacityTicks, ticksToFloat, ticksToNumberFloor } from '../core/tabs/rhythm';
import type { ScoreTheme } from './alphatab-runtime';

export const STORAGE_PRACTICE_PREFS_KEY = 'endurend_practice_prefs';

export type PracticeStaveMode = 'Tab' | 'ScoreTab' | 'Score';
export type PracticeLayoutMode = 'page' | 'horizontal';

export interface PracticePreferences {
  readonly zoomPct: number;
  readonly theme: ScoreTheme;
  readonly staveProfile: PracticeStaveMode;
  readonly speedPct: number;
  readonly metronomeEnabled: boolean;
  readonly countInBars: 0 | 1 | 2;
  readonly leftHanded: boolean;
  readonly autoScroll: boolean;
  readonly layoutMode: PracticeLayoutMode;
  readonly manualTrackChanges: boolean;
}

export const DEFAULT_PRACTICE_PREFS: PracticePreferences = {
  zoomPct: 100,
  theme: 'endurend-dark',
  staveProfile: 'ScoreTab',
  speedPct: 100,
  metronomeEnabled: false,
  countInBars: 0,
  leftHanded: false,
  autoScroll: true,
  layoutMode: 'page',
  manualTrackChanges: true,
};

export function loadPracticePreferences(): PracticePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_PRACTICE_PREFS_KEY);
    if (!raw) return DEFAULT_PRACTICE_PREFS;
    const parsed = JSON.parse(raw) as Partial<PracticePreferences>;
    return {
      ...DEFAULT_PRACTICE_PREFS,
      ...parsed,
      zoomPct:
        typeof parsed.zoomPct === 'number' && Number.isFinite(parsed.zoomPct)
          ? Math.max(50, Math.min(200, Math.round(parsed.zoomPct)))
          : DEFAULT_PRACTICE_PREFS.zoomPct,
      speedPct:
        typeof parsed.speedPct === 'number' && Number.isFinite(parsed.speedPct)
          ? Math.max(15, Math.min(150, Math.round(parsed.speedPct)))
          : DEFAULT_PRACTICE_PREFS.speedPct,
      countInBars:
        parsed.countInBars === 1 || parsed.countInBars === 2 ? parsed.countInBars : 0,
    };
  } catch {
    return DEFAULT_PRACTICE_PREFS;
  }
}

export function savePracticePreferences(prefs: PracticePreferences): void {
  try {
    localStorage.setItem(STORAGE_PRACTICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignorar en entornos sin localStorage disponible
  }
}

export function formatPlaybackTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function computeBarStartTicks(masterBars: readonly MasterBar[]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const mb of masterBars) {
    starts.push(cursor);
    cursor += ticksToNumberFloor(
      barCapacityTicks(mb.timeSignature.numerator, mb.timeSignature.denominator)
    );
  }
  return starts;
}

export function findBarIndexAtTick(barStarts: readonly number[], tick: number): number {
  if (barStarts.length === 0) return 0;
  let lo = 0;
  let hi = barStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((barStarts[mid] ?? 0) <= tick) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(0, hi);
}

export interface ActiveBeatSnapshot {
  readonly key: string;
  readonly fretNotes: readonly { stringIndex: number; fret: number }[];
  readonly midis: readonly number[];
}

export function findActiveBeatAtTick(
  doc: ScoreDocument,
  trackIndex: number,
  barStarts: readonly number[],
  tick: number
): ActiveBeatSnapshot {
  const track = doc.tracks[trackIndex];
  if (!track) return { key: 'none', fretNotes: [], midis: [] };
  const barIdx = findBarIndexAtTick(barStarts, tick);
  const bar = track.bars[barIdx];
  const voice = bar?.voices[0];
  if (!voice) return { key: `${trackIndex}:${barIdx}:empty`, fretNotes: [], midis: [] };

  let cursor = barStarts[barIdx] ?? 0;
  for (let b = 0; b < voice.beats.length; b++) {
    const beat = voice.beats[b]!;
    const len = ticksToFloat(scoreBeatTicks(beat));
    if (tick < cursor + Math.max(1, len) || b === voice.beats.length - 1) {
      if (beat.isRest) {
        return { key: `${trackIndex}:${barIdx}:${b}:rest`, fretNotes: [], midis: [] };
      }
      return {
        key: `${trackIndex}:${barIdx}:${b}`,
        fretNotes: beat.notes.map((n) => ({ stringIndex: n.stringIndex, fret: n.fret })),
        midis: beat.notes.map((n) => n.midi),
      };
    }
    cursor += len;
  }
  return { key: `${trackIndex}:${barIdx}:end`, fretNotes: [], midis: [] };
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Controlador seguro de Screen Wake Lock para mantener encendida la pantalla al ensayar. */
export class ScreenWakeController {
  private sentinel: WakeLockSentinelLike | null = null;

  async acquire(): Promise<void> {
    if (this.sentinel) return;
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock) {
        this.sentinel = await nav.wakeLock.request('screen');
      }
    } catch {
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    if (!this.sentinel) return;
    try {
      await this.sentinel.release();
    } catch {
      // Ignorar si ya fue liberado por el sistema
    } finally {
      this.sentinel = null;
    }
  }
}
