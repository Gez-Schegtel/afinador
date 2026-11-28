// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createAddTrackCommand,
  createCompleteBarRestsCommand,
  createSetNoteFretCommand,
  createUpdateMetadataCommand,
} from './commands';
import { createEmptyScoreDocument } from './model';
import { diffScoreDocuments } from './score-diff';

describe('Comparador Diff A/B de revisiones (Spec 014)', () => {
  it('detecta compases idénticos vs modificados y resume cambios globales con exactitud', () => {
    let base = createEmptyScoreDocument({ title: 'Versión A', barCount: 3, bpm: 100 });
    base = createSetNoteFretCommand(
      { trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringIndex: 0 },
      0
    ).execute(base);
    base = createCompleteBarRestsCommand(0, 0).execute(base);
    base = createCompleteBarRestsCommand(0, 1).execute(base);
    base = createCompleteBarRestsCommand(0, 2).execute(base);

    expect(diffScoreDocuments(base, base).identical).toBe(true);

    let revB = createUpdateMetadataCommand({ title: 'Versión B' }).execute(base);
    revB = createSetNoteFretCommand(
      { trackIndex: 0, barIndex: 1, voiceIndex: 0, beatIndex: 0, stringIndex: 1 },
      5
    ).execute(revB);
    revB = createAddTrackCommand({ name: 'Bajo Extra', family: 'bass' }).execute(revB);

    const diff = diffScoreDocuments(base, revB);
    expect(diff.identical).toBe(false);
    expect(diff.globalChanges.some((c) => c.includes('Título'))).toBe(true);
    expect(diff.globalChanges.some((c) => c.includes('Bajo Extra'))).toBe(true);
    expect(diff.modifiedBars.map((b) => b.barIndex)).toEqual([1]);
    expect(diff.identicalBarCount).toBe(2);
    expect(diff.totalComparedBars).toBe(3);
  });
});
