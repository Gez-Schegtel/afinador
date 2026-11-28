// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Exportador puro a formato textual alphaTex (`.alphatex`) (Spec 014).
 */

import * as alphaTab from '@coderline/alphatab/core';
import { strFromU8 } from 'fflate';
import { documentToAlphaTabScore } from '../alphatab-bridge';
import type { ScoreDocument } from '../model';

export function exportAlphaTexBytes(doc: ScoreDocument): Uint8Array {
  const score = documentToAlphaTabScore(doc);
  const exporter = new alphaTab.exporter.AlphaTexExporter();
  return exporter.export(score, new alphaTab.Settings());
}

export function exportAlphaTexString(doc: ScoreDocument): string {
  return strFromU8(exportAlphaTexBytes(doc));
}
