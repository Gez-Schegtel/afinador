// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Command Bus reversible estricto para mutar `ScoreDocument` (Spec 013).
 * Todas las ediciones del Estudio pasan por comandos atómicos o por lotes (`BatchCommand`)
 * garantizando `undo(execute(doc))` idéntico al estado previo y `redo` exacto.
 */

import {
  cloneScoreDocument,
  computeNoteMidi,
  makeDefaultGuitarTuning,
  type BeatCrescendo,
  type BendPoint,
  type BrushType,
  type DynamicLevel,
  type GraceType,
  type KeySignature,
  type MasterBar,
  type PickStroke,
  type ScoreBar,
  type ScoreBeat,
  type ScoreDocument,
  type ScoreNote,
  type ScoreTrack,
  type StructuralDirection,
  type TimeSignature,
  type TrackFamily,
} from './model';
import { completeVoiceWithRests } from './rest-completion';
import type { BaseDuration, DotCount, TupletRatio } from './rhythm';
import { shiftNoteToAdjacentString } from './string-shift';
import type { SpelledNote } from '../music/spelling';

export interface ScoreCommand {
  readonly id: string;
  readonly label: string;
  execute(doc: ScoreDocument): ScoreDocument;
  undo(doc: ScoreDocument): ScoreDocument;
}

export interface CursorPosition {
  readonly trackIndex: number;
  readonly barIndex: number;
  readonly voiceIndex: number;
  readonly beatIndex: number;
  readonly stringIndex: number;
}

export interface BeatLocationRange {
  readonly trackIndex: number;
  readonly voiceIndex: number;
  readonly startBar: number;
  readonly startBeat: number;
  readonly endBar: number;
  readonly endBeat: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Envuelve cualquier transformación pura guardando un rollback exacto de una pista o documento. */
function makeTrackSliceCommand(
  label: string,
  trackIndex: number,
  mutator: (next: ScoreDocument, track: ScoreTrack) => void
): ScoreCommand {
  let prevTrack: ScoreTrack | null = null;
  let prevMasterBars: readonly MasterBar[] | null = null;

  return {
    id: uid('cmd'),
    label,
    execute(doc) {
      const targetTrack = doc.tracks[trackIndex];
      if (!targetTrack) return doc;
      prevTrack = structuredClone(targetTrack);
      prevMasterBars = structuredClone(doc.masterBars);
      const next = cloneScoreDocument(doc);
      mutator(next, next.tracks[trackIndex]!);
      return next;
    },
    undo(doc) {
      if (!prevTrack || !prevMasterBars) return doc;
      const next = cloneScoreDocument(doc) as unknown as {
        tracks: ScoreTrack[];
        masterBars: MasterBar[];
      };
      next.tracks[trackIndex] = structuredClone(prevTrack);
      next.masterBars = structuredClone(prevMasterBars) as MasterBar[];
      return next as unknown as ScoreDocument;
    },
  };
}

function makeFullDocCommand(
  label: string,
  mutator: (doc: ScoreDocument) => ScoreDocument
): ScoreCommand {
  let before: ScoreDocument | null = null;
  return {
    id: uid('cmd'),
    label,
    execute(doc) {
      before = cloneScoreDocument(doc);
      return mutator(cloneScoreDocument(doc));
    },
    undo(doc) {
      return before ? cloneScoreDocument(before) : doc;
    },
  };
}

function ensureVoice(bar: ScoreBar, voiceIndex: number, barId: string): {
  beats: ScoreBeat[];
} {
  const mutableVoices = bar.voices as { id: string; beats: ScoreBeat[] }[];
  while (mutableVoices.length <= voiceIndex) {
    mutableVoices.push({
      id: `${barId}-v${mutableVoices.length + 1}`,
      beats: [],
    });
  }
  return mutableVoices[voiceIndex]!;
}

export function createBatchCommand(
  label: string,
  commands: readonly ScoreCommand[]
): ScoreCommand {
  return {
    id: uid('batch'),
    label,
    execute(doc) {
      let cur = doc;
      for (const cmd of commands) {
        cur = cmd.execute(cur);
      }
      return cur;
    },
    undo(doc) {
      let cur = doc;
      for (let i = commands.length - 1; i >= 0; i--) {
        cur = commands[i]!.undo(cur);
      }
      return cur;
    },
  };
}

export function createSetNoteFretCommand(
  pos: CursorPosition,
  fretOrPercId: number
): ScoreCommand {
  const fixedNoteId = uid('note');
  return makeTrackSliceCommand(
    `Escribir traste ${fretOrPercId}`,
    pos.trackIndex,
    (_, track) => {
      const bar = track.bars[pos.barIndex];
      if (!bar) return;
      const voice = ensureVoice(bar, pos.voiceIndex, bar.id);
      const beat = voice.beats[pos.beatIndex] as {
        isRest: boolean;
        notes: ScoreNote[];
      } | undefined;
      if (!beat) return;

      beat.isRest = false;
      const existingIdx = beat.notes.findIndex(
        (n) => n.stringIndex === pos.stringIndex
      );
      const existing = existingIdx >= 0 ? beat.notes[existingIdx] : undefined;

      const midi = track.isPercussion
        ? Math.max(27, Math.min(87, Math.trunc(fretOrPercId)))
        : track.tuning.length > 0
          ? computeNoteMidi(
              track.tuning,
              track.capo,
              Math.max(0, Math.min(track.tuning.length - 1, pos.stringIndex)),
              Math.max(0, Math.trunc(fretOrPercId))
            )
          : Math.max(0, Math.min(127, Math.trunc(fretOrPercId)));

      const newNote: ScoreNote = {
        id: existing?.id ?? fixedNoteId,
        stringIndex: track.isPercussion ? 0 : pos.stringIndex,
        fret: track.isPercussion ? 0 : Math.max(0, Math.trunc(fretOrPercId)),
        midi,
        ...(track.isPercussion ? { percussionArticulation: Math.trunc(fretOrPercId) } : {}),
        tieDestination: existing?.tieDestination ?? false,
        hammerOrPull: existing?.hammerOrPull ?? false,
        ...(existing?.slideIn ? { slideIn: existing.slideIn } : {}),
        ...(existing?.slideOut ? { slideOut: existing.slideOut } : {}),
        bendPoints: existing?.bendPoints ?? [],
        vibrato: existing?.vibrato ?? 'none',
        palmMute: existing?.palmMute ?? false,
        letRing: existing?.letRing ?? false,
        deadNote: existing?.deadNote ?? false,
        ghostNote: existing?.ghostNote ?? false,
        ...(existing?.harmonic ? { harmonic: existing.harmonic } : {}),
        ...(existing?.harmonicValue !== undefined ? { harmonicValue: existing.harmonicValue } : {}),
        leftHandTapped: existing?.leftHandTapped ?? false,
        slap: existing?.slap ?? false,
        pop: existing?.pop ?? false,
        staccato: existing?.staccato ?? false,
        accent: existing?.accent ?? 'none',
        ...(existing?.tremoloPicking ? { tremoloPicking: existing.tremoloPicking } : {}),
        ...(existing?.trill ? { trill: existing.trill } : {}),
      };

      if (existingIdx >= 0) {
        beat.notes[existingIdx] = newNote;
      } else {
        beat.notes.push(newNote);
      }
    }
  );
}

export function createDeleteNoteOrBeatCommand(
  pos: CursorPosition,
  deleteEntireBeatIfEmpty = false
): ScoreCommand {
  return makeTrackSliceCommand('Borrar nota o pulso', pos.trackIndex, (_, track) => {
    const bar = track.bars[pos.barIndex];
    const voice = bar?.voices[pos.voiceIndex];
    if (!voice) return;
    const beat = voice.beats[pos.beatIndex] as { isRest: boolean; notes: ScoreNote[] } | undefined;
    if (!beat) return;

    const noteIdx = beat.notes.findIndex((n) => n.stringIndex === pos.stringIndex);
    if (noteIdx >= 0) {
      beat.notes.splice(noteIdx, 1);
      if (beat.notes.length === 0) {
        if (deleteEntireBeatIfEmpty && voice.beats.length > 1) {
          (voice.beats as ScoreBeat[]).splice(pos.beatIndex, 1);
        } else {
          beat.isRest = true;
        }
      }
    } else if (voice.beats.length > 1) {
      (voice.beats as ScoreBeat[]).splice(pos.beatIndex, 1);
    } else {
      beat.isRest = true;
      beat.notes = [];
    }
  });
}

export function createSetBeatDurationCommand(
  pos: CursorPosition,
  patch: {
    duration?: BaseDuration;
    dots?: DotCount;
    tuplet?: TupletRatio | null;
    isRest?: boolean;
  }
): ScoreCommand {
  return makeTrackSliceCommand('Cambiar duración', pos.trackIndex, (_, track) => {
    const beat = track.bars[pos.barIndex]?.voices[pos.voiceIndex]?.beats[pos.beatIndex] as {
      duration: BaseDuration;
      dots: DotCount;
      tuplet?: TupletRatio;
      isRest: boolean;
      notes: ScoreNote[];
    } | undefined;
    if (!beat) return;
    if (patch.duration !== undefined) beat.duration = patch.duration;
    if (patch.dots !== undefined) beat.dots = patch.dots;
    if (patch.tuplet === null) delete beat.tuplet;
    else if (patch.tuplet !== undefined) beat.tuplet = { ...patch.tuplet };
    if (patch.isRest !== undefined) {
      beat.isRest = patch.isRest;
      if (patch.isRest) beat.notes = [];
    }
  });
}

export function createInsertBeatCommand(
  pos: CursorPosition,
  duration: BaseDuration,
  dots: DotCount = 0,
  tuplet?: TupletRatio
): ScoreCommand {
  const fixedBeatId = uid('beat');
  return makeTrackSliceCommand('Insertar pulso', pos.trackIndex, (_, track) => {
    const bar = track.bars[pos.barIndex];
    if (!bar) return;
    const voice = ensureVoice(bar, pos.voiceIndex, bar.id);
    const insertIdx = Math.max(0, Math.min(voice.beats.length, pos.beatIndex));
    voice.beats.splice(insertIdx, 0, {
      id: fixedBeatId,
      duration,
      dots,
      ...(tuplet ? { tuplet: { ...tuplet } } : {}),
      isRest: true,
      notes: [],
    });
  });
}

export function createInsertOrAppendBarCommand(afterBarIndex?: number): ScoreCommand {
  const fixedSeed = uid('baradd');
  return makeFullDocCommand('Insertar compás', (next) => {
    const insertAt =
      afterBarIndex === undefined
        ? next.masterBars.length
        : Math.max(0, Math.min(next.masterBars.length, afterBarIndex + 1));
    const refMb =
      next.masterBars[Math.max(0, insertAt - 1)] ?? next.masterBars[0];
    const ts: TimeSignature = refMb ? { ...refMb.timeSignature } : { numerator: 4, denominator: 4 };
    const ks: KeySignature = refMb ? { ...refMb.keySignature } : { fifths: 0, mode: 'major' };

    (next.masterBars as MasterBar[]).splice(insertAt, 0, {
      id: `${fixedSeed}-mb`,
      timeSignature: ts,
      tempoChanges: [],
      keySignature: ks,
      repeatStart: false,
      repeatEndCount: 0,
      alternateEndings: [],
    });

    const defaultDur: BaseDuration = ts.denominator === 8 ? 8 : 4;
    next.tracks.forEach((track, ti) => {
      (track.bars as ScoreBar[]).splice(insertAt, 0, {
        id: `${fixedSeed}-t${ti}-bar`,
        voices: [
          {
            id: `${fixedSeed}-t${ti}-v1`,
            beats: [
              {
                id: `${fixedSeed}-t${ti}-beat`,
                duration: defaultDur,
                dots: 0,
                isRest: true,
                notes: [],
              },
            ],
          },
        ],
      });
    });
    return next;
  });
}

export function createDeleteBarCommand(barIndex: number): ScoreCommand {
  return makeFullDocCommand(`Eliminar compás ${barIndex + 1}`, (next) => {
    if (next.masterBars.length <= 1) return next;
    if (barIndex < 0 || barIndex >= next.masterBars.length) return next;
    (next.masterBars as MasterBar[]).splice(barIndex, 1);
    next.tracks.forEach((t) => {
      (t.bars as ScoreBar[]).splice(barIndex, 1);
    });
    return next;
  });
}

export function createCompleteBarRestsCommand(
  trackIndex: number,
  barIndex: number,
  voiceIndex = 0
): ScoreCommand {
  const fixedPrefix = uid('rest');
  return makeTrackSliceCommand(
    `Completar compás ${barIndex + 1} con silencios`,
    trackIndex,
    (next, track) => {
      const mb = next.masterBars[barIndex];
      const bar = track.bars[barIndex];
      const voice = bar?.voices[voiceIndex] as { beats: ScoreBeat[] } | undefined;
      if (!mb || !voice) return;
      voice.beats = completeVoiceWithRests(voice.beats, mb.timeSignature, fixedPrefix);
    }
  );
}

export function createShiftStringCommand(
  pos: CursorPosition,
  deltaString: -1 | 1,
  maxFret = 24
): ScoreCommand {
  return makeTrackSliceCommand('Mover nota entre cuerdas', pos.trackIndex, (_, track) => {
    const beat = track.bars[pos.barIndex]?.voices[pos.voiceIndex]?.beats[pos.beatIndex] as {
      notes: ScoreNote[];
    } | undefined;
    if (!beat) return;
    const noteIdx = beat.notes.findIndex((n) => n.stringIndex === pos.stringIndex);
    if (noteIdx < 0) return;
    const res = shiftNoteToAdjacentString(beat.notes[noteIdx]!, track, deltaString, maxFret);
    if (!res.ok) return;

    const collisionIdx = beat.notes.findIndex((n) => n.stringIndex === res.note.stringIndex);
    if (collisionIdx >= 0 && collisionIdx !== noteIdx) {
      beat.notes[collisionIdx] = res.note;
      beat.notes.splice(noteIdx, 1);
    } else {
      beat.notes[noteIdx] = res.note;
    }
  });
}

export type NoteTechniquePatch = Partial<
  Pick<
    ScoreNote,
    | 'tieDestination'
    | 'hammerOrPull'
    | 'slideIn'
    | 'slideOut'
    | 'bendPoints'
    | 'vibrato'
    | 'palmMute'
    | 'letRing'
    | 'deadNote'
    | 'ghostNote'
    | 'harmonic'
    | 'leftHandTapped'
    | 'slap'
    | 'pop'
    | 'staccato'
    | 'accent'
    | 'tremoloPicking'
    | 'trill'
  >
>;

export function createSetNoteTechniqueCommand(
  pos: CursorPosition,
  patch: NoteTechniquePatch
): ScoreCommand {
  return makeTrackSliceCommand('Aplicar técnica de nota', pos.trackIndex, (_, track) => {
    const beat = track.bars[pos.barIndex]?.voices[pos.voiceIndex]?.beats[pos.beatIndex] as {
      notes: ScoreNote[];
    } | undefined;
    if (!beat) return;
    const idx = beat.notes.findIndex((n) => n.stringIndex === pos.stringIndex);
    if (idx < 0) return;
    beat.notes[idx] = { ...beat.notes[idx]!, ...patch };
  });
}

export interface BeatPropsPatch {
  readonly pickStroke?: PickStroke;
  readonly brush?: BrushType;
  readonly dynamic?: DynamicLevel;
  readonly crescendo?: BeatCrescendo;
  readonly grace?: GraceType;
  readonly whammyBarPoints?: readonly BendPoint[];
  readonly chordSymbol?: string;
  readonly lyrics?: string;
}

export function createUpdateBeatPropsCommand(
  pos: CursorPosition,
  patch: BeatPropsPatch
): ScoreCommand {
  return makeTrackSliceCommand('Editar propiedades del pulso', pos.trackIndex, (_, track) => {
    const voice = track.bars[pos.barIndex]?.voices[pos.voiceIndex];
    const beat = voice?.beats[pos.beatIndex];
    if (!voice || !beat) return;
    (voice.beats as ScoreBeat[])[pos.beatIndex] = { ...beat, ...patch };
  });
}

export function createRangeTransformCommand(
  range: BeatLocationRange,
  label: string,
  fn: (beat: ScoreBeat, track: ScoreTrack, barIdx: number, beatIdx: number) => ScoreBeat | null
): ScoreCommand {
  const fixedSeed = uid('rng');
  return makeTrackSliceCommand(label, range.trackIndex, (_, track) => {
    for (let b = range.startBar; b <= range.endBar; b++) {
      const voice = track.bars[b]?.voices[range.voiceIndex] as { beats: ScoreBeat[] } | undefined;
      if (!voice) continue;
      const fromBeat = b === range.startBar ? range.startBeat : 0;
      const toBeat = b === range.endBar ? range.endBeat : voice.beats.length - 1;
      const rebuilt: ScoreBeat[] = [];
      voice.beats.forEach((beat, bi) => {
        if (bi < fromBeat || bi > toBeat) {
          rebuilt.push(beat);
          return;
        }
        const transformed = fn(beat, track, b, bi);
        if (transformed !== null) rebuilt.push(transformed);
      });
      voice.beats = rebuilt.length > 0
        ? rebuilt
        : [{ id: `${fixedSeed}-b${b}-rest`, duration: 4, dots: 0, isRest: true, notes: [] }];
    }
  });
}

export function createPasteBeatsCommand(
  pos: CursorPosition,
  copiedBeats: readonly ScoreBeat[]
): ScoreCommand {
  const fixedSeed = uid('paste');
  return makeTrackSliceCommand('Pegar pulsos', pos.trackIndex, (_, track) => {
    const bar = track.bars[pos.barIndex];
    if (!bar || copiedBeats.length === 0) return;
    const voice = ensureVoice(bar, pos.voiceIndex, bar.id);
    const cloned = copiedBeats.map((b, bi) => ({
      ...structuredClone(b),
      id: `${fixedSeed}-b${bi}`,
      notes: b.notes.map((n, ni) => ({ ...structuredClone(n), id: `${fixedSeed}-b${bi}-n${ni}` })),
    }));
    const insertIdx = Math.max(0, Math.min(voice.beats.length, pos.beatIndex));
    voice.beats.splice(insertIdx, cloned.length > 0 && voice.beats.length === 1 && voice.beats[0]?.isRest ? 1 : 0, ...cloned);
  });
}

export interface MasterBarPatch {
  readonly timeSignature?: TimeSignature;
  readonly bpm?: number;
  readonly keySignature?: KeySignature;
  readonly repeatStart?: boolean;
  readonly repeatEndCount?: number;
  readonly alternateEndings?: readonly number[];
  readonly sectionText?: string | null;
  readonly directions?: readonly StructuralDirection[];
}

export function createUpdateMasterBarCommand(
  barIndex: number,
  patch: MasterBarPatch
): ScoreCommand {
  return makeFullDocCommand(`Editar compás ${barIndex + 1}`, (next) => {
    const mb = next.masterBars[barIndex];
    if (!mb) return next;
    const updated: MasterBar = {
      ...mb,
      ...(patch.timeSignature ? { timeSignature: { ...patch.timeSignature } } : {}),
      ...(patch.bpm !== undefined
        ? { tempoChanges: [{ tickOffset: 0, bpm: Math.max(25, Math.min(350, Math.round(patch.bpm))) }] }
        : {}),
      ...(patch.keySignature ? { keySignature: { ...patch.keySignature } } : {}),
      ...(patch.repeatStart !== undefined ? { repeatStart: patch.repeatStart } : {}),
      ...(patch.repeatEndCount !== undefined
        ? { repeatEndCount: Math.max(0, Math.min(99, Math.trunc(patch.repeatEndCount))) }
        : {}),
      ...(patch.alternateEndings !== undefined
        ? { alternateEndings: [...patch.alternateEndings] }
        : {}),
      ...(patch.directions !== undefined ? { directions: [...patch.directions] } : {}),
      ...(patch.sectionText === null
        ? { section: undefined }
        : patch.sectionText !== undefined
          ? { section: { text: patch.sectionText } }
          : {}),
    };
    (next.masterBars as MasterBar[])[barIndex] = updated;
    return next;
  });
}

export function createUpdateMetadataCommand(
  patch: Partial<Pick<ScoreDocument, 'title' | 'artist' | 'album' | 'subtitle'>>
): ScoreCommand {
  return makeFullDocCommand('Editar metadatos', (next) => ({
    ...next,
    ...patch,
  }));
}

export function createAddTrackCommand(opts: {
  name: string;
  family: TrackFamily;
  tuning?: readonly SpelledNote[];
  midiProgram?: number;
  capo?: number;
}): ScoreCommand {
  const fixedSeed = uid('trk');
  return makeFullDocCommand(`Agregar pista ${opts.name}`, (next) => {
    const isPerc = opts.family === 'drums';
    const tuning = isPerc ? [] : [...(opts.tuning ?? makeDefaultGuitarTuning())];
    const bars: ScoreBar[] = next.masterBars.map((mb, i) => ({
      id: `${fixedSeed}-b${i}`,
      voices: [
        {
          id: `${fixedSeed}-b${i}-v1`,
          beats: [
            {
              id: `${fixedSeed}-b${i}-beat`,
              duration: mb.timeSignature.denominator === 8 ? 8 : 4,
              dots: 0,
              isRest: true,
              notes: [],
            },
          ],
        },
      ],
    }));

    (next.tracks as ScoreTrack[]).push({
      id: fixedSeed,
      name: opts.name,
      shortName: opts.name.slice(0, 4) || 'Trk',
      family: opts.family,
      midiProgram: opts.midiProgram ?? (isPerc ? 0 : opts.family === 'bass' ? 33 : 25),
      isPercussion: isPerc,
      tuning,
      capo: opts.capo ?? 0,
      mix: { volume: 1, pan: 0, mute: false, solo: false },
      bars,
    });
    return next;
  });
}

export function createDuplicateTrackCommand(trackIndex: number): ScoreCommand {
  const fixedTrackId = uid('trkcopy');
  return makeFullDocCommand('Duplicar pista', (next) => {
    const src = next.tracks[trackIndex];
    if (!src) return next;
    const copy = structuredClone(src) as ScoreTrack;
    const renamed: ScoreTrack = {
      ...copy,
      id: fixedTrackId,
      name: `${copy.name} (copia)`,
    };
    (next.tracks as ScoreTrack[]).splice(trackIndex + 1, 0, renamed);
    return next;
  });
}

export function createRemoveTrackCommand(trackIndex: number): ScoreCommand {
  return makeFullDocCommand('Eliminar pista', (next) => {
    if (next.tracks.length <= 1) return next;
    if (trackIndex < 0 || trackIndex >= next.tracks.length) return next;
    (next.tracks as ScoreTrack[]).splice(trackIndex, 1);
    return next;
  });
}

export function createReorderTrackCommand(
  fromIndex: number,
  toIndex: number
): ScoreCommand {
  return makeFullDocCommand('Reordenar pistas', (next) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= next.tracks.length ||
      toIndex >= next.tracks.length ||
      fromIndex === toIndex
    ) {
      return next;
    }
    const [item] = (next.tracks as ScoreTrack[]).splice(fromIndex, 1);
    (next.tracks as ScoreTrack[]).splice(toIndex, 0, item!);
    return next;
  });
}

export function createUpdateTrackConfigCommand(
  trackIndex: number,
  patch: Partial<Pick<ScoreTrack, 'name' | 'shortName' | 'family' | 'midiProgram' | 'isPercussion' | 'tuning' | 'capo'>>
): ScoreCommand {
  return makeTrackSliceCommand('Configurar pista', trackIndex, (next, track) => {
    const updated: ScoreTrack = {
      ...track,
      ...patch,
      tuning: patch.isPercussion ? [] : [...(patch.tuning ?? track.tuning)],
    };
    (next.tracks as ScoreTrack[])[trackIndex] = updated;
  });
}

export function createReplaceDocumentCommand(
  nextSnapshot: ScoreDocument,
  label = 'Restaurar revisión'
): ScoreCommand {
  return makeFullDocCommand(label, () => cloneScoreDocument(nextSnapshot));
}
