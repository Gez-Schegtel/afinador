// SPDX-License-Identifier: GPL-3.0-or-later
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  alphaTabScoreToDocument,
  documentToAlphaTabScore,
  parseScoreBytes,
} from './alphatab-bridge';
import { createEmptyScoreDocument, validateScoreDocument } from './model';

describe('Puente bidireccional alphaTab <-> ScoreDocument (Spec 008)', () => {
  it('mapea exactamente orden de cuerdas y alturas MIDI desde alphaTex (0.6 = E2, 12.1 = E5)', () => {
    const tex = '\\tempo (110) \\tuning (E4 B3 G3 D3 A2 E2) . 0.6.4 12.1.4 0.6{pm}.4 2.6{t}.4 |';
    const doc = parseScoreBytes(strToU8(tex), 'prueba-cuerdas.alphatex');

    expect(validateScoreDocument(doc).valid).toBe(true);
    expect(doc.masterBars).toHaveLength(1);
    expect(doc.masterBars[0]?.tempoChanges[0]?.bpm).toBe(110);

    const track = doc.tracks[0]!;
    expect(track.tuning).toHaveLength(6);
    expect(track.tuning[0]).toEqual({ letter: 'E', accidental: 0, octave: 2 });
    expect(track.tuning[5]).toEqual({ letter: 'E', accidental: 0, octave: 4 });

    const beats = track.bars[0]!.voices[0]!.beats;
    // Cuerda 6 al aire -> stringIndex 0, fret 0, MIDI 40 (E2)
    expect(beats[0]!.notes[0]!.stringIndex).toBe(0);
    expect(beats[0]!.notes[0]!.fret).toBe(0);
    expect(beats[0]!.notes[0]!.midi).toBe(40);

    // Cuerda 1 traste 12 -> stringIndex 5, fret 12, MIDI 76 (E5)
    expect(beats[1]!.notes[0]!.stringIndex).toBe(5);
    expect(beats[1]!.notes[0]!.fret).toBe(12);
    expect(beats[1]!.notes[0]!.midi).toBe(76);

    // Palm mute y ligadura (tie)
    expect(beats[2]!.notes[0]!.palmMute).toBe(true);
    expect(beats[3]!.notes[0]!.tieDestination).toBe(true);
  });

  it('sobrevive conversión ida y vuelta (ScoreDocument -> alphaTab -> ScoreDocument) sin pérdida', () => {
    const tex = `
      \\title "Riff Stoner"
      \\artist "Endurend"
      \\tempo (92)
      \\tuning (E4 B3 G3 D3 A2 D2)
      .
      \\ro \\chord "D5" x 0 0 2 3 x .
      0.6.4{ch "D5"} 0.5{h}.8 3.5{pm}.8 12.1{be (0 0 30 4 60 0)}.4 r.4 |
      \\rc 2 \\ae (1)
      0.6.2 3.6.4{tu 3} 2.6.4{tu 3} 0.6.4{tu 3} |
    `;
    const original = parseScoreBytes(strToU8(tex), 'stoner.alphatex', { kind: 'studio' });
    const roundTripScore = documentToAlphaTabScore(original);
    const restored = alphaTabScoreToDocument(roundTripScore, {
      id: original.id,
      origin: original.origin,
    });

    expect(restored.title).toBe('Riff Stoner');
    expect(restored.artist).toBe('Endurend');
    expect(restored.masterBars).toHaveLength(2);
    expect(restored.masterBars[0]?.repeatStart).toBe(true);
    expect(restored.masterBars[1]?.repeatEndCount).toBe(2);
    expect(restored.masterBars[1]?.alternateEndings).toEqual([1]);

    const t0 = restored.tracks[0]!;
    expect(t0.tuning[0]).toEqual({ letter: 'D', accidental: 0, octave: 2 });
    const origBar0 = original.tracks[0]!.bars[0]!.voices[0]!.beats;
    const restBar0 = t0.bars[0]!.voices[0]!.beats;
    expect(restBar0).toHaveLength(origBar0.length);
    restBar0.forEach((beat, idx) => {
      expect(beat.duration).toBe(origBar0[idx]!.duration);
      expect(beat.isRest).toBe(origBar0[idx]!.isRest);
      expect(beat.notes.map((n) => [n.stringIndex, n.fret, n.midi])).toEqual(
        origBar0[idx]!.notes.map((n) => [n.stringIndex, n.fret, n.midi])
      );
    });
    // Preserva hammer-on, palm mute y bend
    expect(restBar0[1]!.notes[0]!.hammerOrPull).toBe(true);
    expect(restBar0[2]!.notes[0]!.palmMute).toBe(true);
    expect(restBar0[3]!.notes[0]!.bendPoints.length).toBeGreaterThanOrEqual(2);
    // Preserva tresillos del compás 2
    expect(t0.bars[1]!.voices[0]!.beats[1]!.tuplet).toEqual({ enter: 3, in: 2 });
  });

  it('importa MusicXML y contenedores comprimidos .mxl con fflate, y da diagnóstico claro para .tg', () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Escala XML</work-title></work>
  <part-list><score-part id="P1"><part-name>Guitarra</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

    const docXml = parseScoreBytes(strToU8(musicXml), 'escala.musicxml');
    expect(docXml.title).toBe('Escala XML');
    expect(docXml.tracks[0]?.bars[0]?.voices[0]?.beats[0]?.duration).toBe(1);

    const mxlBytes = zipSync({
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'
      ),
      'score.xml': strToU8(musicXml),
    });
    const docMxl = parseScoreBytes(mxlBytes, 'escala.mxl');
    expect(docMxl.title).toBe('Escala XML');

    expect(() => parseScoreBytes(new Uint8Array([1, 2, 3]), 'viejo.tg')).toThrow(
      /TuxGuitar/i
    );
  });

  it('sobrevive conversión ida y vuelta de pista de batería GM sin asignar cuerdas ni trastes', () => {
    const drumDoc = createEmptyScoreDocument({
      title: 'Batería Base',
      family: 'drums',
      trackName: 'Batería',
      timeSignature: { numerator: 4, denominator: 4 },
    });
    const baseNote = {
      id: 'd',
      stringIndex: 0,
      fret: 0,
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
    };
    const withDrums = {
      ...drumDoc,
      tracks: [
        {
          ...drumDoc.tracks[0]!,
          bars: [
            {
              id: 'b1',
              voices: [
                {
                  id: 'v1',
                  beats: [
                    {
                      id: 'bt1',
                      duration: 2 as const,
                      dots: 0 as const,
                      isRest: false,
                      notes: [
                        { ...baseNote, id: 'n1', midi: 36, percussionArticulation: 36 },
                        { ...baseNote, id: 'n2', midi: 42, percussionArticulation: 42 },
                      ],
                    },
                    {
                      id: 'bt2',
                      duration: 2 as const,
                      dots: 0 as const,
                      isRest: false,
                      notes: [
                        { ...baseNote, id: 'n3', midi: 38, percussionArticulation: 38 },
                        { ...baseNote, id: 'n4', midi: 42, percussionArticulation: 42 },
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

    const abScore = documentToAlphaTabScore(withDrums);
    const abNote0 = abScore.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
    expect(Number.isNaN(abNote0.string)).toBe(true);

    const restored = alphaTabScoreToDocument(abScore);
    const tr = restored.tracks[0]!;
    expect(tr.isPercussion).toBe(true);
    expect(tr.family).toBe('drums');
    expect(tr.tuning).toEqual([]);
    expect(tr.bars[0]!.voices[0]!.beats[0]!.notes.map((n) => n.percussionArticulation)).toEqual([
      36, 42,
    ]);
    expect(tr.bars[0]!.voices[0]!.beats[1]!.notes.map((n) => n.percussionArticulation)).toEqual([
      38, 42,
    ]);
  });
});
