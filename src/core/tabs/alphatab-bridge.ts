// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Puente bidireccional puro entre `alphaTab.model.Score` y el modelo canónico `ScoreDocument`,
 * además de importador unificado de formatos (.gp3/.gp4/.gp5/.gpx/.gp, .musicxml/.xml/.mxl,
 * .mid/.midi y .alphatex). Núcleo 100% puro y apto para Node/Vitest.
 */

import * as alphaTab from '@coderline/alphatab/core';
import { strFromU8, unzipSync } from 'fflate';
import { mod12, parseSpelledNote, spellMidi, defaultSharpPitchName, spelledToMidi, type SpelledNote } from '../music/spelling';
import {
  type AccentType,
  type BeatCrescendo,
  type BendPoint,
  type BrushType,
  type DynamicLevel,
  type GraceType,
  type HarmonicType,
  type KeySignature,
  type MasterBar,
  type PickStroke,
  type ScoreBar,
  type ScoreBeat,
  type ScoreDocument,
  type ScoreNote,
  type ScoreOrigin,
  type ScoreTrack,
  type ScoreVoice,
  type SlideInType,
  type SlideOutType,
  type StructuralDirection,
  type TempoChange,
  type TrackFamily,
  type VibratoType,
} from './model';
import {
  barCapacityTicks,
  beatDurationTicks,
  PPQ,
  ticksToFloat,
  type BaseDuration,
  type DotCount,
} from './rhythm';

const { model: m, importer: imp, Settings } = alphaTab;

function readVarLen(bytes: Uint8Array, cursor: { pos: number }): number {
  let value = 0;
  for (let i = 0; i < 4 && cursor.pos < bytes.length; i++) {
    const b = bytes[cursor.pos++]!;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return value;
}

function quantizeTicksToBeat(ticks: number): { duration: BaseDuration; dots: DotCount } {
  const candidates: ReadonlyArray<{ duration: BaseDuration; dots: DotCount }> = [
    { duration: 1, dots: 0 },
    { duration: 2, dots: 1 },
    { duration: 2, dots: 0 },
    { duration: 4, dots: 1 },
    { duration: 4, dots: 0 },
    { duration: 8, dots: 1 },
    { duration: 8, dots: 0 },
    { duration: 16, dots: 1 },
    { duration: 16, dots: 0 },
    { duration: 32, dots: 0 },
  ];
  let best = candidates[4]!;
  let bestDiff = Infinity;
  for (const cand of candidates) {
    const t = ticksToFloat(beatDurationTicks(cand.duration, cand.dots));
    const diff = Math.abs(t - ticks);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  return best;
}

/** Parser puro de archivos Standard MIDI File (SMF 0 / 1) hacia `ScoreDocument` en PPQ = 960. */
function parseMidiBytesToDocument(
  bytes: Uint8Array,
  origin: ScoreOrigin,
  fallbackTitle: string
): ScoreDocument {
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') {
    throw new Error('Archivo MIDI inválido: falta encabezado MThd.');
  }
  const division = (bytes[12]! << 8) | bytes[13]!;
  const midiPpq = division > 0 ? division : 480;
  const scaleToCanon = PPQ / midiPpq;

  let bpm = 120;
  let num = 4;
  let den = 4;
  let maxCanonTick = PPQ * 4;

  interface ParsedMidiTrack {
    name: string;
    program: number;
    isPercussion: boolean;
    notes: { tick: number; midi: number; durationTicks: number }[];
  }
  const parsedTracks: ParsedMidiTrack[] = [];

  let offset = 14;
  while (offset + 8 <= bytes.length) {
    const tag = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const chunkLen =
      ((bytes[offset + 4]! << 24) |
        (bytes[offset + 5]! << 16) |
        (bytes[offset + 6]! << 8) |
        bytes[offset + 7]!) >>>
      0;
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(bytes.length, chunkStart + chunkLen);
    offset = chunkEnd;
    if (tag !== 'MTrk') continue;

    const cursor = { pos: chunkStart };
    let runningStatus = 0;
    let rawTick = 0;
    let trackName = '';
    let program = 25;
    let usesChannel9 = false;
    const openNotes = new Map<string, number>();
    const notes: { tick: number; midi: number; durationTicks: number }[] = [];

    while (cursor.pos < chunkEnd) {
      rawTick += readVarLen(bytes, cursor);
      if (cursor.pos >= chunkEnd) break;
      let status = bytes[cursor.pos]!;
      if (status < 0x80) {
        status = runningStatus;
      } else {
        cursor.pos++;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = bytes[cursor.pos++] ?? 0;
        const len = readVarLen(bytes, cursor);
        const end = Math.min(chunkEnd, cursor.pos + len);
        if (metaType === 0x03) {
          trackName = strFromU8(bytes.slice(cursor.pos, end)).trim();
        } else if (metaType === 0x51 && end - cursor.pos >= 3) {
          const mpq =
            (bytes[cursor.pos]! << 16) | (bytes[cursor.pos + 1]! << 8) | bytes[cursor.pos + 2]!;
          if (mpq > 0) bpm = Math.round(60_000_000 / mpq);
        } else if (metaType === 0x58 && end - cursor.pos >= 2) {
          num = Math.max(1, bytes[cursor.pos]!);
          den = Math.pow(2, bytes[cursor.pos + 1]!);
        }
        cursor.pos = end;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(bytes, cursor);
        cursor.pos = Math.min(chunkEnd, cursor.pos + len);
        continue;
      }

      const type = status & 0xf0;
      const ch = status & 0x0f;
      const canonTick = Math.round(rawTick * scaleToCanon);
      if (ch === 9) usesChannel9 = true;

      if (type === 0xc0 || type === 0xd0) {
        const d1 = bytes[cursor.pos++] ?? 0;
        if (type === 0xc0) program = d1;
        continue;
      }

      const d1 = bytes[cursor.pos++] ?? 0;
      const d2 = bytes[cursor.pos++] ?? 0;
      if (type === 0x90 && d2 > 0) {
        openNotes.set(`${ch}:${d1}`, canonTick);
      } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
        const startT = openNotes.get(`${ch}:${d1}`);
        if (startT !== undefined) {
          openNotes.delete(`${ch}:${d1}`);
          const durT = Math.max(PPQ / 8, canonTick - startT);
          notes.push({ tick: startT, midi: d1, durationTicks: durT });
          if (startT + durT > maxCanonTick) maxCanonTick = startT + durT;
        }
      }
    }

    if (notes.length > 0) {
      parsedTracks.push({
        name: trackName || (usesChannel9 ? 'Batería' : `Pista ${parsedTracks.length + 1}`),
        program,
        isPercussion: usesChannel9,
        notes,
      });
    }
  }

  const barCap = Math.max(PPQ / 2, Math.round(ticksToFloat(barCapacityTicks(num, den))));
  const barCount = Math.max(1, Math.ceil(maxCanonTick / barCap));

  const masterBars: MasterBar[] = Array.from({ length: barCount }, (_, i) => ({
    id: `midi-mb-${i + 1}`,
    timeSignature: { numerator: num, denominator: den },
    tempoChanges: i === 0 ? [{ tickOffset: 0, bpm }] : [],
    keySignature: { fifths: 0, mode: 'major' },
    repeatStart: false,
    repeatEndCount: 0,
    alternateEndings: [],
  }));

  const defaultGtr = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(parseSpelledNote);
  const defaultBass = ['E1', 'A1', 'D2', 'G2'].map(parseSpelledNote);

  const tracks: ScoreTrack[] = (
    parsedTracks.length > 0
      ? parsedTracks
      : [{ name: fallbackTitle || 'Pista 1', program: 25, isPercussion: false, notes: [] }]
  ).map((pt, ti) => {
    const family: TrackFamily = pt.isPercussion
      ? 'drums'
      : pt.program >= 32 && pt.program <= 39
        ? 'bass'
        : pt.program <= 23 || pt.program >= 80
          ? 'keyboard'
          : 'guitar';
    const tuning =
      pt.isPercussion || family === 'keyboard'
        ? []
        : family === 'bass'
          ? defaultBass
          : defaultGtr;

    const bars: ScoreBar[] = Array.from({ length: barCount }, (_, bi) => {
      const start = bi * barCap;
      const end = start + barCap;
      const barNotes = pt.notes.filter((n) => n.tick >= start && n.tick < end);
      const groups = new Map<number, typeof barNotes>();
      barNotes.forEach((n) => {
        const list = groups.get(n.tick) ?? [];
        list.push(n);
        groups.set(n.tick, list);
      });
      const beats: ScoreBeat[] =
        groups.size === 0
          ? [{ id: `m-t${ti}-b${bi}-r`, duration: 4, dots: 0, isRest: true, notes: [] }]
          : [...groups.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([, grp], gi) => {
                const q = quantizeTicksToBeat(grp[0]!.durationTicks);
                return {
                  id: `m-t${ti}-b${bi}-bt${gi}`,
                  duration: q.duration,
                  dots: q.dots,
                  isRest: false,
                  notes: grp.map((gn, ni) => {
                    const fret =
                      tuning.length > 0
                        ? Math.max(0, Math.min(24, gn.midi - spelledToMidi(tuning[0]!)))
                        : 0;
                    return {
                      id: `m-n-${ti}-${bi}-${gi}-${ni}`,
                      stringIndex: 0,
                      fret,
                      midi: gn.midi,
                      ...(pt.isPercussion ? { percussionArticulation: gn.midi } : {}),
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
                  }),
                };
              });
      return { id: `m-bar-${ti}-${bi}`, voices: [{ id: `m-v1-${ti}-${bi}`, beats }] };
    });

    return {
      id: `midi-t-${ti + 1}`,
      name: pt.name,
      shortName: pt.name.slice(0, 4) || `P${ti + 1}`,
      family,
      midiProgram: pt.program,
      isPercussion: pt.isPercussion,
      tuning,
      capo: 0,
      mix: { volume: 1, pan: 0, mute: false, solo: false },
      bars,
    };
  });

  return {
    schemaVersion: 1,
    id: `midi-${Date.now().toString(36)}`,
    title: fallbackTitle || 'Archivo MIDI',
    artist: '',
    album: '',
    subtitle: '',
    copyright: '',
    license: 'GPL-3.0-or-later',
    tags: [],
    origin,
    masterBars,
    tracks,
  };
}

const FLAT_FIFTHS_SPELLINGS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].map((n) => n);
const SHARP_FIFTHS_SPELLINGS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'].map((n) => n);
void FLAT_FIFTHS_SPELLINGS;
void SHARP_FIFTHS_SPELLINGS;

const FLAT_KEY_PC_SPELLINGS: readonly string[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

function spellOpenMidiForKey(midi: number, keyFifths: number): SpelledNote {
  if (keyFifths < 0) {
    const pitchName = FLAT_KEY_PC_SPELLINGS[mod12(midi)]!;
    const octave = Math.floor(midi / 12) - 1;
    return parseSpelledNote(`${pitchName}${octave}`);
  }
  const pitch = defaultSharpPitchName(midi);
  return spellMidi(midi, pitch);
}

function clampBaseDuration(raw: number): BaseDuration {
  switch (raw) {
    case 1:
    case 2:
    case 4:
    case 8:
    case 16:
    case 32:
    case 64:
      return raw;
    case -4:
    case -2:
      return 1;
    case 128:
    case 256:
      return 64;
    default:
      return 4;
  }
}

function durationFromBase(d: BaseDuration): alphaTab.model.Duration {
  switch (d) {
    case 1:
      return m.Duration.Whole;
    case 2:
      return m.Duration.Half;
    case 4:
      return m.Duration.Quarter;
    case 8:
      return m.Duration.Eighth;
    case 16:
      return m.Duration.Sixteenth;
    case 32:
      return m.Duration.ThirtySecond;
    case 64:
      return m.Duration.SixtyFourth;
  }
}

function mapHarmonicFromAlphaTab(h: alphaTab.model.HarmonicType): HarmonicType | undefined {
  switch (h) {
    case m.HarmonicType.Natural:
      return 'natural';
    case m.HarmonicType.Artificial:
      return 'artificial';
    case m.HarmonicType.Pinch:
      return 'pinch';
    case m.HarmonicType.Tap:
      return 'tap';
    case m.HarmonicType.Semi:
      return 'semi';
    default:
      return undefined;
  }
}

function mapHarmonicToAlphaTab(h: HarmonicType | undefined): alphaTab.model.HarmonicType {
  switch (h) {
    case 'natural':
      return m.HarmonicType.Natural;
    case 'artificial':
      return m.HarmonicType.Artificial;
    case 'pinch':
      return m.HarmonicType.Pinch;
    case 'tap':
      return m.HarmonicType.Tap;
    case 'semi':
      return m.HarmonicType.Semi;
    default:
      return m.HarmonicType.None;
  }
}

function mapSlideInFromAlphaTab(s: alphaTab.model.SlideInType): SlideInType | undefined {
  switch (s) {
    case m.SlideInType.IntoFromBelow:
      return 'intoFromBelow';
    case m.SlideInType.IntoFromAbove:
      return 'intoFromAbove';
    default:
      return undefined;
  }
}

function mapSlideInToAlphaTab(s: SlideInType | undefined): alphaTab.model.SlideInType {
  switch (s) {
    case 'intoFromBelow':
      return m.SlideInType.IntoFromBelow;
    case 'intoFromAbove':
      return m.SlideInType.IntoFromAbove;
    default:
      return m.SlideInType.None;
  }
}

function mapSlideOutFromAlphaTab(s: alphaTab.model.SlideOutType): SlideOutType | undefined {
  switch (s) {
    case m.SlideOutType.Shift:
      return 'shift';
    case m.SlideOutType.Legato:
      return 'legato';
    case m.SlideOutType.OutUp:
      return 'outUp';
    case m.SlideOutType.OutDown:
      return 'outDown';
    default:
      return undefined;
  }
}

function mapSlideOutToAlphaTab(s: SlideOutType | undefined): alphaTab.model.SlideOutType {
  switch (s) {
    case 'shift':
      return m.SlideOutType.Shift;
    case 'legato':
      return m.SlideOutType.Legato;
    case 'outUp':
      return m.SlideOutType.OutUp;
    case 'outDown':
      return m.SlideOutType.OutDown;
    default:
      return m.SlideOutType.None;
  }
}

function mapVibratoFromAlphaTab(v: alphaTab.model.VibratoType): VibratoType {
  switch (v) {
    case m.VibratoType.Slight:
      return 'slight';
    case m.VibratoType.Wide:
      return 'wide';
    default:
      return 'none';
  }
}

function mapVibratoToAlphaTab(v: VibratoType | undefined): alphaTab.model.VibratoType {
  switch (v) {
    case 'slight':
      return m.VibratoType.Slight;
    case 'wide':
      return m.VibratoType.Wide;
    default:
      return m.VibratoType.None;
  }
}

function mapBrushFromAlphaTab(b: alphaTab.model.BrushType): BrushType | undefined {
  switch (b) {
    case m.BrushType.BrushUp:
      return 'brushUp';
    case m.BrushType.BrushDown:
      return 'brushDown';
    case m.BrushType.ArpeggioUp:
      return 'arpeggioUp';
    case m.BrushType.ArpeggioDown:
      return 'arpeggioDown';
    default:
      return undefined;
  }
}

function mapBrushToAlphaTab(b: BrushType | undefined): alphaTab.model.BrushType {
  switch (b) {
    case 'brushUp':
      return m.BrushType.BrushUp;
    case 'brushDown':
      return m.BrushType.BrushDown;
    case 'arpeggioUp':
      return m.BrushType.ArpeggioUp;
    case 'arpeggioDown':
      return m.BrushType.ArpeggioDown;
    default:
      return m.BrushType.None;
  }
}

function mapPickFromAlphaTab(p: alphaTab.model.PickStroke): PickStroke | undefined {
  switch (p) {
    case m.PickStroke.Up:
      return 'up';
    case m.PickStroke.Down:
      return 'down';
    default:
      return undefined;
  }
}

function mapPickToAlphaTab(p: PickStroke | undefined): alphaTab.model.PickStroke {
  switch (p) {
    case 'up':
      return m.PickStroke.Up;
    case 'down':
      return m.PickStroke.Down;
    default:
      return m.PickStroke.None;
  }
}

function mapDynamicFromAlphaTab(d: alphaTab.model.DynamicValue): DynamicLevel | undefined {
  switch (d) {
    case m.DynamicValue.PPP:
    case m.DynamicValue.PPPP:
    case m.DynamicValue.PPPPP:
    case m.DynamicValue.PPPPPP:
      return 'ppp';
    case m.DynamicValue.PP:
      return 'pp';
    case m.DynamicValue.P:
      return 'p';
    case m.DynamicValue.MP:
      return 'mp';
    case m.DynamicValue.MF:
      return 'mf';
    case m.DynamicValue.F:
      return 'f';
    case m.DynamicValue.FF:
      return 'ff';
    case m.DynamicValue.FFF:
    case m.DynamicValue.FFFF:
    case m.DynamicValue.FFFFF:
    case m.DynamicValue.FFFFFF:
      return 'fff';
    default:
      return undefined;
  }
}

function mapDynamicToAlphaTab(d: DynamicLevel | undefined): alphaTab.model.DynamicValue {
  switch (d) {
    case 'ppp':
      return m.DynamicValue.PPP;
    case 'pp':
      return m.DynamicValue.PP;
    case 'p':
      return m.DynamicValue.P;
    case 'mp':
      return m.DynamicValue.MP;
    case 'mf':
      return m.DynamicValue.MF;
    case 'f':
      return m.DynamicValue.F;
    case 'ff':
      return m.DynamicValue.FF;
    case 'fff':
      return m.DynamicValue.FFF;
    default:
      return m.DynamicValue.F;
  }
}

function mapAccentFromAlphaTab(a: alphaTab.model.AccentuationType): AccentType {
  switch (a) {
    case m.AccentuationType.Normal:
      return 'normal';
    case m.AccentuationType.Heavy:
      return 'heavy';
    default:
      return 'none';
  }
}

function mapAccentToAlphaTab(a: AccentType): alphaTab.model.AccentuationType {
  switch (a) {
    case 'normal':
      return m.AccentuationType.Normal;
    case 'heavy':
      return m.AccentuationType.Heavy;
    default:
      return m.AccentuationType.None;
  }
}

function mapGraceFromAlphaTab(g: alphaTab.model.GraceType): GraceType | undefined {
  switch (g) {
    case m.GraceType.OnBeat:
      return 'onBeat';
    case m.GraceType.BeforeBeat:
    case m.GraceType.BendGrace:
      return 'beforeBeat';
    default:
      return undefined;
  }
}

function mapGraceToAlphaTab(g: GraceType | undefined): alphaTab.model.GraceType {
  switch (g) {
    case 'onBeat':
      return m.GraceType.OnBeat;
    case 'beforeBeat':
      return m.GraceType.BeforeBeat;
    default:
      return m.GraceType.None;
  }
}

function mapBendPointsFromAlphaTab(
  points: readonly alphaTab.model.BendPoint[] | null | undefined
): BendPoint[] {
  if (!points || points.length === 0) return [];
  return points.map((p) => ({
    offset: Math.max(0, Math.min(100, Math.round((p.offset / 60) * 100))),
    value: p.value,
  }));
}

function decodeAlternateEndingsMask(mask: number): number[] {
  if (!mask) return [];
  const list: number[] = [];
  for (let bit = 0; bit < 16; bit++) {
    if ((mask & (1 << bit)) !== 0) list.push(bit + 1);
  }
  return list;
}

function encodeAlternateEndingsMask(endings: readonly number[]): number {
  let mask = 0;
  for (const num of endings) {
    if (num >= 1 && num <= 16) mask |= 1 << (num - 1);
  }
  return mask;
}

function inferTrackFamily(
  staff: alphaTab.model.Staff | undefined,
  program: number,
  primaryChannel: number,
  tuningMidis: readonly number[],
  trackName: string
): TrackFamily {
  if (staff?.isPercussion || primaryChannel === 9) return 'drums';
  if (program >= 32 && program <= 39) return 'bass';
  if (program >= 24 && program <= 31) return 'guitar';
  if (program >= 0 && program <= 23) return 'keyboard';
  if (tuningMidis.length >= 4 && tuningMidis.length <= 8) {
    const lowest = Math.min(...tuningMidis);
    if (lowest <= 33 && tuningMidis.length <= 6 && /bass|bajo/i.test(trackName)) {
      return 'bass';
    }
    return 'guitar';
  }
  if (/bass|bajo/i.test(trackName)) return 'bass';
  if (/drum|bat|perc/i.test(trackName)) return 'drums';
  if (/piano|key|teclad|synth|organ/i.test(trackName)) return 'keyboard';
  return 'other';
}

function mapDirectionsFromMasterBar(mb: alphaTab.model.MasterBar): StructuralDirection[] | undefined {
  if (!mb.directions || mb.directions.size === 0) return undefined;
  const out: StructuralDirection[] = [];
  for (const dir of mb.directions) {
    if (dir === m.Direction.JumpDaCapo || dir === m.Direction.JumpDaCapoAlCoda || dir === m.Direction.JumpDaCapoAlFine) {
      out.push('dc');
    } else if (dir === m.Direction.JumpDalSegno || dir === m.Direction.JumpDalSegnoAlCoda || dir === m.Direction.JumpDalSegnoAlFine) {
      out.push('ds');
    } else if (dir === m.Direction.TargetSegno || dir === m.Direction.TargetSegnoSegno) {
      out.push('segno');
    } else if (dir === m.Direction.TargetCoda || dir === m.Direction.JumpDaCoda) {
      out.push('coda');
    } else if (dir === m.Direction.TargetFine) {
      out.push('fine');
    }
  }
  return out.length > 0 ? out : undefined;
}

export interface BridgeImportOptions {
  readonly id?: string;
  readonly origin?: ScoreOrigin;
  readonly fallbackTitle?: string;
}

/** Convierte un `alphaTab.model.Score` al modelo canónico `ScoreDocument` (PPQ = 960). */
export function alphaTabScoreToDocument(
  score: alphaTab.model.Score,
  options: BridgeImportOptions = {}
): ScoreDocument {
  const docId = options.id ?? `score-${Math.abs(score.title.length * 31 + score.masterBars.length)}`;

  const masterBars: MasterBar[] = score.masterBars.map((abMb, barIdx) => {
    const capFloat = ticksToFloat(
      barCapacityTicks(abMb.timeSignatureNumerator || 4, abMb.timeSignatureDenominator || 4)
    );

    const tempoChanges: TempoChange[] = [];
    for (const auto of abMb.tempoAutomations ?? []) {
      tempoChanges.push({
        tickOffset: Math.max(0, Math.round(capFloat * (auto.ratioPosition || 0))),
        bpm: auto.value,
        ...(auto.text ? { label: auto.text } : {}),
      });
    }
    if (barIdx === 0 && tempoChanges.length === 0 && score.tempo > 0) {
      tempoChanges.push({ tickOffset: 0, bpm: score.tempo });
    }

    const keySignature: KeySignature = {
      fifths: Number(abMb.keySignature) || 0,
      mode: abMb.keySignatureType === m.KeySignatureType.Minor ? 'minor' : 'major',
    };

    const directions = mapDirectionsFromMasterBar(abMb);

    return {
      id: `mb-${barIdx + 1}`,
      timeSignature: {
        numerator: abMb.timeSignatureNumerator || 4,
        denominator: abMb.timeSignatureDenominator || 4,
      },
      tempoChanges,
      keySignature,
      repeatStart: Boolean(abMb.isRepeatStart),
      repeatEndCount: abMb.repeatCount || 0,
      alternateEndings: decodeAlternateEndingsMask(abMb.alternateEndings || 0),
      ...(abMb.section?.text
        ? {
            section: {
              text: abMb.section.text,
              ...(abMb.section.marker ? { marker: abMb.section.marker } : {}),
            },
          }
        : {}),
      ...(abMb.isDoubleBar ? { isDoubleBar: true } : {}),
      ...(directions ? { directions } : {}),
      ...(abMb.fermata && abMb.fermata.size > 0 ? { fermata: true } : {}),
    };
  });

  const keyFifths = masterBars[0]?.keySignature.fifths ?? 0;

  const tracks: ScoreTrack[] = score.tracks.map((abTrack, trackIdx) => {
    const staff = abTrack.staves[0];
    const isPercussion = Boolean(staff?.isPercussion || abTrack.playbackInfo.primaryChannel === 9);
    // alphaTab almacena `staff.tuning` de cuerda aguda (1ª) a grave (Nª). Nuestra convención es grave -> aguda.
    const alphaTuningHighToLow = staff ? [...staff.tuning] : [];
    const tuningLowToHighMidis = isPercussion ? [] : [...alphaTuningHighToLow].reverse();
    const tuning: SpelledNote[] = tuningLowToHighMidis.map((midi) =>
      spellOpenMidiForKey(midi, keyFifths)
    );
    const family = inferTrackFamily(
      staff,
      abTrack.playbackInfo.program,
      abTrack.playbackInfo.primaryChannel,
      tuningLowToHighMidis,
      abTrack.name
    );

    const bars: ScoreBar[] = (staff?.bars ?? []).map((abBar, barIdx) => {
      const voices: ScoreVoice[] = abBar.voices
        .filter((v, vIdx) => vIdx === 0 || !v.isEmpty)
        .slice(0, 2)
        .map((abVoice, voiceIdx) => {
          const beats: ScoreBeat[] = abVoice.beats.map((abBeat, beatIdx) => {
            const duration = clampBaseDuration(abBeat.duration);
            const dots: DotCount = abBeat.dots >= 2 ? 2 : abBeat.dots === 1 ? 1 : 0;
            const hasTuplet = abBeat.tupletNumerator > 0 && abBeat.tupletDenominator > 0;

            const chordObj =
              abBeat.chordId && staff ? staff.getChord(abBeat.chordId) : null;
            const lyricsText =
              abBeat.lyrics && abBeat.lyrics.length > 0
                ? abBeat.lyrics.filter(Boolean).join(' ')
                : undefined;

            const notes: ScoreNote[] = abBeat.notes.map((abNote, noteIdx) => {
              // En alphaTab, `note.string` es 1-based desde el final de `staff.tuning` (1 = más grave).
              const rawStringIndex =
                !isPercussion && tuning.length > 0
                  ? Math.max(0, Math.min(tuning.length - 1, abNote.string - 1))
                  : 0;
              const fallbackMidi = isPercussion
                ? abNote.percussionArticulation >= 0
                  ? abNote.percussionArticulation
                  : 38
                : tuning[rawStringIndex] !== undefined
                  ? spelledToMidi(tuning[rawStringIndex]!) + (staff?.capo ?? 0) + abNote.fret
                  : abNote.realValue;
              const midi = abNote.realValue > 0 ? abNote.realValue : fallbackMidi;
              const percArt =
                isPercussion && midi >= 0 ? midi : undefined;

              const harmonic = mapHarmonicFromAlphaTab(abNote.harmonicType);
              const slideIn = mapSlideInFromAlphaTab(abNote.slideInType);
              const slideOut = mapSlideOutFromAlphaTab(abNote.slideOutType);
              const crescendo: BeatCrescendo | undefined = undefined;
              void crescendo;

              return {
                id: `t${trackIdx + 1}-b${barIdx + 1}-v${voiceIdx + 1}-bt${beatIdx + 1}-n${noteIdx + 1}`,
                stringIndex: rawStringIndex,
                fret: isPercussion ? 0 : abNote.fret,
                midi,
                ...(percArt !== undefined ? { percussionArticulation: percArt } : {}),
                tieDestination: Boolean(abNote.isTieDestination),
                hammerOrPull: Boolean(abNote.isHammerPullOrigin),
                ...(slideIn ? { slideIn } : {}),
                ...(slideOut ? { slideOut } : {}),
                bendPoints: mapBendPointsFromAlphaTab(abNote.bendPoints),
                vibrato: mapVibratoFromAlphaTab(abNote.vibrato),
                palmMute: Boolean(abNote.isPalmMute || abBeat.isPalmMute),
                letRing: Boolean(abNote.isLetRing || abBeat.isLetRing),
                deadNote: Boolean(abNote.isDead),
                ghostNote: Boolean(abNote.isGhost),
                ...(harmonic ? { harmonic, harmonicValue: abNote.harmonicValue } : {}),
                leftHandTapped: Boolean(abNote.isLeftHandTapped),
                slap: Boolean(abBeat.slap),
                pop: Boolean(abBeat.pop),
                staccato: Boolean(abNote.isStaccato),
                accent: mapAccentFromAlphaTab(abNote.accentuated),
                ...(abBeat.isTremolo
                  ? { tremoloPicking: clampBaseDuration(abBeat.duration) }
                  : {}),
                ...(abNote.isTrill
                  ? {
                      trill: {
                        fret: abNote.trillFret,
                        duration: clampBaseDuration(abNote.trillSpeed),
                      },
                    }
                  : {}),
              };
            });

            const brush = mapBrushFromAlphaTab(abBeat.brushType);
            const pickStroke = mapPickFromAlphaTab(abBeat.pickStroke);
            const dynamic = mapDynamicFromAlphaTab(abBeat.dynamics);
            const grace = mapGraceFromAlphaTab(abBeat.graceType);
            const beatVibrato = mapVibratoFromAlphaTab(abBeat.vibrato);
            const whammy = mapBendPointsFromAlphaTab(abBeat.whammyBarPoints);

            return {
              id: `t${trackIdx + 1}-b${barIdx + 1}-v${voiceIdx + 1}-bt${beatIdx + 1}`,
              duration,
              dots,
              ...(hasTuplet
                ? {
                    tuplet: {
                      enter: abBeat.tupletNumerator,
                      in: abBeat.tupletDenominator,
                    },
                  }
                : {}),
              isRest: Boolean(abBeat.isRest || notes.length === 0),
              ...(chordObj?.name ? { chordSymbol: chordObj.name } : {}),
              ...(lyricsText ? { lyrics: lyricsText } : {}),
              ...(pickStroke ? { pickStroke } : {}),
              ...(brush ? { brush } : {}),
              ...(dynamic ? { dynamic } : {}),
              ...(grace ? { grace } : {}),
              ...(beatVibrato !== 'none' ? { vibrato: beatVibrato } : {}),
              ...(whammy.length > 0 ? { whammyBarPoints: whammy } : {}),
              ...(abBeat.isPalmMute ? { palmMute: true } : {}),
              ...(abBeat.isLetRing ? { letRing: true } : {}),
              ...(abBeat.slap ? { slap: true } : {}),
              ...(abBeat.pop ? { pop: true } : {}),
              ...(abBeat.tap ? { tap: true } : {}),
              notes,
            };
          });

          return {
            id: `t${trackIdx + 1}-b${barIdx + 1}-v${voiceIdx + 1}`,
            beats,
          };
        });

      return {
        id: `t${trackIdx + 1}-b${barIdx + 1}`,
        voices: voices.length > 0 ? voices : [{ id: `t${trackIdx + 1}-b${barIdx + 1}-v1`, beats: [] }],
      };
    });

    const volume = Number.isFinite(abTrack.playbackInfo.volume)
      ? Math.max(0, Math.min(1.5, abTrack.playbackInfo.volume / 15))
      : 1;
    const balance = Number.isFinite(abTrack.playbackInfo.balance)
      ? Math.max(-1, Math.min(1, (abTrack.playbackInfo.balance - 8) / 8))
      : 0;

    return {
      id: `track-${trackIdx + 1}`,
      name: abTrack.name || `Pista ${trackIdx + 1}`,
      shortName: abTrack.shortName || abTrack.name.slice(0, 4) || `P${trackIdx + 1}`,
      family,
      midiProgram: abTrack.playbackInfo.program,
      isPercussion,
      tuning,
      capo: staff?.capo ?? 0,
      mix: {
        volume,
        pan: balance,
        mute: Boolean(abTrack.playbackInfo.isMute),
        solo: Boolean(abTrack.playbackInfo.isSolo),
      },
      bars,
    };
  });

  return {
    schemaVersion: 1,
    id: docId,
    title: (score.title || options.fallbackTitle || 'Sin título').replace(/\u00a0/g, ' ').trim(),
    artist: (score.artist || '').replace(/\u00a0/g, ' ').trim(),
    album: (score.album || '').replace(/\u00a0/g, ' ').trim(),
    subtitle: (score.subTitle || '').replace(/\u00a0/g, ' ').trim(),
    copyright: (score.copyright || '').replace(/\u00a0/g, ' ').trim(),
    license: 'GPL-3.0-or-later',
    tags: [],
    origin: options.origin ?? { kind: 'byot' },
    masterBars,
    tracks,
  };
}

/** Convierte un `ScoreDocument` al modelo ejecutable y renderizable `alphaTab.model.Score`. */
export function documentToAlphaTabScore(doc: ScoreDocument): alphaTab.model.Score {
  const score = new m.Score();
  score.title = doc.title;
  score.artist = doc.artist;
  score.album = doc.album;
  score.subTitle = doc.subtitle;
  score.copyright = doc.copyright;

  // 1. MasterBars (agregar primero al Score para que `keySignature` tenga contexto)
  doc.masterBars.forEach((mbDoc) => {
    const abMb = new m.MasterBar();
    abMb.timeSignatureNumerator = mbDoc.timeSignature.numerator;
    abMb.timeSignatureDenominator = mbDoc.timeSignature.denominator;
    abMb.isRepeatStart = mbDoc.repeatStart;
    abMb.repeatCount = mbDoc.repeatEndCount;
    abMb.alternateEndings = encodeAlternateEndingsMask(mbDoc.alternateEndings);
    abMb.isDoubleBar = Boolean(mbDoc.isDoubleBar);

    if (mbDoc.section?.text) {
      const sec = new m.Section();
      sec.text = mbDoc.section.text;
      sec.marker = mbDoc.section.marker ?? '';
      abMb.section = sec;
    }

    const cap = ticksToFloat(
      barCapacityTicks(mbDoc.timeSignature.numerator, mbDoc.timeSignature.denominator)
    );
    for (const tc of mbDoc.tempoChanges) {
      const ratio = cap > 0 ? Math.max(0, Math.min(0.999, tc.tickOffset / cap)) : 0;
      const auto = m.Automation.buildTempoAutomation(false, ratio, tc.bpm, 0, true);
      if (tc.label) auto.text = tc.label;
      abMb.tempoAutomations.push(auto);
    }

    score.addMasterBar(abMb);
  });

  // 2. Tracks, Staves, Bars, Voices, Beats y Notes
  doc.tracks.forEach((trackDoc, trackIdx) => {
    const abTrack = new m.Track();
    abTrack.name = trackDoc.name;
    abTrack.shortName = trackDoc.shortName;
    abTrack.playbackInfo.program = trackDoc.midiProgram;
    abTrack.playbackInfo.volume = Math.max(0, Math.min(16, Math.round(trackDoc.mix.volume * 15)));
    abTrack.playbackInfo.balance = Math.max(0, Math.min(16, Math.round((trackDoc.mix.pan + 1) * 8)));
    abTrack.playbackInfo.isMute = trackDoc.mix.mute;
    abTrack.playbackInfo.isSolo = trackDoc.mix.solo;
    if (trackDoc.isPercussion) {
      abTrack.playbackInfo.primaryChannel = 9;
      abTrack.playbackInfo.secondaryChannel = 9;
    } else {
      const ch = trackIdx === 9 ? 10 : trackIdx * 2;
      abTrack.playbackInfo.primaryChannel = ch;
      abTrack.playbackInfo.secondaryChannel = ch + 1;
    }

    const staff = new m.Staff();
    staff.isPercussion = trackDoc.isPercussion;
    staff.capo = trackDoc.capo;
    if (trackDoc.isPercussion) {
      staff.showTablature = false;
      staff.showStandardNotation = true;
      staff.displayTranspositionPitch = 0;
    } else if (trackDoc.family === 'keyboard' || trackDoc.tuning.length === 0) {
      staff.showTablature = false;
      staff.showStandardNotation = true;
      staff.displayTranspositionPitch = 0;
    } else {
      staff.showTablature = true;
      staff.showStandardNotation = true;
      staff.displayTranspositionPitch = -12;
      // Nuestra afinación es grave -> aguda; alphaTab exige aguda (1ª) -> grave (Nª).
      staff.stringTuning.tunings = [...trackDoc.tuning].reverse().map(spelledToMidi);
    }

    abTrack.addStaff(staff);
    score.addTrack(abTrack);

    const registeredChords = new Set<string>();

    trackDoc.bars.forEach((barDoc) => {
      const abBar = new m.Bar();
      if (trackDoc.isPercussion) {
        abBar.clef = m.Clef.Neutral;
      } else if (trackDoc.family === 'bass') {
        abBar.clef = m.Clef.F4;
      } else {
        abBar.clef = m.Clef.G2;
      }

      barDoc.voices.forEach((voiceDoc) => {
        const abVoice = new m.Voice();

        voiceDoc.beats.forEach((beatDoc) => {
          const abBeat = new m.Beat();
          abBeat.duration = durationFromBase(beatDoc.duration);
          abBeat.dots = beatDoc.dots;
          if (beatDoc.tuplet) {
            abBeat.tupletNumerator = beatDoc.tuplet.enter;
            abBeat.tupletDenominator = beatDoc.tuplet.in;
          }
          abBeat.isPalmMute = Boolean(beatDoc.palmMute);
          abBeat.isLetRing = Boolean(beatDoc.letRing);
          abBeat.slap = Boolean(beatDoc.slap);
          abBeat.pop = Boolean(beatDoc.pop);
          abBeat.tap = Boolean(beatDoc.tap);
          if (beatDoc.pickStroke) abBeat.pickStroke = mapPickToAlphaTab(beatDoc.pickStroke);
          if (beatDoc.brush) abBeat.brushType = mapBrushToAlphaTab(beatDoc.brush);
          if (beatDoc.dynamic) abBeat.dynamics = mapDynamicToAlphaTab(beatDoc.dynamic);
          if (beatDoc.grace) abBeat.graceType = mapGraceToAlphaTab(beatDoc.grace);
          if (beatDoc.vibrato) abBeat.vibrato = mapVibratoToAlphaTab(beatDoc.vibrato);
          if (beatDoc.lyrics !== undefined) abBeat.lyrics = [beatDoc.lyrics];

          if (beatDoc.chordSymbol) {
            if (!registeredChords.has(beatDoc.chordSymbol)) {
              const chord = new m.Chord();
              chord.name = beatDoc.chordSymbol;
              chord.showDiagram = true;
              chord.showName = true;
              staff.addChord(beatDoc.chordSymbol, chord);
              registeredChords.add(beatDoc.chordSymbol);
            }
            abBeat.chordId = beatDoc.chordSymbol;
          }

          for (const wp of beatDoc.whammyBarPoints ?? []) {
            abBeat.addWhammyBarPoint(
              new m.BendPoint(Math.round((wp.offset / 100) * 60), wp.value)
            );
          }

          if (!beatDoc.isRest) {
            beatDoc.notes.forEach((noteDoc) => {
              const abNote = new m.Note();
              if (trackDoc.isPercussion) {
                abNote.percussionArticulation =
                  noteDoc.percussionArticulation ?? noteDoc.midi;
              } else {
                abNote.fret = noteDoc.fret;
                abNote.string = noteDoc.stringIndex + 1;
                if (trackDoc.tuning.length === 0) {
                  abNote.tone = noteDoc.midi % 12;
                  abNote.octave = Math.floor(noteDoc.midi / 12) - 1;
                }
              }
              abNote.isTieDestination = noteDoc.tieDestination;
              abNote.isHammerPullOrigin = noteDoc.hammerOrPull;
              abNote.slideInType = mapSlideInToAlphaTab(noteDoc.slideIn);
              abNote.slideOutType = mapSlideOutToAlphaTab(noteDoc.slideOut);
              abNote.vibrato = mapVibratoToAlphaTab(noteDoc.vibrato);
              abNote.isPalmMute = noteDoc.palmMute;
              abNote.isLetRing = noteDoc.letRing;
              abNote.isDead = noteDoc.deadNote;
              abNote.isGhost = noteDoc.ghostNote;
              abNote.harmonicType = mapHarmonicToAlphaTab(noteDoc.harmonic);
              if (noteDoc.harmonicValue !== undefined) {
                abNote.harmonicValue = noteDoc.harmonicValue;
              }
              abNote.isLeftHandTapped = noteDoc.leftHandTapped;
              abNote.isStaccato = noteDoc.staccato;
              abNote.accentuated = mapAccentToAlphaTab(noteDoc.accent);

              for (const bp of noteDoc.bendPoints) {
                abNote.addBendPoint(
                  new m.BendPoint(Math.round((bp.offset / 100) * 60), bp.value)
                );
              }

              abBeat.addNote(abNote);
            });
          }

          abVoice.addBeat(abBeat);
        });

        abBar.addVoice(abVoice);
      });

      staff.addBar(abBar);
    });
  });

  // keySignature escribe en staff.bars[index]: se aplica recién cuando las pistas ya existen.
  doc.masterBars.forEach((mbDoc, idx) => {
    const abMb = score.masterBars[idx]!;
    abMb.keySignature = mbDoc.keySignature.fifths as alphaTab.model.KeySignature;
    abMb.keySignatureType =
      mbDoc.keySignature.mode === 'minor'
        ? m.KeySignatureType.Minor
        : m.KeySignatureType.Major;
  });

  score.finish(new Settings());
  return score;
}

function extractMusicXmlFromMxl(bytes: Uint8Array): Uint8Array {
  const archive = unzipSync(bytes);
  const containerBytes = archive['META-INF/container.xml'];
  if (containerBytes) {
    const containerXml = strFromU8(containerBytes);
    const match = /full-path="([^"]+)"/.exec(containerXml);
    if (match?.[1] && archive[match[1]]) {
      return archive[match[1]]!;
    }
  }
  const xmlEntry = Object.keys(archive).find(
    (name) => !name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(name)
  );
  if (!xmlEntry || !archive[xmlEntry]) {
    throw new Error('El archivo .mxl no contiene un documento MusicXML válido.');
  }
  return archive[xmlEntry]!;
}

/**
 * Importa bytes de partitura (.gp3/.gp4/.gp5/.gpx/.gp, .musicxml/.xml/.mxl, .mid/.midi, .alphatex)
 * hacia el modelo canónico `ScoreDocument`.
 */
export function parseScoreBytes(
  bytes: Uint8Array,
  fileName: string,
  origin: ScoreOrigin = { kind: 'byot' }
): ScoreDocument {
  const lower = fileName.toLowerCase();
  const baseTitle = fileName.replace(/\.[^.]+$/, '');
  const settings = new Settings();

  if (lower.endsWith('.tg')) {
    throw new Error(
      'Los archivos TuxGuitar (.tg) binarios no son compatibles directamente; exportalos desde TuxGuitar como .gp, .gp5 o .musicxml.'
    );
  }

  if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
    return parseMidiBytesToDocument(bytes, origin, baseTitle);
  }

  let score: alphaTab.model.Score;
  if (lower.endsWith('.alphatex') || lower.endsWith('.atex')) {
    const texImporter = new imp.AlphaTexImporter();
    texImporter.initFromString(strFromU8(bytes), settings);
    score = texImporter.readScore();
  } else if (lower.endsWith('.mxl')) {
    const xmlBytes = extractMusicXmlFromMxl(bytes);
    score = imp.ScoreLoader.loadScoreFromBytes(xmlBytes, settings);
  } else {
    score = imp.ScoreLoader.loadScoreFromBytes(bytes, settings);
  }

  return alphaTabScoreToDocument(score, {
    origin,
    fallbackTitle: baseTitle,
  });
}
