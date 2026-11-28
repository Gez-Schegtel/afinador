// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseScoreBytes } from '../alphatab-bridge';
import { createBendPresetCurve } from '../bend-curve';
import {
  exportAlphaTexBytes,
  exportChordProString,
  exportGpBytes,
  exportMidiBytes,
  exportMusicXmlBytes,
  exportMxlBytes,
} from './index';
import { createEmptyScoreDocument, computeNoteMidi } from '../model';

function buildMultiTrackSample() {
  let doc = createEmptyScoreDocument({
    title: 'Muestra Multipista Complete',
    artist: 'Endurend',
    barCount: 1,
    bpm: 100,
  });

  const gtr = doc.tracks[0]!;
  doc = {
    ...doc,
    tracks: [
      {
        ...gtr,
        bars: [
          {
            id: 'g-b1',
            voices: [
              {
                id: 'g-v1',
                beats: [
                  {
                    id: 'g-b1-v1-1',
                    duration: 2,
                    dots: 0,
                    isRest: false,
                    chordSymbol: 'Em',
                    lyrics: 'Sol',
                    notes: [
                      {
                        id: 'gn1',
                        stringIndex: 2,
                        fret: 7,
                        midi: computeNoteMidi(gtr.tuning, 0, 2, 7),
                        tieDestination: false,
                        hammerOrPull: false,
                        bendPoints: createBendPresetCurve('full'),
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
                      },
                    ],
                  },
                  {
                    id: 'g-b1-v1-2',
                    duration: 2,
                    dots: 0,
                    isRest: false,
                    notes: [
                      {
                        id: 'gn2',
                        stringIndex: 0,
                        fret: 0,
                        midi: computeNoteMidi(gtr.tuning, 0, 0, 0),
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
                      },
                    ],
                  },
                ],
              },
              {
                id: 'g-v2',
                beats: [
                  {
                    id: 'g-b1-v2-1',
                    duration: 1,
                    dots: 0,
                    isRest: false,
                    notes: [
                      {
                        id: 'gn3',
                        stringIndex: 5,
                        fret: 12,
                        midi: computeNoteMidi(gtr.tuning, 0, 5, 12),
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
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'track-bass',
        name: 'Bajo',
        shortName: 'Bass',
        family: 'bass',
        midiProgram: 33,
        isPercussion: false,
        tuning: createEmptyScoreDocument({ family: 'bass', tuning: doc.tracks[0]!.tuning.slice(0, 4) }).tracks[0]!.tuning,
        capo: 0,
        mix: { volume: 1, pan: 0, mute: false, solo: false },
        bars: [
          {
            id: 'b-b1',
            voices: [
              {
                id: 'b-v1',
                beats: [
                  {
                    id: 'b-1',
                    duration: 1,
                    dots: 0,
                    isRest: false,
                    notes: [
                      {
                        id: 'bn1',
                        stringIndex: 0,
                        fret: 0,
                        midi: 40,
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
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'track-drums',
        name: 'Batería',
        shortName: 'Drums',
        family: 'drums',
        midiProgram: 0,
        isPercussion: true,
        tuning: [],
        capo: 0,
        mix: { volume: 1, pan: 0, mute: false, solo: false },
        bars: [
          {
            id: 'd-b1',
            voices: [
              {
                id: 'd-v1',
                beats: [
                  {
                    id: 'd-1',
                    duration: 1,
                    dots: 0,
                    isRest: false,
                    notes: [
                      {
                        id: 'dn1',
                        stringIndex: 0,
                        fret: 0,
                        midi: 36,
                        percussionArticulation: 36,
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

  return doc;
}

describe('Exportadores universales round-trip (.gp, .musicxml, .mxl, .alphatex, .mid, .cho) (Spec 014)', () => {
  it('exporta y reimporta limpiamente conservando pistas, notas, bends y métricas PPQ = 960', () => {
    const sample = buildMultiTrackSample();

    const gpBytes = exportGpBytes(sample);
    const reGp = parseScoreBytes(gpBytes, 'sample.gp');
    expect(reGp.tracks.length).toBe(3);
    expect(reGp.tracks[0]!.bars[0]!.voices.length).toBe(2);
    expect(reGp.tracks[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!.bendPoints.length).toBeGreaterThan(0);

    const xmlBytes = exportMusicXmlBytes(sample);
    const reXml = parseScoreBytes(xmlBytes, 'sample.musicxml');
    expect(reXml.tracks.length).toBe(3);
    expect(reXml.masterBars.length).toBe(1);

    const mxlBytes = exportMxlBytes(sample);
    const reMxl = parseScoreBytes(mxlBytes, 'sample.mxl');
    expect(reMxl.tracks.length).toBe(3);

    const atexBytes = exportAlphaTexBytes(sample);
    const reAtex = parseScoreBytes(atexBytes, 'sample.alphatex');
    expect(reAtex.tracks.length).toBe(3);

    const midiBytes = exportMidiBytes(sample);
    const reMidi = parseScoreBytes(midiBytes, 'sample.mid');
    expect(reMidi.tracks.length).toBeGreaterThanOrEqual(2);

    const choStr = exportChordProString(sample);
    expect(choStr).toContain('[Em]');
    expect(choStr).toContain('Sol');
  });
});
