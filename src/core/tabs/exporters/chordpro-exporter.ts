// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Exportador puro a ChordPro (`.cho`) y mapa de sincronización `.sync.json` (Spec 014).
 */

import { strToU8 } from 'fflate';
import { extractChordProFromDocument, formatChordProText } from '../../music/chordpro';
import { serializeSyncJson, type BeatSyncMap } from '../beat-sync';
import type { ScoreDocument } from '../model';

export function exportChordProString(doc: ScoreDocument, trackIndex = 0): string {
  return formatChordProText(extractChordProFromDocument(doc, trackIndex));
}

export function exportChordProBytes(doc: ScoreDocument, trackIndex = 0): Uint8Array {
  return strToU8(exportChordProString(doc, trackIndex));
}

export function exportSyncJsonBytes(map: BeatSyncMap): Uint8Array {
  return strToU8(serializeSyncJson(map));
}
