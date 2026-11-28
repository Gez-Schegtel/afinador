// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Paquete curado de fábrica: 16 ejercicios y estudios multipista determinísticos (< 5 KB
 * en definiciones declarativas) generados al vuelo sobre `ScoreDocument` (Spec 010 §2.1).
 */

import { findScale } from '../music/scales';
import { parsePitchName } from '../music/spelling';
import { findTuning } from '../music/tunings';
import { type ScoreDocument, type ScoreNote } from './model';
import {
  appendBarProgressionExercise,
  generateScaleExercise,
  type ScaleExerciseOptions,
} from './scale-generator';

export interface FactoryPresetMeta {
  readonly id: string;
  readonly summary: string;
}

function decorateBluesExpressive(doc: ScoreDocument): ScoreDocument {
  const tr = doc.tracks[0];
  if (!tr || !tr.bars[0]) return doc;
  const updatedBars = tr.bars.map((bar, bi) => {
    if (bi !== 0) return bar;
    return {
      ...bar,
      voices: bar.voices.map((v, vi) => {
        if (vi !== 0) return v;
        return {
          ...v,
          beats: v.beats.map((bt, idx) => {
            if (idx === 3 && bt.notes[0]) {
              const n: ScoreNote = {
                ...bt.notes[0],
                bendPoints: [
                  { offset: 0, value: 0 },
                  { offset: 50, value: 4 },
                  { offset: 100, value: 0 },
                ],
              };
              return { ...bt, notes: [n, ...bt.notes.slice(1)] };
            }
            if (idx === 5 && bt.notes[0]) {
              const n: ScoreNote = { ...bt.notes[0], slideOut: 'legato' };
              return { ...bt, notes: [n, ...bt.notes.slice(1)] };
            }
            return bt;
          }),
        };
      }),
    };
  });
  return {
    ...doc,
    tracks: [{ ...tr, bars: updatedBars }, ...doc.tracks.slice(1)],
  };
}

function buildChromaticWarmup(): ScoreDocument {
  const gtr = findTuning('guitar6-standard')!;
  const chrom = findScale('chromatic')!;
  const doc = generateScaleExercise({
    id: 'factory-01-chromatic',
    title: 'Calentamiento Cromático 1-2-3-4',
    subtitle: 'Púa alterna + Batería Rock',
    bpm: 90,
    tuning: gtr.notes,
    root: parsePitchName('E'),
    scale: chrom,
    system: 'single-string',
    stringIndex: 0,
    pattern: 'asc-desc',
    rhythm: 'eighth',
    articulation: 'alternate',
    drumStyle: 'rock',
    difficulty: 'beginner',
    tags: ['fábrica', 'calentamiento', 'púa alterna'],
  });
  // Acotar a 4 primeros trastes asc/desc para estudio 1-2-3-4 limpio
  return {
    ...doc,
    masterBars: doc.masterBars.slice(0, 2),
    tracks: doc.tracks.map((tr) => ({ ...tr, bars: tr.bars.slice(0, 2) })),
  };
}

function buildScalePreset(spec: {
  id: string;
  title: string;
  subtitle: string;
  tuningId?: string;
  scaleId: string;
  root: string;
  bpm: number;
  system: ScaleExerciseOptions['system'];
  position?: number;
  sweepStrings?: 3 | 4 | 5;
  pattern: ScaleExerciseOptions['pattern'];
  rhythm: ScaleExerciseOptions['rhythm'];
  articulation: ScaleExerciseOptions['articulation'];
  drumStyle: ScaleExerciseOptions['drumStyle'];
  modalDrone: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: readonly string[];
}): ScoreDocument {
  const tuning = findTuning(spec.tuningId ?? 'guitar6-standard')!;
  const scale = findScale(spec.scaleId)!;
  return generateScaleExercise({
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    bpm: spec.bpm,
    tuning: tuning.notes,
    instrumentFamily: tuning.instrument.startsWith('bass') ? 'bass' : 'guitar',
    root: parsePitchName(spec.root),
    scale,
    system: spec.system,
    position: spec.position ?? 1,
    sweepStrings: spec.sweepStrings,
    pattern: spec.pattern,
    rhythm: spec.rhythm,
    articulation: spec.articulation,
    drumStyle: spec.drumStyle,
    modalDrone: spec.modalDrone,
    difficulty: spec.difficulty,
    tags: ['fábrica', ...spec.tags],
  });
}

function buildIiViProgression(): ScoreDocument {
  const gtr = findTuning('guitar6-standard')!;
  const dm7 = generateScaleExercise({
    id: 'prog-dm7',
    title: 'Dm7',
    bpm: 100,
    tuning: gtr.notes,
    root: parsePitchName('D'),
    scale: findScale('arp-m7')!,
    system: 'caged',
    position: 2,
    pattern: 'asc',
    rhythm: 'eighth',
    articulation: 'alternate',
    drumStyle: 'shuffle',
    modalDrone: true,
  });
  const g7 = generateScaleExercise({
    id: 'prog-g7',
    title: 'G7',
    bpm: 100,
    tuning: gtr.notes,
    root: parsePitchName('G'),
    scale: findScale('arp-7')!,
    system: 'caged',
    position: 2,
    pattern: 'asc',
    rhythm: 'eighth',
    articulation: 'alternate',
    drumStyle: 'shuffle',
    modalDrone: true,
  });
  const cmaj7 = generateScaleExercise({
    id: 'prog-cmaj7',
    title: 'Cmaj7',
    bpm: 100,
    tuning: gtr.notes,
    root: parsePitchName('C'),
    scale: findScale('arp-maj7')!,
    system: 'caged',
    position: 2,
    pattern: 'asc',
    rhythm: 'eighth',
    articulation: 'alternate',
    drumStyle: 'shuffle',
    modalDrone: true,
  });

  const combined = appendBarProgressionExercise(
    [
      { ...dm7, masterBars: dm7.masterBars.slice(0, 1), tracks: dm7.tracks.map((t) => ({ ...t, bars: t.bars.slice(0, 1) })) },
      { ...g7, masterBars: g7.masterBars.slice(0, 1), tracks: g7.tracks.map((t) => ({ ...t, bars: t.bars.slice(0, 1) })) },
      { ...cmaj7, masterBars: cmaj7.masterBars.slice(0, 1), tracks: cmaj7.tracks.map((t) => ({ ...t, bars: t.bars.slice(0, 1) })) },
    ],
    'Progresión II–V–I (Dm7 → G7 → Cmaj7)',
    'factory-15-ii-v-i'
  );
  return {
    ...combined,
    subtitle: 'Arpegios de cuatríada · Swing / Shuffle',
    difficulty: 'intermediate',
    tags: ['fábrica', 'arpegios', 'ii-v-i', 'jazz'],
    origin: { kind: 'factory', sourceId: 'ii-v-i', sourceName: 'Fábrica' },
  };
}

let cachedExamples: readonly ScoreDocument[] | null = null;

/** Devuelve los 16 ejercicios curados de fábrica (memorizados en memoria). */
export function getFactoryExamples(): readonly ScoreDocument[] {
  if (cachedExamples) return cachedExamples;

  cachedExamples = [
    buildChromaticWarmup(),
    buildScalePreset({
      id: 'factory-02-penta-am',
      title: 'Pentatónica Menor de La (Caja 1)',
      subtitle: 'Backing Rock 4/4',
      scaleId: 'pentatonic-minor',
      root: 'A',
      bpm: 100,
      system: 'caged',
      position: 1,
      pattern: 'asc-desc',
      rhythm: 'eighth',
      articulation: 'alternate',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'beginner',
      tags: ['pentatónica', 'rock'],
    }),
    decorateBluesExpressive(
      buildScalePreset({
        id: 'factory-03-blues-em',
        title: 'Escala de Blues de Mi Menor',
        subtitle: 'Con Bends y Slides',
        scaleId: 'blues-minor',
        root: 'E',
        bpm: 95,
        system: 'caged',
        position: 1,
        pattern: 'asc-desc',
        rhythm: 'eighth',
        articulation: 'legato',
        drumStyle: 'rock',
        modalDrone: true,
        difficulty: 'beginner',
        tags: ['blues', 'bends', 'slides'],
      })
    ),
    buildScalePreset({
      id: 'factory-04-ionian-c',
      title: 'Modo Jónico (Do Mayor) — 3NPS',
      subtitle: '3 Notas por Cuerda',
      scaleId: 'ionian',
      root: 'C',
      bpm: 110,
      system: '3nps',
      position: 1,
      pattern: 'asc-desc',
      rhythm: 'eighth',
      articulation: 'alternate',
      drumStyle: 'hihat',
      modalDrone: false,
      difficulty: 'beginner',
      tags: ['modos', 'jónico', '3nps'],
    }),
    buildScalePreset({
      id: 'factory-05-dorian-d',
      title: 'Modo Dórico en Re (Grupos de 3 + Vamp Dm7)',
      subtitle: '6ª mayor característica',
      scaleId: 'dorian',
      root: 'D',
      bpm: 105,
      system: 'caged',
      position: 1,
      pattern: 'groups-3',
      rhythm: 'triplet-eighth',
      articulation: 'legato',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['modos', 'dórico'],
    }),
    buildScalePreset({
      id: 'factory-06-phrygian-e',
      title: 'Modo Frigio en Mi (Terceras + Drone Em)',
      subtitle: '2ª menor característica',
      scaleId: 'phrygian',
      root: 'E',
      bpm: 110,
      system: 'caged',
      position: 1,
      pattern: 'thirds',
      rhythm: 'eighth',
      articulation: 'palm-mute',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['modos', 'frigio'],
    }),
    buildScalePreset({
      id: 'factory-07-lydian-f',
      title: 'Modo Lidio en Fa (+ Drone Fmaj7♯11)',
      subtitle: '4ª aumentada (♯4) característica',
      scaleId: 'lydian',
      root: 'F',
      bpm: 100,
      system: 'two-octaves',
      position: 1,
      pattern: 'asc-desc',
      rhythm: 'eighth',
      articulation: 'legato',
      drumStyle: 'ballad',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['modos', 'lidio'],
    }),
    buildScalePreset({
      id: 'factory-08-mixolydian-g',
      title: 'Modo Mixolidio en Sol (Grupos de 4 + Vamp G7)',
      subtitle: '7ª menor característica',
      scaleId: 'mixolydian',
      root: 'G',
      bpm: 115,
      system: '3nps',
      position: 1,
      pattern: 'groups-4',
      rhythm: 'sixteenth',
      articulation: 'alternate',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['modos', 'mixolidio', 'stoner'],
    }),
    buildScalePreset({
      id: 'factory-09-aeolian-am',
      title: 'Modo Eólico en La Menor (Legato 3NPS)',
      subtitle: '6ª menor característica',
      scaleId: 'aeolian',
      root: 'A',
      bpm: 120,
      system: '3nps',
      position: 1,
      pattern: 'asc-desc',
      rhythm: 'triplet-eighth',
      articulation: 'legato',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['modos', 'eólico', 'legato'],
    }),
    buildScalePreset({
      id: 'factory-10-locrian-b',
      title: 'Modo Locrio en Si (+ Drone Bm7♭5)',
      subtitle: '♭2 y ♭5 características',
      scaleId: 'locrian',
      root: 'B',
      bpm: 95,
      system: 'caged',
      position: 2,
      pattern: 'asc-desc',
      rhythm: 'eighth',
      articulation: 'alternate',
      drumStyle: 'hihat',
      modalDrone: true,
      difficulty: 'advanced',
      tags: ['modos', 'locrio'],
    }),
    buildScalePreset({
      id: 'factory-11-harmonic-minor-am',
      title: 'Menor Armónica en La (Pedal Tone Neoclásico)',
      subtitle: 'Nota pivote + 7ª mayor',
      scaleId: 'harmonic-minor',
      root: 'A',
      bpm: 125,
      system: '3nps',
      position: 1,
      pattern: 'pedal-tone',
      rhythm: 'sixteenth',
      articulation: 'alternate',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'advanced',
      tags: ['menor armónica', 'neoclásico', 'pedal tone'],
    }),
    buildScalePreset({
      id: 'factory-12-phrygian-dominant-e',
      title: 'Frigio Dominante en Mi (Estudio Flamenco / Metal)',
      subtitle: '5º modo menor armónica (V7♭9)',
      scaleId: 'phrygian-dominant',
      root: 'E',
      bpm: 115,
      system: 'caged',
      position: 1,
      pattern: 'asc-desc',
      rhythm: 'sixteenth',
      articulation: 'palm-mute',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['frigio dominante', 'metal'],
    }),
    buildScalePreset({
      id: 'factory-13-melodic-minor-c',
      title: 'Menor Melódica en Do (Estudio Jazz Corcheas)',
      subtitle: '6ª y 7ª mayores ascendentes',
      scaleId: 'melodic-minor',
      root: 'C',
      bpm: 110,
      system: 'two-octaves',
      position: 2,
      pattern: 'thirds',
      rhythm: 'eighth',
      articulation: 'alternate',
      drumStyle: 'shuffle',
      modalDrone: true,
      difficulty: 'advanced',
      tags: ['menor melódica', 'jazz'],
    }),
    buildScalePreset({
      id: 'factory-14-sweep-triads',
      title: 'Arpegios de Tríada Menor (Sweep Picking)',
      subtitle: 'Ciclo cerrado en 5 cuerdas',
      scaleId: 'arp-min',
      root: 'A',
      bpm: 100,
      system: 'sweep',
      sweepStrings: 5,
      position: 1,
      pattern: 'sweep',
      rhythm: 'triplet-eighth',
      articulation: 'legato',
      drumStyle: 'hihat',
      modalDrone: false,
      difficulty: 'advanced',
      tags: ['arpegios', 'sweep picking'],
    }),
    buildIiViProgression(),
    buildScalePreset({
      id: 'factory-16-bass-dorian',
      title: 'Groove Dórico y Arpegios en Bajo de 4 Cuerdas',
      subtitle: 'Bajo 4 cuerdas estándar (E1 A1 D2 G2)',
      tuningId: 'bass4-standard',
      scaleId: 'dorian',
      root: 'E',
      bpm: 100,
      system: 'two-octaves',
      position: 1,
      pattern: 'asc-desc',
      rhythm: 'eighth',
      articulation: 'alternate',
      drumStyle: 'rock',
      modalDrone: true,
      difficulty: 'intermediate',
      tags: ['bajo', 'dórico', 'groove'],
    }),
  ];

  return cachedExamples;
}
