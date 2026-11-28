// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Puente puro de Modo Guiado desde Tablatura hacia el Afinador real (`MPMDetector + QIFFT`) (Spec 012).
 * Permite afinar cualquier pista (estándar o personalizada de tablatura) sin sobrescribir las
 * preferencias permanentes del catálogo de Spec 002.
 */

import type { ChromaticMatch } from './notes';
import { formatSpelledNote, spelledToMidi, type SpelledNote } from './spelling';

export interface GuidedTuningSession {
  readonly docId: string;
  readonly songTitle: string;
  readonly trackName: string;
  readonly tuning: readonly SpelledNote[];
  readonly capo: number;
  readonly activeStringIndex: number;
  readonly completedStrings: readonly boolean[];
}

export function createGuidedTuningSession(params: {
  docId: string;
  songTitle: string;
  trackName: string;
  tuning: readonly SpelledNote[];
  capo?: number;
}): GuidedTuningSession {
  return {
    docId: params.docId,
    songTitle: params.songTitle,
    trackName: params.trackName,
    tuning: [...params.tuning],
    capo: Math.max(0, Math.min(12, Math.trunc(params.capo ?? 0))),
    activeStringIndex: 0,
    completedStrings: params.tuning.map(() => false),
  };
}

export function effectiveGuidedStringMidi(
  session: GuidedTuningSession,
  stringIndex: number
): number {
  const note = session.tuning[stringIndex];
  if (!note) return 40;
  return spelledToMidi(note) + session.capo;
}

export function guidedStringLabel(
  session: GuidedTuningSession,
  stringIndex: number
): string {
  const nStrings = session.tuning.length;
  const note = session.tuning[stringIndex];
  const stringNum = nStrings - stringIndex;
  return note ? `${stringNum}ª · ${formatSpelledNote(note)}` : `${stringNum}ª`;
}

export function applyGuidedTuneReading(
  session: GuidedTuningSession,
  match: ChromaticMatch | null,
  isHolding: boolean
): GuidedTuningSession {
  if (!match || !isHolding || match.direction !== 'in-tune') return session;
  const targetMidi = effectiveGuidedStringMidi(session, session.activeStringIndex);
  if (match.note.midi !== targetMidi) return session;
  if (session.completedStrings[session.activeStringIndex]) return session;

  const updated = session.completedStrings.map((done, i) =>
    i === session.activeStringIndex ? true : done
  );
  return {
    ...session,
    completedStrings: updated,
  };
}

let activeGuidedSession: GuidedTuningSession | null = null;

export function setActiveGuidedSession(session: GuidedTuningSession | null): void {
  activeGuidedSession = session;
}

export function getActiveGuidedSession(): GuidedTuningSession | null {
  return activeGuidedSession;
}
