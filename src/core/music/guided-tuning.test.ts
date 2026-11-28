// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { midiToFrequency, resolveChromaticNote } from './notes';
import { parseSpelledNote } from './spelling';
import {
  applyGuidedTuneReading,
  createGuidedTuningSession,
  effectiveGuidedStringMidi,
  guidedStringLabel,
} from './guided-tuning';

describe('Puente de Afinador Guiado por Pista (Spec 012)', () => {
  it('calcula notas objetivo con capo y marca cuerdas afinadas solo al estabilizar la cuerda activa', () => {
    const tuning = ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(parseSpelledNote);
    let session = createGuidedTuningSession({
      docId: 'track-custom-doc',
      songTitle: 'Riff Drop D',
      trackName: 'Guitarra Rítmica',
      tuning,
      capo: 2,
    });

    // D2 (38) + Capo 2 = E2 (40)
    expect(effectiveGuidedStringMidi(session, 0)).toBe(40);
    expect(guidedStringLabel(session, 0)).toContain('6ª');

    const exactMatch = resolveChromaticNote(
      midiToFrequency(40, 440),
      440,
      { previousMidi: null, previousDirection: null },
      40
    );
    expect(exactMatch.direction).toBe('in-tune');

    // Sin hold no confirma todavía; con hold marca la cuerda 0 como completada
    session = applyGuidedTuneReading(session, exactMatch, false);
    expect(session.completedStrings[0]).toBe(false);

    session = applyGuidedTuneReading(session, exactMatch, true);
    expect(session.completedStrings[0]).toBe(true);
    expect(session.completedStrings.slice(1).every((v) => !v)).toBe(true);
  });
});
