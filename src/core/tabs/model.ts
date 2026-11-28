// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Modelo canónico de partitura y tablatura multipista (Spec 008). Núcleo 100% puro.
 *
 * Convención unificada con `tunings.ts` y `voicings.ts`:
 * - `tuning` se ordena de la cuerda más grave (`stringIndex = 0`) a la más aguda (`N - 1`).
 * - Las duraciones usan `BaseDuration`, `DotCount` y `TupletRatio` validados en `PPQ = 960`.
 */

import { parseSpelledNote, spelledToMidi, type SpelledNote } from '../music/spelling';
import {
  barCapacityTicks,
  beatDurationTicks,
  rational,
  validateVoiceRhythm,
  type BarValidationResult,
  type BaseDuration,
  type DotCount,
  type RationalTicks,
  type TimeSignatureLike,
  type TupletRatio,
} from './rhythm';

export type TrackFamily = 'guitar' | 'bass' | 'drums' | 'keyboard' | 'other';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type ScoreOriginKind = 'factory' | 'byot' | 'catalog' | 'studio';

export interface ScoreOrigin {
  readonly kind: ScoreOriginKind;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly importedAt?: string;
}

export interface TimeSignature extends TimeSignatureLike {
  readonly numerator: number;
  readonly denominator: number;
}

export interface TempoChange {
  /** Posición dentro del compás en ticks desde el inicio (0 = comienzo del compás). */
  readonly tickOffset: number;
  readonly bpm: number;
  readonly label?: string;
}

export interface KeySignature {
  /** Cantidad de alteraciones en el círculo de quintas (-7 = 7 bemoles .. +7 = 7 sostenidos). */
  readonly fifths: number;
  readonly mode: 'major' | 'minor';
}

export interface SectionMarker {
  readonly text: string;
  readonly marker?: string;
}

export type StructuralDirection = 'dc' | 'ds' | 'segno' | 'coda' | 'fine';

export interface MasterBar {
  readonly id: string;
  readonly timeSignature: TimeSignature;
  readonly tempoChanges: readonly TempoChange[];
  readonly keySignature: KeySignature;
  readonly repeatStart: boolean;
  /** Cantidad total de pasadas al cerrar repetición (0 = sin barra de repetición final). */
  readonly repeatEndCount: number;
  /** Casillas activas en este compás (ej. `[1]` o `[1, 2]`). */
  readonly alternateEndings: readonly number[];
  readonly section?: SectionMarker;
  readonly isDoubleBar?: boolean;
  readonly directions?: readonly StructuralDirection[];
  readonly fermata?: boolean;
  readonly trackSwitchCue?: string;
}

export type HarmonicType = 'natural' | 'artificial' | 'pinch' | 'tap' | 'semi';
export type SlideInType = 'intoFromBelow' | 'intoFromAbove';
export type SlideOutType = 'shift' | 'legato' | 'outUp' | 'outDown';
export type VibratoType = 'none' | 'slight' | 'wide';
export type BrushType = 'none' | 'brushUp' | 'brushDown' | 'arpeggioUp' | 'arpeggioDown';
export type PickStroke = 'none' | 'up' | 'down';
export type DynamicLevel = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';
export type GraceType = 'none' | 'onBeat' | 'beforeBeat';
export type AccentType = 'none' | 'normal' | 'heavy';
export type BeatCrescendo = 'none' | 'crescendo' | 'decrescendo';

export interface BendPoint {
  /** Posición porcentual dentro de la duración de la nota (0..100). */
  readonly offset: number;
  /** Desplazamiento en cuartos de tono (2 = medio tono, 4 = tono completo). */
  readonly value: number;
}

export interface ScoreNote {
  readonly id: string;
  /** Índice de cuerda: 0 = la más grave, `tuning.length - 1` = la más aguda. En batería es 0. */
  readonly stringIndex: number;
  readonly fret: number;
  /** Altura MIDI real (para batería representa el instrumento GM o nota de percusión). */
  readonly midi: number;
  readonly percussionArticulation?: number;
  readonly tieDestination: boolean;
  readonly hammerOrPull: boolean;
  readonly slideIn?: SlideInType;
  readonly slideOut?: SlideOutType;
  readonly bendPoints: readonly BendPoint[];
  readonly vibrato: VibratoType;
  readonly palmMute: boolean;
  readonly letRing: boolean;
  readonly deadNote: boolean;
  readonly ghostNote: boolean;
  readonly harmonic?: HarmonicType;
  readonly harmonicValue?: number;
  readonly leftHandTapped: boolean;
  readonly slap: boolean;
  readonly pop: boolean;
  readonly staccato: boolean;
  readonly accent: AccentType;
  readonly tremoloPicking?: BaseDuration;
  readonly trill?: { readonly fret: number; readonly duration: BaseDuration };
  readonly leftHandFinger?: number;
  readonly rightHandFinger?: number;
}

export interface ScoreBeat {
  readonly id: string;
  readonly duration: BaseDuration;
  readonly dots: DotCount;
  readonly tuplet?: TupletRatio;
  readonly isRest: boolean;
  readonly chordSymbol?: string;
  readonly lyrics?: string;
  readonly pickStroke?: PickStroke;
  readonly brush?: BrushType;
  readonly dynamic?: DynamicLevel;
  readonly crescendo?: BeatCrescendo;
  readonly grace?: GraceType;
  readonly vibrato?: VibratoType;
  readonly whammyBarPoints?: readonly BendPoint[];
  readonly palmMute?: boolean;
  readonly letRing?: boolean;
  readonly slap?: boolean;
  readonly pop?: boolean;
  readonly tap?: boolean;
  readonly notes: readonly ScoreNote[];
}

export interface ScoreVoice {
  readonly id: string;
  readonly beats: readonly ScoreBeat[];
}

export interface ScoreBar {
  readonly id: string;
  readonly voices: readonly ScoreVoice[];
}

export interface TrackMix {
  readonly volume: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly solo: boolean;
}

export interface ScoreTrack {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly family: TrackFamily;
  readonly midiProgram: number;
  readonly isPercussion: boolean;
  /** Cuerdas ordenadas de la más grave (`index 0`) a la más aguda. Vacío en batería. */
  readonly tuning: readonly SpelledNote[];
  readonly capo: number;
  readonly mix: TrackMix;
  readonly bars: readonly ScoreBar[];
}

export interface ScaleContext {
  readonly rootMidi: number;
  readonly intervals: readonly number[];
  readonly degreeLabels: readonly string[];
  readonly characteristicDegrees: readonly string[];
}

export interface ScoreDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly subtitle: string;
  readonly copyright: string;
  readonly license: string;
  readonly difficulty?: DifficultyLevel;
  readonly tags: readonly string[];
  readonly origin: ScoreOrigin;
  readonly masterBars: readonly MasterBar[];
  readonly tracks: readonly ScoreTrack[];
  readonly scaleContext?: ScaleContext;
}

/** Calcula el MIDI real de una nota pisada considerando afinación y cejilla (capo). */
export function computeNoteMidi(
  tuning: readonly SpelledNote[],
  capo: number,
  stringIndex: number,
  fret: number
): number {
  const openNote = tuning[stringIndex];
  if (!openNote) {
    throw new Error(`Índice de cuerda fuera de rango: ${stringIndex}`);
  }
  return spelledToMidi(openNote) + capo + fret;
}

export function makeDefaultGuitarTuning(): readonly SpelledNote[] {
  return ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(parseSpelledNote);
}

export interface CreateEmptyScoreOptions {
  readonly id?: string;
  readonly title?: string;
  readonly artist?: string;
  readonly bpm?: number;
  readonly timeSignature?: TimeSignature;
  readonly barCount?: number;
  readonly trackName?: string;
  readonly family?: TrackFamily;
  readonly tuning?: readonly SpelledNote[];
  readonly capo?: number;
  readonly origin?: ScoreOrigin;
}

/** Construye una partitura canónica vacía válida para estudio o pruebas. */
export function createEmptyScoreDocument(
  options: CreateEmptyScoreOptions = {}
): ScoreDocument {
  const id = options.id ?? 'score-untitled';
  const bpm = options.bpm ?? 100;
  const ts: TimeSignature = options.timeSignature ?? { numerator: 4, denominator: 4 };
  const barCount = Math.max(1, options.barCount ?? 1);
  const tuning = options.tuning ?? makeDefaultGuitarTuning();
  const isPercussion = options.family === 'drums';

  const masterBars: MasterBar[] = [];
  const bars: ScoreBar[] = [];

  for (let i = 0; i < barCount; i++) {
    masterBars.push({
      id: `mb-${i + 1}`,
      timeSignature: { ...ts },
      tempoChanges: i === 0 ? [{ tickOffset: 0, bpm }] : [],
      keySignature: { fifths: 0, mode: 'major' },
      repeatStart: false,
      repeatEndCount: 0,
      alternateEndings: [],
    });
    bars.push({
      id: `t1-b-${i + 1}`,
      voices: [
        {
          id: `t1-b-${i + 1}-v1`,
          beats: [
            {
              id: `t1-b-${i + 1}-v1-beat1`,
              duration: ts.denominator === 8 ? 8 : 4,
              dots: 0,
              isRest: true,
              notes: [],
            },
          ],
        },
      ],
    });
  }

  return {
    schemaVersion: 1,
    id,
    title: options.title ?? 'Sin título',
    artist: options.artist ?? '',
    album: '',
    subtitle: '',
    copyright: '',
    license: 'GPL-3.0-or-later',
    tags: [],
    origin: options.origin ?? { kind: 'studio' },
    masterBars,
    tracks: [
      {
        id: 'track-1',
        name: options.trackName ?? 'Guitarra',
        shortName: 'Gtr',
        family: options.family ?? 'guitar',
        midiProgram: 25,
        isPercussion,
        tuning: isPercussion ? [] : tuning,
        capo: options.capo ?? 0,
        mix: { volume: 1, pan: 0, mute: false, solo: false },
        bars,
      },
    ],
  };
}

/** Copia profunda inmutable del documento para transacciones y edición segura. */
export function cloneScoreDocument(doc: ScoreDocument): ScoreDocument {
  return structuredClone(doc);
}

export interface DocumentValidationIssue {
  readonly trackIndex: number;
  readonly barIndex: number;
  readonly voiceIndex: number;
  readonly result: BarValidationResult;
}

export interface DocumentValidationReport {
  readonly valid: boolean;
  readonly barCountMatches: boolean;
  readonly totalDurationTicks: RationalTicks;
  readonly issues: readonly DocumentValidationIssue[];
}

/** Valida que todas las pistas tengan la misma cantidad de compases y cierren su métrica en PPQ = 960. */
export function validateScoreDocument(doc: ScoreDocument): DocumentValidationReport {
  const issues: DocumentValidationIssue[] = [];
  let barCountMatches = true;
  let totalDurationTicks = rational(0, 1);

  for (const mb of doc.masterBars) {
    const cap = barCapacityTicks(mb.timeSignature.numerator, mb.timeSignature.denominator);
    totalDurationTicks = rational(
      totalDurationTicks.num * cap.den + cap.num * totalDurationTicks.den,
      totalDurationTicks.den * cap.den
    );
  }

  doc.tracks.forEach((track, trackIndex) => {
    if (track.bars.length !== doc.masterBars.length) {
      barCountMatches = false;
    }
    track.bars.forEach((bar, barIndex) => {
      const mb = doc.masterBars[barIndex];
      if (!mb) return;
      bar.voices.forEach((voice, voiceIndex) => {
        // La Voz 2 vacía es opcional; solo se valida si contiene algún pulso.
        if (voiceIndex > 0 && voice.beats.length === 0) return;
        const result = validateVoiceRhythm(voice.beats, mb.timeSignature);
        if (result.status !== 'complete') {
          issues.push({ trackIndex, barIndex, voiceIndex, result });
        }
      });
    });
  });

  return {
    valid: barCountMatches && issues.length === 0,
    barCountMatches,
    totalDurationTicks,
    issues,
  };
}

/** Calcula la duración exacta de un `ScoreBeat`. */
export function scoreBeatTicks(beat: ScoreBeat): RationalTicks {
  return beat.grace && beat.grace !== 'none'
    ? rational(0, 1)
    : beatDurationTicks(beat.duration, beat.dots, beat.tuplet);
}
