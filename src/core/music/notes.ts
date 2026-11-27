import {
  defaultSharpSpelling,
  formatPitchName,
  formatSpelledNote,
  latinPitchName,
  mod12,
  pitchClassOf,
  spellMidi,
  type Accidental,
  type PitchName,
} from './spelling';

export const MIN_A4_HZ = 415;
export const MAX_A4_HZ = 466;
export const DEFAULT_A4_HZ = 440;
export const QUICK_A4_PRESETS = [430, 432, 440, 442, 444] as const;

export const TARGET_NOTE_MIN_MIDI = 21; // A0
export const TARGET_NOTE_MAX_MIDI = 83; // B5

/**
 * Ventana de entrada al estado AFINADO (±2.5 cents, estándar en pedales Boss TU-3 / Korg).
 */
export const IN_TUNE_TOLERANCE_CENTS = 2.5;

/**
 * Histéresis de salida (Schmitt trigger): una vez que engancha AFINADO en ±2.5 cents,
 * se mantiene clavado en verde mientras no se desvíe más allá de ±4.0 cents.
 */
export const IN_TUNE_EXIT_HYSTERESIS_CENTS = 4.0;

/**
 * Histéresis para cambio de nota cromática (±56 cents) para evitar que el nombre de la nota
 * parpadee cuando una cuerda está justo a mitad de camino entre dos semitonos.
 */
export const NOTE_SWITCH_HYSTERESIS_SEMITONES = 0.56;

export const NEAR_TUNE_TOLERANCE_CENTS = 6.0;

interface ChromaticPitchClass {
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  isSharp: boolean;
  displayName: string;
  latinName: string;
}

const CHROMATIC_SCALE: readonly ChromaticPitchClass[] = [
  { letter: 'C', isSharp: false, displayName: 'C', latinName: 'Do' },
  { letter: 'C', isSharp: true, displayName: 'C♯', latinName: 'Do♯' },
  { letter: 'D', isSharp: false, displayName: 'D', latinName: 'Re' },
  { letter: 'D', isSharp: true, displayName: 'D♯', latinName: 'Re♯' },
  { letter: 'E', isSharp: false, displayName: 'E', latinName: 'Mi' },
  { letter: 'F', isSharp: false, displayName: 'F', latinName: 'Fa' },
  { letter: 'F', isSharp: true, displayName: 'F♯', latinName: 'Fa♯' },
  { letter: 'G', isSharp: false, displayName: 'G', latinName: 'Sol' },
  { letter: 'G', isSharp: true, displayName: 'G♯', latinName: 'Sol♯' },
  { letter: 'A', isSharp: false, displayName: 'A', latinName: 'La' },
  { letter: 'A', isSharp: true, displayName: 'A♯', latinName: 'La♯' },
  { letter: 'B', isSharp: false, displayName: 'B', latinName: 'Si' },
] as const;

export interface ChromaticNoteOption {
  noteIndex: number;
  displayName: string;
  latinName: string;
}

export const CHROMATIC_NOTE_OPTIONS: readonly ChromaticNoteOption[] =
  CHROMATIC_SCALE.map((spec, idx) => ({
    noteIndex: idx,
    displayName: spec.displayName,
    latinName: spec.latinName,
  }));

export interface OctaveOption {
  octave: number;
  label: string;
}

export const OCTAVE_OPTIONS: readonly OctaveOption[] = [
  { octave: 0, label: '0 — Subgrave' },
  { octave: 1, label: '1 — Bajo' },
  { octave: 2, label: '2 — Grave' },
  { octave: 3, label: '3 — Media' },
  { octave: 4, label: '4 — Aguda' },
  { octave: 5, label: '5 — Sobreaguda' },
] as const;

export type TuningDirection = 'flat' | 'in-tune' | 'sharp';

export interface NoteDescriptor {
  midi: number;
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  /** Alteración escrita (−2..+2). En modo Automático siempre 0 o +1 (sostenidos). */
  accidental: Accidental;
  isSharp: boolean;
  name: string;
  latinName: string;
  octave: number;
  fullName: string;
  frequency: number;
}

export interface ChromaticMatch {
  detectedHz: number;
  targetHz: number;
  cents: number;
  clampedCents: number;
  direction: TuningDirection;
  isNearCenter: boolean;
  note: NoteDescriptor;
}

export interface HysteresisContext {
  previousMidi: number | null;
  previousDirection: TuningDirection | null;
}

export function clampA4(hz: number): number {
  if (!Number.isFinite(hz)) return DEFAULT_A4_HZ;
  const clamped = Math.min(MAX_A4_HZ, Math.max(MIN_A4_HZ, hz));
  return Math.round(clamped * 10) / 10;
}

export function clampTargetMidi(midi: number): number {
  if (!Number.isFinite(midi)) return 40;
  return Math.min(
    TARGET_NOTE_MAX_MIDI,
    Math.max(TARGET_NOTE_MIN_MIDI, Math.round(midi))
  );
}

export function midiFromNoteAndOctave(
  noteIndex: number,
  octave: number
): number {
  const safeNote = ((Math.round(noteIndex) % 12) + 12) % 12;
  return clampTargetMidi((Math.round(octave) + 1) * 12 + safeNote);
}

export function midiToFrequency(
  midi: number,
  a4Hz: number = DEFAULT_A4_HZ
): number {
  return a4Hz * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidiFloat(
  freq: number,
  a4Hz: number = DEFAULT_A4_HZ
): number {
  return 69 + 12 * Math.log2(freq / a4Hz);
}

export function centsBetween(detectedHz: number, targetHz: number): number {
  return 1200 * Math.log2(detectedHz / targetHz);
}

/**
 * Describe una nota MIDI. Si se pasa `spelling` y su clase de altura coincide, se usa esa
 * ortografía (p. ej. E♭2 en una afinación bajada); si no, se escriben sostenidos.
 */
export function describeMidiNote(
  midi: number,
  a4Hz: number = DEFAULT_A4_HZ,
  spelling: PitchName | null = null
): NoteDescriptor {
  const roundedMidi = Math.round(midi);
  const spelled =
    spelling && pitchClassOf(spelling) === mod12(roundedMidi)
      ? spellMidi(roundedMidi, spelling)
      : defaultSharpSpelling(roundedMidi);

  return {
    midi: roundedMidi,
    letter: spelled.letter,
    accidental: spelled.accidental,
    isSharp: spelled.accidental > 0,
    name: formatPitchName(spelled),
    latinName: latinPitchName(spelled),
    octave: spelled.octave,
    fullName: formatSpelledNote(spelled),
    frequency: midiToFrequency(roundedMidi, a4Hz),
  };
}

/**
 * Resuelve la nota cromática aplicando histéresis de pedal (Schmitt trigger) en modo
 * Automático o evaluando directamente respecto a `forcedMidi` en modo Manual (con la
 * ortografía opcional `forcedSpelling`, p. ej. la de la cuerda de una afinación).
 */
export function resolveChromaticNote(
  detectedHz: number,
  a4Hz: number = DEFAULT_A4_HZ,
  hysteresis?: HysteresisContext,
  forcedMidi: number | null = null,
  forcedSpelling: PitchName | null = null
): ChromaticMatch {
  const calibratedA4 = clampA4(a4Hz);
  const midiFloat = frequencyToMidiFloat(detectedHz, calibratedA4);

  let targetMidi: number;
  if (forcedMidi !== null && forcedMidi !== undefined) {
    targetMidi = Math.round(forcedMidi);
  } else {
    targetMidi = Math.round(midiFloat);
    if (
      hysteresis?.previousMidi !== null &&
      hysteresis?.previousMidi !== undefined &&
      Math.abs(midiFloat - hysteresis.previousMidi) <=
        NOTE_SWITCH_HYSTERESIS_SEMITONES
    ) {
      targetMidi = hysteresis.previousMidi;
    }
  }

  const note = describeMidiNote(
    targetMidi,
    calibratedA4,
    forcedMidi !== null && forcedMidi !== undefined ? forcedSpelling : null
  );
  const cents = centsBetween(detectedHz, note.frequency);
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const absCents = Math.abs(cents);

  const wasSameNoteInTune =
    hysteresis?.previousMidi === targetMidi &&
    hysteresis?.previousDirection === 'in-tune';

  const activeTolerance = wasSameNoteInTune
    ? IN_TUNE_EXIT_HYSTERESIS_CENTS
    : IN_TUNE_TOLERANCE_CENTS;

  let direction: TuningDirection = 'in-tune';
  if (cents < -activeTolerance) {
    direction = 'flat';
  } else if (cents > activeTolerance) {
    direction = 'sharp';
  }

  return {
    detectedHz,
    targetHz: note.frequency,
    cents,
    clampedCents,
    direction,
    isNearCenter: absCents <= NEAR_TUNE_TOLERANCE_CENTS,
    note,
  };
}
