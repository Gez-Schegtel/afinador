// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Movimiento inteligente entre cuerdas (Alt + ↑ / ↓, Spec 013).
 * Recalcula el traste necesario en la cuerda destino para conservar la altura MIDI exacta;
 * si queda fuera de `[0, maxFret]`, mantiene la nota intacta y explica el motivo.
 */

import { spelledToMidi } from '../music/spelling';
import { computeNoteMidi, type ScoreNote, type ScoreTrack } from './model';

export type StringShiftResult =
  | { readonly ok: true; readonly note: ScoreNote }
  | { readonly ok: false; readonly reason: string };

/**
 * `deltaString`: `+1` hacia cuerda más aguda (`stringIndex + 1`, Alt+↑ en tablatura visual),
 * `-1` hacia cuerda más grave (`stringIndex - 1`, Alt+↓).
 */
export function shiftNoteToAdjacentString(
  note: ScoreNote,
  track: ScoreTrack,
  deltaString: -1 | 1,
  maxFret = 24
): StringShiftResult {
  if (track.isPercussion || track.tuning.length === 0) {
    return { ok: false, reason: 'Esta pista no usa trastes con afinación por cuerda.' };
  }

  const targetString = note.stringIndex + deltaString;
  if (targetString < 0 || targetString >= track.tuning.length) {
    return { ok: false, reason: 'No hay cuerda adyacente en esa dirección.' };
  }

  const srcOpen = track.tuning[note.stringIndex];
  const dstOpen = track.tuning[targetString];
  if (!srcOpen || !dstOpen) {
    return { ok: false, reason: 'Índice de cuerda inválido en la pista.' };
  }

  const targetFret = spelledToMidi(srcOpen) + note.fret - spelledToMidi(dstOpen);
  if (targetFret < 0 || targetFret > maxFret) {
    return {
      ok: false,
      reason: `Altura fuera del rango de trastes en esa cuerda (requeriría traste ${targetFret}).`,
    };
  }

  return {
    ok: true,
    note: {
      ...note,
      stringIndex: targetString,
      fret: targetFret,
      midi: computeNoteMidi(track.tuning, track.capo, targetString, targetFret),
    },
  };
}
