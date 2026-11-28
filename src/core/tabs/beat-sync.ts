// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Sincronizador determinístico de compases con audio local (Beat-Mapper, Spec 014).
 * Cero detección automática/IA: todo marcador es colocado o micro-ajustado por el usuario
 * con interpolación lineal exacta entre marcadores y garantía estricta de monotonicidad.
 */

import type { MasterBar } from './model';
import { barCapacityTicks, ticksToNumberFloor } from './rhythm';

export interface BeatSyncAnchor {
  readonly barIndex: number;
  readonly timeSec: number;
}

export interface BeatSyncMap {
  readonly version: 1;
  readonly docId: string;
  readonly audioFileName?: string;
  readonly audioSha256?: string;
  readonly anchors: readonly BeatSyncAnchor[];
}

export function normalizeSyncAnchors(
  anchors: readonly BeatSyncAnchor[]
): BeatSyncAnchor[] {
  const byBar = new Map<number, number>();
  for (const a of anchors) {
    if (!Number.isInteger(a.barIndex) || a.barIndex < 0) continue;
    if (!Number.isFinite(a.timeSec) || a.timeSec < 0) continue;
    byBar.set(a.barIndex, Math.round(a.timeSec * 10000) / 10000);
  }
  const sorted = [...byBar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([barIndex, timeSec]) => ({ barIndex, timeSec }));

  // Garantizar monotonicidad estricta entre anclas consecutivas
  const monotonic: BeatSyncAnchor[] = [];
  for (const item of sorted) {
    const prev = monotonic[monotonic.length - 1];
    if (prev && item.timeSec <= prev.timeSec) {
      monotonic.push({
        barIndex: item.barIndex,
        timeSec: Math.round((prev.timeSec + 0.01) * 10000) / 10000,
      });
    } else {
      monotonic.push(item);
    }
  }
  return monotonic;
}

export function createEmptyBeatSyncMap(
  docId: string,
  audioMeta?: { fileName?: string; sha256?: string }
): BeatSyncMap {
  return {
    version: 1,
    docId,
    ...(audioMeta?.fileName ? { audioFileName: audioMeta.fileName } : {}),
    ...(audioMeta?.sha256 ? { audioSha256: audioMeta.sha256 } : {}),
    anchors: [{ barIndex: 0, timeSec: 0 }],
  };
}

export function addOrMoveSyncAnchor(
  map: BeatSyncMap,
  barIndex: number,
  timeSec: number
): BeatSyncMap {
  const filtered = map.anchors.filter((a) => a.barIndex !== barIndex);
  return {
    ...map,
    anchors: normalizeSyncAnchors([...filtered, { barIndex, timeSec }]),
  };
}

export function nudgeSyncAnchor(
  map: BeatSyncMap,
  barIndex: number,
  deltaMs: number
): BeatSyncMap {
  const existing = map.anchors.find((a) => a.barIndex === barIndex);
  if (!existing) return map;
  const nextSec = Math.max(0, existing.timeSec + deltaMs / 1000);
  return addOrMoveSyncAnchor(map, barIndex, nextSec);
}

/**
 * Rellena compases intermedios mediante interpolación lineal exacta entre marcadores
 * (útil cuando el usuario marca solo cada 4 u 8 compases).
 */
export function interpolateBeatSyncBars(
  anchors: readonly BeatSyncAnchor[],
  totalBars: number,
  fallbackBpm = 100
): BeatSyncAnchor[] {
  if (totalBars <= 0) return [];
  const norm = normalizeSyncAnchors(anchors);
  if (norm.length === 0) {
    const barDur = (4 * 60) / fallbackBpm;
    return Array.from({ length: totalBars }, (_, barIndex) => ({
      barIndex,
      timeSec: Math.round(barIndex * barDur * 10000) / 10000,
    }));
  }

  const out: BeatSyncAnchor[] = [];
  for (let i = 0; i < totalBars; i++) {
    const exact = norm.find((a) => a.barIndex === i);
    if (exact) {
      out.push(exact);
      continue;
    }

    const before = [...norm].reverse().find((a) => a.barIndex < i);
    const after = norm.find((a) => a.barIndex > i);

    if (before && after) {
      const t = (i - before.barIndex) / (after.barIndex - before.barIndex);
      const sec = before.timeSec + t * (after.timeSec - before.timeSec);
      out.push({ barIndex: i, timeSec: Math.round(sec * 10000) / 10000 });
    } else if (before) {
      const avgDur =
        norm.length >= 2
          ? (norm[norm.length - 1]!.timeSec - norm[0]!.timeSec) /
            Math.max(1, norm[norm.length - 1]!.barIndex - norm[0]!.barIndex)
          : (4 * 60) / fallbackBpm;
      const sec = before.timeSec + (i - before.barIndex) * avgDur;
      out.push({ barIndex: i, timeSec: Math.round(sec * 10000) / 10000 });
    } else if (after) {
      const avgDur =
        norm.length >= 2
          ? (norm[1]!.timeSec - norm[0]!.timeSec) /
            Math.max(1, norm[1]!.barIndex - norm[0]!.barIndex)
          : (4 * 60) / fallbackBpm;
      const sec = Math.max(0, after.timeSec - (after.barIndex - i) * avgDur);
      out.push({ barIndex: i, timeSec: Math.round(sec * 10000) / 10000 });
    }
  }
  return out;
}

export function barTickToAudioTime(
  map: BeatSyncMap,
  masterBars: readonly MasterBar[],
  tick: number
): number {
  const totalBars = masterBars.length;
  if (totalBars === 0) return 0;
  const fallbackBpm = masterBars[0]?.tempoChanges[0]?.bpm ?? 100;
  const bars = interpolateBeatSyncBars(map.anchors, totalBars, fallbackBpm);

  let cursor = 0;
  for (let i = 0; i < totalBars; i++) {
    const cap = ticksToNumberFloor(
      barCapacityTicks(
        masterBars[i]!.timeSignature.numerator,
        masterBars[i]!.timeSignature.denominator
      )
    );
    const barEndTick = cursor + cap;
    const t0 = bars[i]!.timeSec;
    const t1 =
      i + 1 < bars.length
        ? bars[i + 1]!.timeSec
        : t0 + (bars.length >= 2 ? bars[i]!.timeSec - bars[i - 1]!.timeSec : (4 * 60) / fallbackBpm);
    if (tick <= barEndTick || i === totalBars - 1) {
      const frac = cap > 0 ? Math.max(0, Math.min(1.5, (tick - cursor) / cap)) : 0;
      return t0 + frac * Math.max(0.01, t1 - t0);
    }
    cursor = barEndTick;
  }
  return 0;
}

export function audioTimeToBarTick(
  map: BeatSyncMap,
  masterBars: readonly MasterBar[],
  timeSec: number
): number {
  const totalBars = masterBars.length;
  if (totalBars === 0 || timeSec <= 0) return 0;
  const fallbackBpm = masterBars[0]?.tempoChanges[0]?.bpm ?? 100;
  const bars = interpolateBeatSyncBars(map.anchors, totalBars, fallbackBpm);

  let tickCursor = 0;
  for (let i = 0; i < totalBars; i++) {
    const cap = ticksToNumberFloor(
      barCapacityTicks(
        masterBars[i]!.timeSignature.numerator,
        masterBars[i]!.timeSignature.denominator
      )
    );
    const t0 = bars[i]!.timeSec;
    const t1 =
      i + 1 < bars.length
        ? bars[i + 1]!.timeSec
        : t0 + (bars.length >= 2 ? bars[i]!.timeSec - bars[i - 1]!.timeSec : (4 * 60) / fallbackBpm);
    if (timeSec < t1 || i === totalBars - 1) {
      const span = Math.max(0.001, t1 - t0);
      const frac = Math.max(0, Math.min(1, (timeSec - t0) / span));
      return Math.round(tickCursor + frac * cap);
    }
    tickCursor += cap;
  }
  return tickCursor;
}

export function serializeSyncJson(map: BeatSyncMap): string {
  return JSON.stringify(map, null, 2);
}

export function parseSyncJson(raw: string): BeatSyncMap {
  const parsed = JSON.parse(raw) as Partial<BeatSyncMap>;
  if (parsed.version !== 1 || !parsed.docId || !Array.isArray(parsed.anchors)) {
    throw new Error('Archivo .sync.json inválido');
  }
  return {
    version: 1,
    docId: parsed.docId,
    ...(parsed.audioFileName ? { audioFileName: parsed.audioFileName } : {}),
    ...(parsed.audioSha256 ? { audioSha256: parsed.audioSha256 } : {}),
    anchors: normalizeSyncAnchors(parsed.anchors),
  };
}
