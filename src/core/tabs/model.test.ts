// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseSpelledNote } from '../music/spelling';
import {
  cloneScoreDocument,
  computeNoteMidi,
  createEmptyScoreDocument,
  validateScoreDocument,
} from './model';

describe('Modelo canónico ScoreDocument (Spec 008)', () => {
  it('calcula MIDI real respetando orden grave→aguda y cejilla (capo)', () => {
    const dropD = ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(parseSpelledNote);
    expect(computeNoteMidi(dropD, 0, 0, 0)).toBe(38); // D2
    expect(computeNoteMidi(dropD, 0, 5, 12)).toBe(76); // E5
    expect(computeNoteMidi(dropD, 2, 0, 0)).toBe(40); // E2 con capo 2
  });

  it('crea copias profundas independientes y detecta compases completos e incompletos', () => {
    const doc = createEmptyScoreDocument({
      title: 'Prueba',
      timeSignature: { numerator: 4, denominator: 4 },
    });
    // Por defecto tiene 1 silencio de negra en 4/4 => incompleto
    const reportIncomplete = validateScoreDocument(doc);
    expect(reportIncomplete.valid).toBe(false);
    expect(reportIncomplete.issues[0]?.result.status).toBe('incomplete');

    const copy = cloneScoreDocument(doc);
    const bar0 = copy.tracks[0]!.bars[0]!;
    const completeDoc = {
      ...copy,
      tracks: [
        {
          ...copy.tracks[0]!,
          bars: [
            {
              ...bar0,
              voices: [
                {
                  ...bar0.voices[0]!,
                  beats: [
                    {
                      id: 'b1',
                      duration: 1 as const,
                      dots: 0 as const,
                      isRest: false,
                      notes: [
                        {
                          id: 'n1',
                          stringIndex: 0,
                          fret: 0,
                          midi: 40,
                          tieDestination: false,
                          hammerOrPull: false,
                          bendPoints: [],
                          vibrato: 'none' as const,
                          palmMute: false,
                          letRing: false,
                          deadNote: false,
                          ghostNote: false,
                          leftHandTapped: false,
                          slap: false,
                          pop: false,
                          staccato: false,
                          accent: 'none' as const,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(validateScoreDocument(completeDoc).valid).toBe(true);
    // El original permanece intacto
    expect(doc.tracks[0]!.bars[0]!.voices[0]!.beats[0]!.duration).toBe(4);
  });
});
