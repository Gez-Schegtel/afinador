// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createEmptyScoreDocument } from '../tabs/model';
import {
  extractChordProFromDocument,
  formatChordProText,
  parseChordProText,
} from './chordpro';

describe('Parser y extractor ChordPro (Spec 012)', () => {
  it('interpreta directivas, estribillos, comentarios y múltiples acordes alineados por columna', () => {
    const src = [
      '{title: Sol del Desierto}',
      '{artist: Endurend}',
      '{key: Dm}',
      '{capo: 2}',
      '{comment: Intro pesada}',
      '{soc}',
      '[Dm]Caminando bajo el [C]sol de [Am7]piedra',
      '{eoc}',
    ].join('\n');

    const parsed = parseChordProText(src);
    expect(parsed.title).toBe('Sol del Desierto');
    expect(parsed.artist).toBe('Endurend');
    expect(parsed.key).toBe('Dm');
    expect(parsed.capo).toBe(2);
    expect(parsed.uniqueChords).toEqual(['Dm', 'C', 'Am7']);

    const lyricLine = parsed.lines.find((l) => l.chords.length === 3);
    expect(lyricLine).toBeDefined();
    expect(lyricLine?.sectionType).toBe('chorus');
    expect(lyricLine?.lyrics).toBe('Caminando bajo el sol de piedra');
    expect(lyricLine?.chords).toEqual([
      { column: 0, symbol: 'Dm' },
      { column: 18, symbol: 'C' },
      { column: 25, symbol: 'Am7' },
    ]);

    const serialized = formatChordProText(parsed);
    const reparsed = parseChordProText(serialized);
    expect(reparsed.uniqueChords).toEqual(['Dm', 'C', 'Am7']);
  });

  it('extrae acordes y letra directamente desde ScoreDocument', () => {
    const doc = createEmptyScoreDocument({ title: 'Demo Chords', barCount: 2, bpm: 95 });
    const withChords = {
      ...doc,
      tracks: [
        {
          ...doc.tracks[0]!,
          bars: [
            {
              ...doc.tracks[0]!.bars[0]!,
              voices: [
                {
                  id: 'v1',
                  beats: [
                    {
                      ...doc.tracks[0]!.bars[0]!.voices[0]!.beats[0]!,
                      chordSymbol: 'Em',
                      lyrics: 'Primera',
                    },
                  ],
                },
              ],
            },
            {
              ...doc.tracks[0]!.bars[1]!,
              voices: [
                {
                  id: 'v1b',
                  beats: [
                    {
                      ...doc.tracks[0]!.bars[1]!.voices[0]!.beats[0]!,
                      chordSymbol: 'G7',
                      lyrics: 'linea',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const extracted = extractChordProFromDocument(withChords);
    expect(extracted.title).toBe('Demo Chords');
    expect(extracted.uniqueChords).toEqual(['Em', 'G7']);
    expect(extracted.lines[0]?.lyrics).toContain('Primera');
  });
});
