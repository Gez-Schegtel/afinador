// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Exportador puro a Guitar Pro moderno (`.gp`, contenedor GP7/GP8 ZIP + GPIF) (Spec 014).
 */

import * as alphaTab from '@coderline/alphatab/core';
import { documentToAlphaTabScore } from '../alphatab-bridge';
import type { ScoreDocument } from '../model';

export function exportGpBytes(doc: ScoreDocument): Uint8Array {
  const score = documentToAlphaTabScore(doc);
  const exporter = new alphaTab.exporter.Gp7Exporter();
  return exporter.export(score, new alphaTab.Settings());
}
