export const MIN_A4_HZ = 415;
export const MAX_A4_HZ = 466;
export const DEFAULT_A4_HZ = 440;
export const QUICK_A4_PRESETS = [430, 432, 440, 442, 444] as const;

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

export type TuningDirection = 'flat' | 'in-tune' | 'sharp';

export interface NoteDescriptor {
  midi: number;
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
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

export function describeMidiNote(
  midi: number,
  a4Hz: number = DEFAULT_A4_HZ
): NoteDescriptor {
  const roundedMidi = Math.round(midi);
  const noteIndex = ((roundedMidi % 12) + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;
  const spec = CHROMATIC_SCALE[noteIndex]!;

  return {
    midi: roundedMidi,
    letter: spec.letter,
    isSharp: spec.isSharp,
    name: spec.displayName,
    latinName: spec.latinName,
    octave,
    fullName: `${spec.displayName}${octave}`,
    frequency: midiToFrequency(roundedMidi, a4Hz),
  };
}

/**
 * Resuelve la nota cromática aplicando histéresis de pedal (Schmitt trigger) tanto en
 * la frontera entre semitonos como en el bloqueo de estado AFINADO.
 */
export function resolveChromaticNote(
  detectedHz: number,
  a4Hz: number = DEFAULT_A4_HZ,
  hysteresis?: HysteresisContext
): ChromaticMatch {
  const calibratedA4 = clampA4(a4Hz);
  const midiFloat = frequencyToMidiFloat(detectedHz, calibratedA4);

  let targetMidi = Math.round(midiFloat);
  if (
    hysteresis?.previousMidi !== null &&
    hysteresis?.previousMidi !== undefined &&
    Math.abs(midiFloat - hysteresis.previousMidi) <=
      NOTE_SWITCH_HYSTERESIS_SEMITONES
  ) {
    targetMidi = hysteresis.previousMidi;
  }

  const note = describeMidiNote(targetMidi, calibratedA4);
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
