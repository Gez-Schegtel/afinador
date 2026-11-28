// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  addOrMoveSyncAnchor,
  audioTimeToBarTick,
  barTickToAudioTime,
  createEmptyBeatSyncMap,
  interpolateBeatSyncBars,
  normalizeSyncAnchors,
  nudgeSyncAnchor,
  parseSyncJson,
  serializeSyncJson,
} from './beat-sync';
import { createEmptyScoreDocument } from './model';

describe('Beat-Mapper manual e interpolación lineal (Spec 014)', () => {
  it('impone monotonicidad ante marcas invertidas y realiza interpolación exacta cada 4/8 compases', () => {
    const clean = normalizeSyncAnchors([
      { barIndex: 0, timeSec: 0 },
      { barIndex: 4, timeSec: 8 },
      { barIndex: 2, timeSec: 9.5 }, // invertido temporalmente respecto a bar 4
    ]);
    expect(clean[1]!.barIndex).toBe(2);
    expect(clean[2]!.barIndex).toBe(4);
    expect(clean[2]!.timeSec).toBeGreaterThan(clean[1]!.timeSec);

    const interp = interpolateBeatSyncBars(
      [
        { barIndex: 0, timeSec: 0 },
        { barIndex: 4, timeSec: 8 },
        { barIndex: 8, timeSec: 16 },
      ],
      9
    );
    expect(interp.length).toBe(9);
    expect(interp[2]!.timeSec).toBeCloseTo(4, 4);
    expect(interp[6]!.timeSec).toBeCloseTo(12, 4);
  });

  it('convierte bidireccionalmente tick ↔ tiempo con micro-ajuste ±10 ms y .sync.json', () => {
    const doc = createEmptyScoreDocument({ barCount: 8, bpm: 120 });
    let map = createEmptyBeatSyncMap(doc.id, { fileName: 'backing.mp3' });
    map = addOrMoveSyncAnchor(map, 4, 8.0);
    map = nudgeSyncAnchor(map, 4, 10); // +10 ms -> 8.01 s
    expect(map.anchors.find((a) => a.barIndex === 4)?.timeSec).toBeCloseTo(8.01, 4);

    const tBar2 = barTickToAudioTime(map, doc.masterBars, 2 * 3840);
    expect(tBar2).toBeCloseTo(4.005, 3);
    const backTick = audioTimeToBarTick(map, doc.masterBars, tBar2);
    expect(backTick).toBeCloseTo(2 * 3840, 0);

    const reparsed = parseSyncJson(serializeSyncJson(map));
    expect(reparsed).toEqual(map);
  });
});
