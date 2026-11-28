// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findTuning } from '../music/tunings';
import { computeNoteMidi, createEmptyScoreDocument, type ScoreNote } from './model';
import { shiftNoteToAdjacentString } from './string-shift';

function makeNoteAt(
  tuning: readonly import('../music/spelling').SpelledNote[],
  stringIndex: number,
  fret: number
): ScoreNote {
  return {
    id: 'n1',
    stringIndex,
    fret,
    midi: computeNoteMidi(tuning, 0, stringIndex, fret),
    tieDestination: false,
    hammerOrPull: false,
    bendPoints: [],
    vibrato: 'none',
    palmMute: false,
    letRing: false,
    deadNote: false,
    ghostNote: false,
    leftHandTapped: false,
    slap: false,
    pop: false,
    staccato: false,
    accent: 'none',
  };
}

describe('Movimiento inteligente entre cuerdas Alt+↑/↓ (Spec 013)', () => {
  it('conserva la altura MIDI exacta en guitarra estándar, Drop D, 7/8 cuerdas y bajo', () => {
    const sampleIds = [
      'guitar6-standard',
      'guitar6-drop-d',
      'guitar7-standard',
      'guitar8-standard',
      'bass4-standard',
    ];
    for (const id of sampleIds) {
      const tDef = findTuning(id)!;
      const doc = createEmptyScoreDocument({ tuning: tDef.notes });
      const track = doc.tracks[0]!;

      // Traste 7 en cuerda 0 -> mover hacia cuerda 1 conserva el MIDI exacto
      const note = makeNoteAt(track.tuning, 0, 7);
      const shifted = shiftNoteToAdjacentString(note, track, 1, 24);
      expect(shifted.ok).toBe(true);
      if (!shifted.ok) continue;
      expect(shifted.note.midi).toBe(note.midi);
      expect(shifted.note.stringIndex).toBe(1);
    }
  });

  it('no muta la nota si al moverla queda fuera del rango de trastes [0, maxFret]', () => {
    const doc = createEmptyScoreDocument();
    const track = doc.tracks[0]!;
    // E2 (cuerda 0 traste 1) no puede pasarse a cuerda A2 (requiere traste -4)
    const lowF = makeNoteAt(track.tuning, 0, 1);
    const out = shiftNoteToAdjacentString(lowF, track, 1, 24);
    expect(out.ok).toBe(false);
  });
});
