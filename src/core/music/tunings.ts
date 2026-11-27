/**
 * Catálogo de afinaciones por instrumento (Spec 002). Núcleo 100% puro.
 *
 * Cada afinación se guarda con nombres ESCRITOS (letra + alteración + octava) de la cuerda
 * más grave a la más aguda; los números MIDI se derivan de esa ortografía.
 */

import {
  formatSpelledNote,
  parseSpelledNote,
  spelledToMidi,
  type PitchName,
  type SpelledNote,
} from './spelling';

export type InstrumentId =
  | 'guitar6'
  | 'guitar7'
  | 'guitar8'
  | 'bass4'
  | 'bass5'
  | 'bass6';

export type InstrumentFamily = 'guitar' | 'bass';

export interface InstrumentDefinition {
  readonly id: InstrumentId;
  readonly family: InstrumentFamily;
  readonly stringCount: number;
  readonly label: string;
}

export const INSTRUMENTS: readonly InstrumentDefinition[] = [
  { id: 'guitar6', family: 'guitar', stringCount: 6, label: 'Guitarra de 6' },
  { id: 'guitar7', family: 'guitar', stringCount: 7, label: 'Guitarra de 7' },
  { id: 'guitar8', family: 'guitar', stringCount: 8, label: 'Guitarra de 8' },
  { id: 'bass4', family: 'bass', stringCount: 4, label: 'Bajo de 4' },
  { id: 'bass5', family: 'bass', stringCount: 5, label: 'Bajo de 5' },
  { id: 'bass6', family: 'bass', stringCount: 6, label: 'Bajo de 6' },
];

export const DEFAULT_INSTRUMENT_ID: InstrumentId = 'guitar6';

export type TuningGroup = 'standard' | 'drop' | 'open' | 'other';

export const TUNING_GROUP_ORDER: readonly TuningGroup[] = [
  'standard',
  'drop',
  'open',
  'other',
];

export const TUNING_GROUP_LABELS: Readonly<Record<TuningGroup, string>> = {
  standard: 'Estándar y bajadas',
  drop: 'Drop (cuerda grave un tono abajo)',
  open: 'Abiertas (acorde al aire)',
  other: 'Otras',
};

export interface TuningDefinition {
  readonly id: string;
  readonly instrument: InstrumentId;
  /** Nombre corto (se muestra en el selector). */
  readonly name: string;
  /** Descripción breve (se muestra en el resumen). Vacía si el nombre alcanza. */
  readonly description: string;
  readonly group: TuningGroup;
  /** Cuerdas de la más grave a la más aguda. */
  readonly notes: readonly SpelledNote[];
  /** Usa un juego de cuerdas distinto del estándar (no se compara tensión cuerda a cuerda). */
  readonly requiresDedicatedStrings: boolean;
}

function tuning(
  instrument: InstrumentId,
  slug: string,
  name: string,
  description: string,
  group: TuningGroup,
  notation: string,
  requiresDedicatedStrings: boolean = false
): TuningDefinition {
  return {
    id: `${instrument}-${slug}`,
    instrument,
    name,
    description,
    group,
    notes: notation.split(' ').map(parseSpelledNote),
    requiresDedicatedStrings,
  };
}

export const TUNINGS: readonly TuningDefinition[] = [
  // --- Guitarra 6 cuerdas ---
  tuning('guitar6', 'standard', 'Estándar', '', 'standard', 'E2 A2 D3 G3 B3 E4'),
  tuning('guitar6', 'half-down', 'E♭ estándar', 'Medio tono abajo', 'standard', 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4'),
  tuning('guitar6', 'whole-down', 'D estándar', 'Un tono abajo', 'standard', 'D2 G2 C3 F3 A3 D4'),
  tuning('guitar6', 'c-sharp-standard', 'C♯ estándar', 'Tono y medio abajo', 'standard', 'C#2 F#2 B2 E3 G#3 C#4'),
  tuning('guitar6', 'c-standard', 'C estándar', 'Dos tonos abajo', 'standard', 'C2 F2 Bb2 Eb3 G3 C4'),
  tuning('guitar6', 'drop-d', 'Drop D', '', 'drop', 'D2 A2 D3 G3 B3 E4'),
  tuning('guitar6', 'drop-c-sharp', 'Drop C♯', 'C♯ estándar con la 6ª un tono abajo', 'drop', 'C#2 G#2 C#3 F#3 A#3 D#4'),
  tuning('guitar6', 'drop-c', 'Drop C', 'D estándar con la 6ª un tono abajo', 'drop', 'C2 G2 C3 F3 A3 D4'),
  tuning('guitar6', 'drop-b', 'Drop B', 'C♯ estándar con la 6ª un tono abajo', 'drop', 'B1 F#2 B2 E3 G#3 C#4'),
  tuning('guitar6', 'double-drop-d', 'Doble Drop D', '6ª y 1ª un tono abajo', 'drop', 'D2 A2 D3 G3 B3 D4'),
  tuning('guitar6', 'open-d', 'Open D', 'Re mayor al aire', 'open', 'D2 A2 D3 F#3 A3 D4'),
  tuning('guitar6', 'open-d-minor', 'Open D menor', 'Re menor al aire', 'open', 'D2 A2 D3 F3 A3 D4'),
  tuning('guitar6', 'open-g', 'Open G', 'Sol mayor al aire', 'open', 'D2 G2 D3 G3 B3 D4'),
  tuning('guitar6', 'open-c', 'Open C', 'Do mayor al aire', 'open', 'C2 G2 C3 G3 C4 E4'),
  tuning('guitar6', 'open-e', 'Open E', 'Mi mayor al aire', 'open', 'E2 B2 E3 G#3 B3 E4'),
  tuning('guitar6', 'open-a', 'Open A', 'La mayor al aire', 'open', 'E2 A2 E3 A3 C#4 E4'),
  tuning('guitar6', 'dadgad', 'DADGAD', 'Dsus4 al aire', 'other', 'D2 A2 D3 G3 A3 D4'),
  // --- Guitarra 7 cuerdas ---
  tuning('guitar7', 'standard', 'Estándar', '', 'standard', 'B1 E2 A2 D3 G3 B3 E4'),
  tuning('guitar7', 'half-down', 'B♭ estándar', 'Medio tono abajo', 'standard', 'Bb1 Eb2 Ab2 Db3 Gb3 Bb3 Eb4'),
  tuning('guitar7', 'whole-down', 'A estándar', 'Un tono abajo', 'standard', 'A1 D2 G2 C3 F3 A3 D4'),
  tuning('guitar7', 'drop-a', 'Drop A', '', 'drop', 'A1 E2 A2 D3 G3 B3 E4'),
  // --- Guitarra 8 cuerdas ---
  tuning('guitar8', 'standard', 'Estándar', '', 'standard', 'F#1 B1 E2 A2 D3 G3 B3 E4'),
  tuning('guitar8', 'drop-e', 'Drop E', '', 'drop', 'E1 B1 E2 A2 D3 G3 B3 E4'),
  // --- Bajo 4 cuerdas ---
  tuning('bass4', 'standard', 'Estándar', '', 'standard', 'E1 A1 D2 G2'),
  tuning('bass4', 'half-down', 'E♭ estándar', 'Medio tono abajo', 'standard', 'Eb1 Ab1 Db2 Gb2'),
  tuning('bass4', 'whole-down', 'D estándar', 'Un tono abajo', 'standard', 'D1 G1 C2 F2'),
  tuning('bass4', 'drop-d', 'Drop D', '', 'drop', 'D1 A1 D2 G2'),
  tuning('bass4', 'drop-c', 'Drop C', 'D estándar con la 4ª un tono abajo', 'drop', 'C1 G1 C2 F2'),
  tuning('bass4', 'bead', 'BEAD', 'Las 4 cuerdas graves de un bajo de 5', 'other', 'B0 E1 A1 D2', true),
  // --- Bajo 5 cuerdas ---
  tuning('bass5', 'standard', 'Estándar', '', 'standard', 'B0 E1 A1 D2 G2'),
  tuning('bass5', 'half-down', 'B♭ estándar', 'Medio tono abajo', 'standard', 'Bb0 Eb1 Ab1 Db2 Gb2'),
  tuning('bass5', 'drop-a', 'Drop A', '', 'drop', 'A0 E1 A1 D2 G2'),
  tuning('bass5', 'eadgc', 'EADGC', 'Juego con Do agudo en lugar de Si grave', 'other', 'E1 A1 D2 G2 C3', true),
  // --- Bajo 6 cuerdas ---
  tuning('bass6', 'standard', 'Estándar', '', 'standard', 'B0 E1 A1 D2 G2 C3'),
];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((inst) => inst.id === value);
}

export function getInstrument(id: InstrumentId): InstrumentDefinition {
  return INSTRUMENTS.find((inst) => inst.id === id)!;
}

export function tuningsForInstrument(id: InstrumentId): TuningDefinition[] {
  return TUNINGS.filter((t) => t.instrument === id);
}

export function findTuning(id: string | null | undefined): TuningDefinition | undefined {
  return TUNINGS.find((t) => t.id === id);
}

export function standardTuningFor(id: InstrumentId): TuningDefinition {
  return findTuning(`${id}-standard`)!;
}

export function tuningMidis(t: TuningDefinition): number[] {
  return t.notes.map(spelledToMidi);
}

/** Número de cuerda (1 = la más aguda) para el índice `index` (0 = la más grave). */
export function stringNumber(t: TuningDefinition, index: number): number {
  return t.notes.length - index;
}

export function stringLabel(t: TuningDefinition, index: number): string {
  return `${stringNumber(t, index)}ª`;
}

export function formatTuningNotes(t: TuningDefinition): string {
  return t.notes.map(formatSpelledNote).join(' ');
}

export interface StringChange {
  readonly index: number;
  readonly stringNumber: number;
  readonly from: SpelledNote;
  readonly to: SpelledNote;
  readonly semitones: number;
}

/** Cuerdas que difieren de la afinación estándar del mismo instrumento. */
export function changesFromStandard(t: TuningDefinition): StringChange[] {
  const standard = standardTuningFor(t.instrument);
  const changes: StringChange[] = [];
  t.notes.forEach((note, index) => {
    const from = standard.notes[index]!;
    const semitones = spelledToMidi(note) - spelledToMidi(from);
    if (semitones !== 0) {
      changes.push({
        index,
        stringNumber: stringNumber(t, index),
        from,
        to: note,
        semitones,
      });
    }
  });
  return changes;
}

/**
 * Si todas las cuerdas se desplazan la misma cantidad de semitonos respecto de la estándar,
 * devuelve ese desplazamiento (0 = estándar); si no, null.
 */
export function uniformShiftFromStandard(t: TuningDefinition): number | null {
  const std = tuningMidis(standardTuningFor(t.instrument));
  const midis = tuningMidis(t);
  const shift = midis[0]! - std[0]!;
  return midis.every((m, i) => m - std[i]! === shift) ? shift : null;
}

/** true si alguna cuerda queda por encima de la estándar usando el mismo juego de cuerdas. */
export function raisesTension(t: TuningDefinition): boolean {
  if (t.requiresDedicatedStrings) return false;
  return changesFromStandard(t).some((c) => c.semitones > 0);
}

/** Ortografía de la cuerda cuyo MIDI coincide con `midi`, o null si no pertenece a la afinación. */
export function spellingForMidi(
  t: TuningDefinition,
  midi: number
): PitchName | null {
  const note = t.notes.find((n) => spelledToMidi(n) === Math.round(midi));
  return note ? { letter: note.letter, accidental: note.accidental } : null;
}

/** Valida valores persistidos y cae a la afinación estándar del instrumento si son inválidos. */
export function resolveTuningSelection(
  instrumentRaw: unknown,
  tuningRaw: unknown
): { instrument: InstrumentId; tuning: TuningDefinition } {
  const instrument = isInstrumentId(instrumentRaw)
    ? instrumentRaw
    : DEFAULT_INSTRUMENT_ID;
  const found =
    typeof tuningRaw === 'string' ? findTuning(tuningRaw) : undefined;
  const tuningDef =
    found && found.instrument === instrument
      ? found
      : standardTuningFor(instrument);
  return { instrument, tuning: tuningDef };
}
