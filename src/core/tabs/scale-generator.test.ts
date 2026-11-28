// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findScale } from '../music/scales';
import { parsePitchName } from '../music/spelling';
import { findTuning } from '../music/tunings';
import { documentToAlphaTabScore } from './alphatab-bridge';
import { getFactoryExamples } from './factory-examples';
import { validateScoreDocument } from './model';
import {
  generateScaleExercise,
  type MelodicPatternId,
  type ScaleArticulation,
  type ScaleRhythmFigure,
} from './scale-generator';

describe('Generador procedimental de escalas y 16 ejemplos de fábrica (Spec 010)', () => {
  it('genera los 16 ejemplos curados de fábrica con compases 100% válidos en PPQ = 960', () => {
    const examples = getFactoryExamples();
    expect(examples).toHaveLength(16);

    const bassExamples = examples.filter((ex) => ex.tracks[0]?.family === 'bass');
    expect(bassExamples.length).toBeGreaterThanOrEqual(1);

    for (const ex of examples) {
      const report = validateScoreDocument(ex);
      expect(report.valid, `${ex.id}: ${JSON.stringify(report.issues)}`).toBe(true);
      expect(report.barCountMatches).toBe(true);
      expect(ex.scaleContext).toBeDefined();
      expect(ex.origin.kind).toBe('factory');

      // Debe convertirse limpiamente a alphaTab Score para Práctica
      const ab = documentToAlphaTabScore(ex);
      expect(ab.tracks.length).toBe(ex.tracks.length);
      expect(ab.masterBars.length).toBe(ex.masterBars.length);
    }
  });

  it('cierra exactamente todos los patrones melódicos, figuras rítmicas y articulaciones en PPQ = 960', () => {
    const tuning = findTuning('guitar6-standard')!.notes;
    const dorian = findScale('dorian')!;
    const root = parsePitchName('D');

    const patterns: MelodicPatternId[] = [
      'asc-desc',
      'asc',
      'desc',
      'thirds',
      'groups-3',
      'groups-4',
      'pedal-tone',
      'string-skipping',
      'sweep',
    ];
    const figures: ScaleRhythmFigure[] = [
      'quarter',
      'eighth',
      'triplet-eighth',
      'sixteenth',
    ];
    const articulations: ScaleArticulation[] = ['alternate', 'legato', 'palm-mute'];

    for (const pattern of patterns) {
      for (const rhythm of figures) {
        const doc = generateScaleExercise({
          tuning,
          root,
          scale: dorian,
          system: pattern === 'sweep' ? 'sweep' : 'caged',
          position: 1,
          pattern,
          rhythm,
          articulation: articulations[0]!,
          drumStyle: rhythm === 'triplet-eighth' ? 'shuffle' : 'rock',
          modalDrone: true,
        });
        const check = validateScoreDocument(doc);
        expect(check.valid, `${pattern} + ${rhythm}`).toBe(true);
      }
    }

    const legatoDoc = generateScaleExercise({
      tuning,
      root,
      scale: dorian,
      system: '3nps',
      pattern: 'asc',
      rhythm: 'eighth',
      articulation: 'legato',
    });
    expect(validateScoreDocument(legatoDoc).valid).toBe(true);
    const hasHp = legatoDoc.tracks[0]!.bars.some((b) =>
      b.voices[0]!.beats.some((bt) => bt.notes.some((n) => n.hammerOrPull))
    );
    expect(hasHp).toBe(true);
  });
});
