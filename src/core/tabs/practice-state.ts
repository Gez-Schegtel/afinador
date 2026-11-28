// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Lógica pura del Modo Práctica (Spec 009): transposición con ortografía teórica,
 * cálculo exacto de rangos de bucle A–B en ticks PPQ = 960, navegación en Setlists y búsqueda.
 */

import {
  defaultSharpPitchName,
  formatPitchName,
  formatSpelledNote,
  mod12,
  parsePitchName,
  spellMidi,
  spelledToMidi,
  type PitchName,
  type SpelledNote,
} from '../music/spelling';
import { type MasterBar, type ScoreTrack, type TrackFamily } from './model';
import { barCapacityTicks, ticksToNumberFloor } from './rhythm';

export const MIN_TRANSPOSITION_ST = -12;
export const MAX_TRANSPOSITION_ST = 12;

export function clampTranspositionSemitones(st: number): number {
  if (!Number.isFinite(st)) return 0;
  return Math.min(MAX_TRANSPOSITION_ST, Math.max(MIN_TRANSPOSITION_ST, Math.round(st)));
}

const FLAT_SCALE_NAMES: readonly PitchName[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
].map(parsePitchName);

/** Transpone una afinación manteniendo ortografía coherente (bemoles si baja, sostenidos si sube). */
export function transposeSpelledTuning(
  tuning: readonly SpelledNote[],
  semitones: number
): SpelledNote[] {
  const shift = clampTranspositionSemitones(semitones);
  if (shift === 0) return [...tuning];
  return tuning.map((note) => {
    const newMidi = spelledToMidi(note) + shift;
    const pitch =
      shift < 0 ? FLAT_SCALE_NAMES[mod12(newMidi)]! : defaultSharpPitchName(newMidi);
    return spellMidi(newMidi, pitch);
  });
}

export function formatEffectiveTuningLabel(
  tuning: readonly SpelledNote[],
  capo: number,
  transpositionSemitones: number
): string {
  if (tuning.length === 0) return 'Sin cuerdas';
  const totalShift = capo + clampTranspositionSemitones(transpositionSemitones);
  const effective = transposeSpelledTuning(tuning, totalShift);
  const compact = effective.map((n) => formatPitchName(n)).join('');
  const detailed = effective.map(formatSpelledNote).join(' ');
  const suffix =
    transpositionSemitones !== 0
      ? ` (${transpositionSemitones > 0 ? `+${transpositionSemitones}` : transpositionSemitones} st)`
      : '';
  const capoLabel = capo > 0 ? ` · Capo ${capo}` : '';
  return `${compact}${capoLabel}${suffix} · ${detailed}`;
}

export function effectiveBpmAtSpeed(baseBpm: number, speedPct: number): number {
  return Math.round(baseBpm * (speedPct / 100) * 10) / 10;
}

export interface TickRange {
  readonly startTick: number;
  readonly endTick: number;
  readonly startBarIndex: number;
  readonly endBarIndex: number;
}

/** Convierte índices de compás (0-based, inclusivos) al rango exacto en ticks para `alphaTab`. */
export function computeLoopTickRange(
  masterBars: readonly MasterBar[],
  rawStartBar: number,
  rawEndBar: number
): TickRange | null {
  if (masterBars.length === 0) return null;
  const maxIdx = masterBars.length - 1;
  const clampedA = Math.max(0, Math.min(maxIdx, Math.trunc(rawStartBar)));
  const clampedB = Math.max(0, Math.min(maxIdx, Math.trunc(rawEndBar)));
  const startBarIndex = Math.min(clampedA, clampedB);
  const endBarIndex = Math.max(clampedA, clampedB);

  let tickCursor = 0;
  let startTick = 0;
  let endTick = 0;

  masterBars.forEach((mb, i) => {
    const cap = ticksToNumberFloor(
      barCapacityTicks(mb.timeSignature.numerator, mb.timeSignature.denominator)
    );
    if (i === startBarIndex) startTick = tickCursor;
    tickCursor += cap;
    if (i === endBarIndex) endTick = tickCursor;
  });

  return { startTick, endTick, startBarIndex, endBarIndex };
}

export function pickTrackIndexForInstrumentFilter(
  tracks: readonly ScoreTrack[],
  filter: TrackFamily | 'all'
): number {
  if (tracks.length === 0 || filter === 'all') return 0;
  const idx = tracks.findIndex((t) => t.family === filter);
  return idx >= 0 ? idx : 0;
}

export function resolveSetlistAdjacent(
  docIds: readonly string[],
  currentDocId: string,
  direction: -1 | 1
): string | null {
  if (docIds.length <= 1) return null;
  const idx = docIds.indexOf(currentDocId);
  if (idx < 0) return null;
  const nextIdx = idx + direction;
  return nextIdx >= 0 && nextIdx < docIds.length ? (docIds[nextIdx] ?? null) : null;
}

export function matchesFuzzyQuery(
  fields: readonly string[],
  query: string
): boolean {
  const tokens = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return tokens.every((tok) => haystack.includes(tok));
}
