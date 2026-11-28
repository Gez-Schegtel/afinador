// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Generador procedimental determinístico de ejercicios de escalas, modos y arpegios en
 * formato `ScoreDocument` (Spec 010). Usa aritmética exacta PPQ = 960 y cero IA.
 */

import { findQuality, spellChord } from '../music/chords';
import { type ScaleDefinition } from '../music/scales';
import {
  mod12,
  pitchClassOf,
  spelledToMidi,
  type PitchName,
  type SpelledNote,
} from '../music/spelling';
import {
  PPQ,
  WHOLE_TICKS,
  barCapacityTicks,
  rational,
  ticksToNumberFloor,
  type BaseDuration,
  type DotCount,
  type TupletRatio,
} from './rhythm';
import {
  type ScoreBar,
  type ScoreBeat,
  type ScoreDocument,
  type ScoreNote,
  type ScoreOrigin,
  type ScoreTrack,
  type TrackFamily,
} from './model';
import {
  computeScaleFingering,
  type FingeringSystem,
  type FrettedScaleNote,
} from './scale-fingering';

export type MelodicPatternId =
  | 'asc-desc'
  | 'asc'
  | 'desc'
  | 'thirds'
  | 'groups-3'
  | 'groups-4'
  | 'pedal-tone'
  | 'string-skipping'
  | 'sweep';

export const MELODIC_PATTERN_LABELS: Readonly<Record<MelodicPatternId, string>> = {
  'asc-desc': 'Ascendente y descendente',
  asc: 'Solo ascendente',
  desc: 'Solo descendente',
  thirds: 'Por terceras diatónicas',
  'groups-3': 'Grupos de 3 notas (1-2-3, 2-3-4…)',
  'groups-4': 'Grupos de 4 notas (1-2-3-4…)',
  'pedal-tone': 'Pedal Tone (nota pivote)',
  'string-skipping': 'String Skipping (salto de cuerda)',
  sweep: 'Sweep Picking (ciclo cerrado)',
};

export type ScaleRhythmFigure =
  | 'quarter'
  | 'eighth'
  | 'triplet-eighth'
  | 'sixteenth';

export const SCALE_RHYTHM_LABELS: Readonly<Record<ScaleRhythmFigure, string>> = {
  quarter: 'Negras (1/4)',
  eighth: 'Corcheas (1/8)',
  'triplet-eighth': 'Tresillos de corchea (3)',
  sixteenth: 'Semicorcheas (1/16)',
};

export type ScaleArticulation = 'alternate' | 'legato' | 'palm-mute';

export const SCALE_ARTICULATION_LABELS: Readonly<Record<ScaleArticulation, string>> = {
  alternate: 'Púa alterna',
  legato: 'Legato (Hammer / Pull)',
  'palm-mute': 'Palm Mute',
};

export type DrumBackingStyle = 'none' | 'rock' | 'ballad' | 'shuffle' | 'hihat';

export const DRUM_BACKING_LABELS: Readonly<Record<DrumBackingStyle, string>> = {
  none: 'Sin batería',
  rock: 'Rock 4/4',
  ballad: 'Balada / Corcheas',
  shuffle: 'Tresillo / Shuffle',
  hihat: 'Clic de Hi-Hat',
};

export interface ScaleExerciseOptions {
  readonly id?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly bpm?: number;
  readonly tuning: readonly SpelledNote[];
  readonly instrumentFamily?: TrackFamily;
  readonly root: PitchName;
  readonly scale: ScaleDefinition;
  readonly system: FingeringSystem;
  readonly position?: number;
  readonly stringIndex?: number;
  readonly sweepStrings?: 3 | 4 | 5;
  readonly pattern: MelodicPatternId;
  readonly rhythm: ScaleRhythmFigure;
  readonly articulation: ScaleArticulation;
  readonly drumStyle?: DrumBackingStyle;
  readonly modalDrone?: boolean;
  readonly origin?: ScoreOrigin;
  readonly tags?: readonly string[];
  readonly difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

function makeNote(
  id: string,
  n: FrettedScaleNote,
  palmMute: boolean
): ScoreNote {
  return {
    id,
    stringIndex: n.stringIndex,
    fret: n.fret,
    midi: n.midi,
    tieDestination: false,
    hammerOrPull: false,
    bendPoints: [],
    vibrato: 'none',
    palmMute,
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

/** Aplica el patrón melódico determinístico sobre la lista ordenada de notas digitadas. */
export function applyMelodicPattern(
  notes: readonly FrettedScaleNote[],
  pattern: MelodicPatternId
): FrettedScaleNote[] {
  const k = notes.length;
  if (k === 0) return [];
  if (k === 1) return [...notes];

  switch (pattern) {
    case 'asc':
      return [...notes];
    case 'desc':
      return [...notes].reverse();
    case 'asc-desc':
      return [...notes, ...notes.slice(0, -1).reverse()];
    case 'sweep': {
      const down = notes.slice(1, -1).reverse();
      return [...notes, ...down];
    }
    case 'thirds': {
      if (k < 3) return [...notes];
      const out: FrettedScaleNote[] = [];
      for (let i = 0; i + 2 < k; i++) {
        out.push(notes[i]!, notes[i + 2]!);
      }
      for (let i = k - 1; i >= 2; i--) {
        out.push(notes[i]!, notes[i - 2]!);
      }
      return out;
    }
    case 'groups-3': {
      if (k < 3) return [...notes];
      const out: FrettedScaleNote[] = [];
      for (let i = 0; i + 2 < k; i++) {
        out.push(notes[i]!, notes[i + 1]!, notes[i + 2]!);
      }
      for (let i = k - 1; i >= 2; i--) {
        out.push(notes[i]!, notes[i - 1]!, notes[i - 2]!);
      }
      return out;
    }
    case 'groups-4': {
      if (k < 4) return [...notes];
      const out: FrettedScaleNote[] = [];
      for (let i = 0; i + 3 < k; i++) {
        out.push(notes[i]!, notes[i + 1]!, notes[i + 2]!, notes[i + 3]!);
      }
      return out;
    }
    case 'pedal-tone': {
      const pedal = notes[0]!;
      const out: FrettedScaleNote[] = [];
      for (let i = 1; i < k; i++) {
        out.push(pedal, notes[i]!);
      }
      for (let i = k - 2; i >= 1; i--) {
        out.push(pedal, notes[i]!);
      }
      return out;
    }
    case 'string-skipping': {
      const evens = notes.filter((n) => n.stringIndex % 2 === 0);
      const odds = notes.filter((n) => n.stringIndex % 2 === 1);
      if (evens.length === 0 || odds.length === 0) return [...notes];
      const out: FrettedScaleNote[] = [];
      const len = Math.max(evens.length, odds.length);
      for (let i = 0; i < len; i++) {
        if (i < evens.length) out.push(evens[i]!);
        if (i < odds.length) out.push(odds[i]!);
      }
      return out;
    }
  }
}

function rhythmSpec(fig: ScaleRhythmFigure): {
  duration: BaseDuration;
  dots: DotCount;
  tuplet?: TupletRatio;
  ticks: number;
} {
  switch (fig) {
    case 'quarter':
      return { duration: 4, dots: 0, ticks: PPQ };
    case 'eighth':
      return { duration: 8, dots: 0, ticks: PPQ / 2 };
    case 'triplet-eighth':
      return { duration: 8, dots: 0, tuplet: { enter: 3, in: 2 }, ticks: 320 };
    case 'sixteenth':
      return { duration: 16, dots: 0, ticks: PPQ / 4 };
  }
}

function fillTrailingRestBeats(
  ticksRemaining: number,
  barPrefix: string,
  startBeatIndex: number,
  closingNote?: FrettedScaleNote,
  palmMute: boolean = false
): ScoreBeat[] {
  const beats: ScoreBeat[] = [];
  let rem = ticksRemaining;
  let beatIdx = startBeatIndex;

  // Cerrar primero con una nota final de tónica en el primer hueco grande si cabe una figura exacta
  const baseChoices: readonly BaseDuration[] = [1, 2, 4, 8, 16];
  if (closingNote && rem > 0) {
    for (const dur of baseChoices) {
      const t = WHOLE_TICKS / dur;
      if (t <= rem) {
        beats.push({
          id: `${barPrefix}-bt${beatIdx++}`,
          duration: dur,
          dots: 0,
          isRest: false,
          ...(palmMute ? { palmMute: true } : {}),
          notes: [makeNote(`${barPrefix}-bt${beatIdx - 1}-n1`, closingNote, palmMute)],
        });
        rem -= t;
        break;
      }
    }
  }

  while (rem > 0) {
    const dur = baseChoices.find((d) => WHOLE_TICKS / d <= rem);
    if (!dur) {
      throw new Error(`No se pudo descomponer residuo de compás: ${rem} ticks`);
    }
    beats.push({
      id: `${barPrefix}-bt${beatIdx++}`,
      duration: dur,
      dots: 0,
      isRest: true,
      notes: [],
    });
    rem -= WHOLE_TICKS / dur;
  }

  return beats;
}

function buildDrumBar(
  barIndex: number,
  style: Exclude<DrumBackingStyle, 'none'>
): ScoreBar {
  const barId = `drums-b-${barIndex + 1}`;
  const drumNote = (beatId: string, idx: number, gm: number): ScoreNote => ({
    id: `${beatId}-n${idx}`,
    stringIndex: 0,
    fret: 0,
    midi: gm,
    percussionArticulation: gm,
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
  });

  const beats: ScoreBeat[] = [];
  if (style === 'hihat') {
    for (let i = 0; i < 4; i++) {
      const id = `${barId}-bt${i + 1}`;
      beats.push({
        id,
        duration: 4,
        dots: 0,
        isRest: false,
        notes: [drumNote(id, 1, 42)],
      });
    }
  } else if (style === 'shuffle') {
    // 4 grupos de tresillo de corchea (12 × 320 = 3840 ticks exactos)
    const tup: TupletRatio = { enter: 3, in: 2 };
    for (let beat = 0; beat < 4; beat++) {
      const hits = beat % 2 === 0 ? [36, 51] : [38, 51];
      const b1 = `${barId}-bt${beat * 3 + 1}`;
      beats.push({
        id: b1,
        duration: 8,
        dots: 0,
        tuplet: tup,
        isRest: false,
        notes: hits.map((gm, ni) => drumNote(b1, ni + 1, gm)),
      });
      beats.push({
        id: `${barId}-bt${beat * 3 + 2}`,
        duration: 8,
        dots: 0,
        tuplet: tup,
        isRest: true,
        notes: [],
      });
      const b3 = `${barId}-bt${beat * 3 + 3}`;
      beats.push({
        id: b3,
        duration: 8,
        dots: 0,
        tuplet: tup,
        isRest: false,
        notes: [drumNote(b3, 1, 51)],
      });
    }
  } else if (style === 'ballad') {
    const pattern: readonly (readonly number[])[] = [
      [36, 42],
      [42],
      [42],
      [38, 42],
      [36, 42],
      [42],
      [38, 42],
      [42],
    ];
    pattern.forEach((gms, i) => {
      const id = `${barId}-bt${i + 1}`;
      beats.push({
        id,
        duration: 8,
        dots: 0,
        isRest: false,
        notes: gms.map((gm, ni) => drumNote(id, ni + 1, gm)),
      });
    });
  } else {
    // 'rock'
    const pattern: readonly (readonly number[])[] = [
      [36, 42],
      [42],
      [38, 42],
      [42],
      [36, 42],
      [42],
      [38, 42],
      [42],
    ];
    pattern.forEach((gms, i) => {
      const id = `${barId}-bt${i + 1}`;
      beats.push({
        id,
        duration: 8,
        dots: 0,
        isRest: false,
        notes: gms.map((gm, ni) => drumNote(id, ni + 1, gm)),
      });
    });
  }

  return {
    id: barId,
    voices: [{ id: `${barId}-v1`, beats }],
  };
}

function buildDroneTrack(
  barCount: number,
  root: PitchName,
  scale: ScaleDefinition
): ScoreTrack {
  const rootPc = pitchClassOf(root);
  const quality = findQuality(scale.droneQualityId) ?? findQuality('maj')!;
  const chordPitches = spellChord(root, quality);
  const bassMidi = 36 + rootPc; // C2..B2
  const padNotesMidi = chordPitches.map((p, idx) => 48 + pitchClassOf(p) + (idx > 0 && pitchClassOf(p) < rootPc ? 12 : 0));
  const allMidis = [bassMidi, ...padNotesMidi.slice(0, 3)];

  const bars: ScoreBar[] = [];
  for (let b = 0; b < barCount; b++) {
    const barId = `drone-b-${b + 1}`;
    const beatId = `${barId}-bt1`;
    bars.push({
      id: barId,
      voices: [
        {
          id: `${barId}-v1`,
          beats: [
            {
              id: beatId,
              duration: 1,
              dots: 0,
              isRest: false,
              dynamic: 'mp',
              notes: allMidis.map((midi, idx) => ({
                id: `${beatId}-n${idx + 1}`,
                stringIndex: 0,
                fret: 0,
                midi,
                tieDestination: false,
                hammerOrPull: false,
                bendPoints: [],
                vibrato: 'none',
                palmMute: false,
                letRing: true,
                deadNote: false,
                ghostNote: false,
                leftHandTapped: false,
                slap: false,
                pop: false,
                staccato: false,
                accent: 'none',
              })),
            },
          ],
        },
      ],
    });
  }

  return {
    id: 'track-drone',
    name: 'Acompañamiento Modal',
    shortName: 'Pad',
    family: 'keyboard',
    midiProgram: 89, // Pad 2 (warm)
    isPercussion: false,
    tuning: [],
    capo: 0,
    mix: { volume: 0.65, pan: 0, mute: false, solo: false },
    bars,
  };
}

/** Genera un `ScoreDocument` rítmicamente exacto (`PPQ = 960`) listo para Práctica o Edición. */
export function generateScaleExercise(options: ScaleExerciseOptions): ScoreDocument {
  const family: TrackFamily =
    options.instrumentFamily ??
    (options.tuning.length > 0 && spelledToMidi(options.tuning[0]!) <= 31 ? 'bass' : 'guitar');

  const fretted = computeScaleFingering({
    tuning: options.tuning,
    root: options.root,
    scale: options.scale,
    system: options.system,
    position: options.position,
    stringIndex: options.stringIndex,
    sweepStrings: options.sweepStrings,
  });

  let sequence = applyMelodicPattern(fretted, options.pattern);
  const rootAnchor = sequence.find((n) => n.role === 'root') ?? sequence[0];

  // Para tresillos, garantizar múltiplos completos de 3 notas antes de cerrar compás
  if (options.rhythm === 'triplet-eighth' && sequence.length > 0) {
    while (sequence.length % 3 !== 0 && rootAnchor) {
      sequence.push(rootAnchor);
    }
  }

  const rSpec = rhythmSpec(options.rhythm);
  const barTicks = ticksToNumberFloor(barCapacityTicks(4, 4)); // 3840 exacto
  const bars: ScoreBar[] = [];
  let seqIdx = 0;

  while (seqIdx < sequence.length || bars.length === 0) {
    const barNumber = bars.length + 1;
    const barPrefix = `t1-b-${barNumber}`;
    const beats: ScoreBeat[] = [];
    let used = 0;

    while (seqIdx < sequence.length && used + rSpec.ticks <= barTicks) {
      const noteData = sequence[seqIdx]!;
      const beatId = `${barPrefix}-bt${beats.length + 1}`;
      const isPalm = options.articulation === 'palm-mute';
      const beat: ScoreBeat = {
        id: beatId,
        duration: rSpec.duration,
        dots: rSpec.dots,
        ...(rSpec.tuplet ? { tuplet: rSpec.tuplet } : {}),
        isRest: false,
        ...(options.articulation === 'alternate'
          ? { pickStroke: seqIdx % 2 === 0 ? 'down' : 'up' }
          : {}),
        ...(isPalm ? { palmMute: true } : {}),
        notes: [makeNote(`${beatId}-n1`, noteData, isPalm)],
      };

      // Ligado automático en notas contiguas sobre la misma cuerda dentro del compás
      if (options.articulation === 'legato' && beats.length > 0) {
        const prevBeat = beats[beats.length - 1]!;
        const prevNote = prevBeat.notes[0];
        if (
          prevNote &&
          prevNote.stringIndex === noteData.stringIndex &&
          prevNote.fret !== noteData.fret
        ) {
          beats[beats.length - 1] = {
            ...prevBeat,
            notes: [{ ...prevNote, hammerOrPull: true }, ...prevBeat.notes.slice(1)],
          };
        }
      }

      beats.push(beat);
      used += rSpec.ticks;
      seqIdx++;
    }

    if (seqIdx >= sequence.length && used < barTicks) {
      const closingNote = used < barTicks && rootAnchor ? rootAnchor : undefined;
      beats.push(
        ...fillTrailingRestBeats(
          barTicks - used,
          barPrefix,
          beats.length + 1,
          closingNote,
          options.articulation === 'palm-mute'
        )
      );
    }

    bars.push({
      id: barPrefix,
      voices: [{ id: `${barPrefix}-v1`, beats }],
    });
  }

  const masterBars = bars.map((_, i) => ({
    id: `mb-${i + 1}`,
    timeSignature: { numerator: 4, denominator: 4 },
    tempoChanges: i === 0 ? [{ tickOffset: 0, bpm: options.bpm ?? 100 }] : [],
    keySignature: { fifths: 0, mode: 'major' as const },
    repeatStart: false,
    repeatEndCount: 0,
    alternateEndings: [] as readonly number[],
    ...(i === 0 ? { section: { text: options.scale.name } } : {}),
  }));

  const leadTrack: ScoreTrack = {
    id: 'track-1',
    name: family === 'bass' ? 'Bajo' : 'Guitarra',
    shortName: family === 'bass' ? 'Bajo' : 'Gtr',
    family,
    midiProgram: family === 'bass' ? 34 : 29, // Picked Bass / Overdriven Guitar
    isPercussion: false,
    tuning: options.tuning,
    capo: 0,
    mix: { volume: 1, pan: 0, mute: false, solo: false },
    bars,
  };

  const tracks: ScoreTrack[] = [leadTrack];

  const drumStyle = options.drumStyle;
  if (drumStyle && drumStyle !== 'none') {
    tracks.push({
      id: 'track-drums',
      name: 'Batería',
      shortName: 'Bat',
      family: 'drums',
      midiProgram: 0,
      isPercussion: true,
      tuning: [],
      capo: 0,
      mix: { volume: 0.78, pan: 0, mute: false, solo: false },
      bars: bars.map((_, bi) => buildDrumBar(bi, drumStyle)),
    });
  }

  if (options.modalDrone) {
    tracks.push(buildDroneTrack(bars.length, options.root, options.scale));
  }

  const baseRootMidi = rootAnchor?.midi ?? 48 + mod12(pitchClassOf(options.root));

  return {
    schemaVersion: 1,
    id: options.id ?? `scale-${options.scale.id}-${options.system}`,
    title: options.title ?? `${options.scale.name} (${options.root.letter}${options.root.accidental === -1 ? '♭' : options.root.accidental === 1 ? '♯' : ''})`,
    artist: 'Gimnasio Endurend',
    album: 'Fábrica / Práctica',
    subtitle: options.subtitle ?? `${options.scale.degreeLabels.join(' - ')}`,
    copyright: '',
    license: 'GPL-3.0-or-later',
    ...(options.difficulty ? { difficulty: options.difficulty } : {}),
    tags: options.tags ?? ['escala', 'fábrica', options.scale.category],
    origin: options.origin ?? { kind: 'factory', sourceId: options.scale.id, sourceName: 'Fábrica' },
    masterBars,
    tracks,
    scaleContext: {
      rootMidi: baseRootMidi,
      intervals: options.scale.intervals,
      degreeLabels: options.scale.degreeLabels,
      characteristicDegrees: options.scale.characteristicDegrees,
    },
  };
}

/** Construye 1 compás de progreso específico de arpegio (para estudio II–V–I). */
export function appendBarProgressionExercise(docs: readonly ScoreDocument[], title: string, id: string): ScoreDocument {
  const first = docs[0];
  if (!first) throw new Error('Se requiere al menos un documento');
  const mergedMasterBars = docs.flatMap((d) =>
    d.masterBars.map((mb, idx) => ({
      ...mb,
      id: `prog-mb-${Math.random().toString(36).slice(2, 7)}-${idx}`,
      tempoChanges: idx === 0 && d === first ? mb.tempoChanges : [],
    }))
  );
  const trackCount = first.tracks.length;
  const mergedTracks: ScoreTrack[] = [];
  for (let ti = 0; ti < trackCount; ti++) {
    const template = first.tracks[ti]!;
    mergedTracks.push({
      ...template,
      bars: docs.flatMap((d) => d.tracks[ti]?.bars ?? []),
    });
  }
  return {
    ...first,
    id,
    title,
    masterBars: mergedMasterBars.map((mb, idx) => ({ ...mb, id: `mb-${idx + 1}` })),
    tracks: mergedTracks,
  };
}

export { rational };
